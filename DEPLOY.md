# 모두모두 경매몰 — Vercel + Supabase 배포 가이드

이 문서는 **Cloudflare Pages/D1 → Vercel + Supabase(PostgreSQL)** 마이그레이션 후
실제 운영 배포를 위한 단계별 안내입니다.

---

## 0. 사전 준비물
- Vercel Pro 계정 (가입 완료)
- Supabase Pro 계정 (가입 완료)
- GitHub 저장소: https://github.com/ggf922/modoo-action

---

## 1. Supabase — 데이터베이스 설정

### 1-1. 프로젝트 생성
1. https://supabase.com/dashboard → **New project**
2. 이름: `modoo-action` (또는 자유), Region: **Northeast Asia (Seoul)** 권장
3. **Database Password**를 안전하게 저장 (연결 문자열에 사용)

### 1-2. 스키마 생성
1. 좌측 메뉴 → **SQL Editor** → **New query**
2. 저장소의 `supabase/schema.sql` 내용을 **그대로 복사**해 붙여넣고 **Run**
3. 8개 테이블 + 관리자 계정 + 사이트 설정이 생성됩니다 (멱등 — 여러 번 실행해도 안전)
4. **이어서 `supabase/0008_scale_indexes.sql` 도 복사해 붙여넣고 Run** (대규모 트래픽 대비
   복합 인덱스 + `products.participantCount` 비정규화 컬럼 추가, 멱등). 이미 운영 중인 DB에도
   안전하게 적용되며 기존 참여수를 자동 백필합니다.

> 생성되는 관리자 계정: **아이디 `admin` / 비밀번호 `admin123`**
> ⚠️ 운영 시작 전 반드시 비밀번호를 변경하세요 (아래 5번 참고)

### 1-3. 연결 문자열(DATABASE_URL) 확보 — ⭐가장 중요 (IPv4 필수)
1. 상단 초록색 **Connect** 버튼 → **Connection String** 탭
2. ⚠️ **반드시 `SHARED POOLER`(Session Pooler)** 의 주소를 복사하세요.
   - 호스트 형식: `aws-1-ap-northeast-2.pooler.supabase.com` (리전에 따라 `aws-0`/`aws-1` 등)
   - 사용자: `postgres.<project-ref>` (예: `postgres.dmdetopxciqstzlznwwc`)
   - 전체 형식: `postgresql://postgres.<ref>:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`
3. `[PASSWORD]` 부분을 1-1에서 저장한 DB 비밀번호로 교체

> 🚨 **DEDICATED POOLER(`db.<ref>.supabase.co`)는 절대 사용 금지!**
> 이 호스트는 **IPv6 전용**이며, Vercel 서버리스 함수는 IPv6 아웃바운드를 지원하지 않아
> `getaddrinfo ENOTFOUND` 에러로 모든 DB 쿼리가 500 실패합니다.
> **반드시 `...pooler.supabase.com`(Shared/Session Pooler, IPv4 프록시)** 주소를 쓰세요.
>
> 본 앱은 `prepare: false` 로 설정되어 있어 Session(5432)·Transaction(6543) 풀러 모두 호환됩니다.
>
> 💡 **대규모 동시접속(수천~1만) 대비: Transaction Pooler(포트 `6543`) 권장.**
> Connect 화면에서 **Transaction Pooler** 주소(`...pooler.supabase.com:6543`)를 쓰면
> 짧은 트랜잭션 단위로 연결을 재활용해 동시 처리량이 Session(5432)보다 훨씬 큽니다.
> 형식: `postgresql://postgres.<ref>:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`
> (앱이 `:6543` 을 자동 감지해 풀 설정을 최적화합니다.)

---

## 2. Vercel — 프로젝트 연결 및 환경변수

### 2-1. 프로젝트 임포트
1. https://vercel.com/new → **Import Git Repository**
2. `ggf922/modoo-action` 선택 → **Import**
3. Framework Preset: **Other** (자동 감지됨), Root Directory: 그대로 두기
4. **Deploy 누르기 전에 환경변수부터 설정** (2-2)

### 2-2. 환경변수 (Settings → Environment Variables)
| 이름 | 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | 1-3에서 만든 Transaction Pooler 연결 문자열 | **필수** |
| `JWT_SECRET` | 강력한 랜덤 문자열 (아래 명령으로 생성) | **필수** |

JWT_SECRET 생성:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> 세 환경 모두(Production / Preview / Development)에 동일하게 추가하세요.

### 2-3. 배포
- 환경변수 저장 후 **Deployments** 탭 → 최신 커밋 **Redeploy**
- 또는 로컬에서: `npm run deploy` (`vercel --prod`)
- 완료되면 `https://modoo-action.vercel.app` (또는 할당된 도메인)에서 접속

---

## 3. 배포 후 동작 확인
1. `https<배포주소>/` → 첫 화면(SPA) 로딩 확인
2. 관리자 로그인: 아이디 `admin` / 비밀번호 `admin123`
3. 관리자 → 상품 등록 → 정상 저장되는지 확인
4. 회원가입 테스트 → 추천코드 `ADMIN001` 로 가입 시 추천 보너스 적립 확인

---

## 4. 커스텀 도메인 (선택)
1. Vercel → 프로젝트 → **Settings → Domains** → 도메인 입력
2. 안내되는 DNS 레코드(A/CNAME)를 도메인 등록기관에 추가
3. SSL 자동 발급 (수 분 소요)

---

## 5. ⚠️ 운영 보안 체크리스트 (배포 직후 반드시)
1. **관리자 비밀번호 변경**
   - 새 bcrypt 해시 생성:
     ```bash
     node -e "import('bcryptjs').then(b=>console.log(b.default.hashSync('새비밀번호',10)))"
     ```
   - Supabase SQL Editor에서:
     ```sql
     UPDATE users SET password = '<생성된해시>' WHERE id = 'u-admin';
     ```
2. **JWT_SECRET** 이 강력한 랜덤 값인지 확인 (2-2)
3. Supabase **Row Level Security**: 본 앱은 서버(서비스 롤)에서만 DB 접근하므로 anon 키를 클라이언트에 노출하지 않습니다. `DATABASE_URL` 만으로 충분합니다.

---

## 6. 로컬 개발 (선택)
```bash
npm install
# .env.local 파일에 DATABASE_URL, JWT_SECRET 설정 후
npx vercel dev        # http://localhost:3000
```
또는 로컬 PostgreSQL을 띄워 `DATABASE_URL=postgres://...@localhost:5432/modoo` 로 테스트.

---

## 부록 — 마이그레이션 기술 요약
- **프레임워크**: Hono (Cloudflare/Vercel 양쪽 호환) — 유지
- **DB 드라이버**: `postgres` (postgres.js), 서버리스 설정 `max:1, prepare:false`
- **D1 호환 어댑터**(`src/lib/db.ts`): 기존 190여 곳의 `DB.prepare().bind().first/all/run`, `DB.batch([...])` 호출을 **수정 없이** PostgreSQL로 연결
- **SQL 자동 변환**: `?`→`$1,$2`, `datetime('now')`→`now()`, `LIKE`→`ILIKE`, camelCase 컬럼→`"큰따옴표"`
- **진입점**: `api/index.ts` (`app.fetch(req, env)` 로 DB/JWT 주입), `vercel.json` 으로 라우팅
- **정적 파일**: `public/static/*` → Vercel이 `/static/*` 로 자동 서빙

---

## 7. 📈 대규모 트래픽 운영 가이드 (목표: 동시접속 1만 / 누적 50만)

### 적용된 확장성 최적화 (이번 릴리스)
- **`products.participantCount` 비정규화 컬럼**: 목록 조회 시 `bids` COUNT 서브쿼리 제거 → 단일 인덱스 스캔.
- **복합 인덱스**(`supabase/0008_scale_indexes.sql`): `products(status,sortOrder,createdAt)`, `bids(productId,createdAt)`, `point_history(userId,createdAt)` 등.
- **인메모리 TTL 캐시**(`src/lib/cache.ts`): 공개 상품목록 3초, 공개 설정 30초 캐싱 → DB 직격 대폭 감소. 쓰기 시 자동 무효화.
- **BIGINT number 파싱**: postgres.js 가 BIGINT 를 number 로 반환하도록 설정(포인트 비교 버그 방지).
- **동시성 정원 가드**: 입찰 시 `participantCount < maxParticipants` 조건부 UPDATE + 트랜잭션 롤백(`requireRows`) → 정원 초과/중복 차감 원천 차단.

### 운영 권장 설정
1. **DATABASE_URL 은 Transaction Pooler(`:6543`)** 사용 (1-3 참고).
2. **Supabase Pro Compute** 단계 상향: 동접이 수천을 넘으면 Supabase 대시보드 → Settings → Compute & Disk 에서 인스턴스 크기를 올려 `max_connections` 와 풀러 용량을 확보.
3. **Vercel Function 리전**을 Supabase 리전(ap-northeast-2, 서울)과 동일하게 설정 → DB 왕복 지연 최소화.

### 예상 수용량 (단계별)
| 단계 | 동시접속 | 누적회원 | 필요 조치 |
|------|---------|---------|-----------|
| 현재 릴리스 | ~500 | ~30만 | 0008 마이그레이션 적용 + Transaction Pooler |
| +Compute 상향 | ~2,000 | ~50만 | Supabase Compute Small→Large |
| +읽기 캐시 강화 | ~10,000 | 100만+ | 캐시 TTL 조정/엣지 캐시, 경매 마감 분산 |

> 누적 회원 50만은 저장 용량상 전혀 문제 없습니다(약 250MB). 핵심은 **경매 마감 순간의 동시 입찰 처리**이며, 위 정원 가드 + 비정규화로 정합성이 보장됩니다.
