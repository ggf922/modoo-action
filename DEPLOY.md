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

> 생성되는 관리자 계정: **아이디 `admin` / 비밀번호 `admin123`**
> ⚠️ 운영 시작 전 반드시 비밀번호를 변경하세요 (아래 5번 참고)

### 1-3. 연결 문자열(DATABASE_URL) 확보 — ⭐가장 중요
1. 좌측 하단 **Project Settings** → **Database**
2. **Connection string** 섹션에서 **Connection pooling** 탭 선택
3. **Transaction** 모드(포트 **6543**)의 URI를 복사 (서버리스용 — 필수!)
   - 형식: `postgresql://postgres.xxxxxxxx:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`
4. `[PASSWORD]` 부분을 1-1에서 저장한 DB 비밀번호로 교체

> **반드시 포트 6543(Transaction Pooler)** 을 사용하세요.
> 5432(Direct) 는 서버리스(Vercel Functions)에서 연결이 고갈됩니다.

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
