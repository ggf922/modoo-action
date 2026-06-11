# 모두모두 🎁 경매몰 (ModooModoo Auction Mall)

세계 최초 **"전원 수익형"** 공동 구매 경매 쇼핑몰 MVP — 낙찰자는 시중가보다 저렴하게 자동 구매하고, 미낙찰자는 보상 포인트를 받는, 모든 참여자가 이익을 보는 구조의 경매 플랫폼입니다.

## 📌 프로젝트 개요
- **이름**: 모두모두 경매몰
- **목표**: 낙찰자 / 미낙찰자 / 추천인 모두가 이익을 보는 경매형 쇼핑몰
- **핵심 가치**: 초저가 자동구매 · 미당첨 보상 포인트 · 추천 조직도 + 4종 포인트

> ⚙️ **기술 스택 안내 (옵션 B)**: 본래 요청은 Next.js + Prisma + PostgreSQL 이었으나,
> 단계별 "라이브 동작 시연"과 "전체 플로우 테스트"를 우선하기 위해 **엣지 친화 스택**으로 기능 동일 재구성했습니다.
> 비즈니스 로직, 화면 명세, 디자인 가이드, 시드 데이터는 요청서 그대로 100% 구현되어 있습니다.

## 🌐 URL
- **개발 서버 (현재)**: https://3000-inc6chu1vd00bmb8odq4g-ad490db5.sandbox.novita.ai
- **프로덕션**: 미배포 (Cloudflare Pages 배포 준비 완료)

## 🛠️ 기술 스택 (실제 구현)
| 영역 | 요청(Next.js 계열) | 실제 구현(엣지 동일 기능) |
|---|---|---|
| 백엔드 | Next.js API Routes | **Hono** (Cloudflare Workers) |
| DB | Prisma + PostgreSQL | **Cloudflare D1** (SQLite) + SQL 마이그레이션 |
| 인증 | NextAuth.js | **JWT(jose) + bcryptjs** 쿠키 세션 |
| 프론트 | React + shadcn/ui | **SPA(Vanilla JS) + TailwindCSS(CDN)** |
| 조직도 | React Flow | **커스텀 SVG 트리** (재귀 레이아웃) |
| 차트 | - | **Chart.js** (CDN) |
| 애니메이션 | Framer Motion | **CSS Keyframes** (pop/confetti/slot) |

## 🗄️ 데이터 모델 (Cloudflare D1)
- **users**: 회원(4종 포인트, 추천관계, 계좌, role)
- **products**: 경매 상품(시중가/시작가/참가비/정원/당첨자수/미당첨보상/상태/**sortOrder**) — `imageUrl`은 TEXT(외부 URL 또는 압축 Base64 이미지 저장), `sortOrder`로 노출 순서 제어
- **bids**: 참여(userId+productId UNIQUE, isWinner)
- **winners**: 당첨자(낙찰가 finalPrice)
- **point_history**: 포인트 내역(type 6종 × pointKind 3종)
- **withdrawals**: 출금 신청(PENDING/APPROVED/REJECTED/COMPLETED)
- **site_config**: 전역 설정(기본 당첨자/미당첨보상/최소출금/추천보너스)

### 4종 포인트
| 포인트 | 컬럼 | 용도 | 충전 | 출금 |
|---|---|---|---|---|
| 경매 참여 포인트 | `auctionPoint` | 경매 참가비 사용 | ✅ | ❌ |
| 잔액 포인트 | `balancePoint` | 미당첨 보상 누적 | ❌ | ✅ |
| 임금 포인트 | `wagePoint` | 추천 수당 적립 | ❌ | ✅ |
| 총 보유 포인트 | (합계) | 위 3종 합산 표시 | - | - |

## 🧩 핵심 비즈니스 로직
1. **경매 참여 (트랜잭션)**: 포인트 검증 → 중복/정원 차단 → 차감 + Bid 생성 + 내역 기록 → 정원 도달 시 `drawWinners()` 자동 호출
2. **추첨**: Fisher-Yates 셔플 → 앞 `winnersCount`명 당첨 → 당첨자 Winner 생성 + 자동구매 / 미당첨자 `losingReward` 지급 → status=DRAWN
3. **추천 보너스**: 가입 시 추천코드 검증 → 신규회원 고유코드(8자리 대문자) 발급 → 추천인 `wagePoint += referralBonus`
   - **추천코드 미입력 시 회사(관리자)를 추천인으로 자동 적용** (조직도 단절 방지, 회사 추천 보너스 지급)
4. **조직도**: 본인 루트로 산하 최대 5단계 BFS 조회 (상위 추천인 절대 비노출)
   - **관리자 전체 조직도**: 회사(관리자) 루트 기준 전 회원 추천인 계보도 SVG 트리
5. **회원 관리(관리자)**: 정보 수정(이름/닉네임/이메일/연락처/추천인 변경 — 순환참조 방지) · 삭제(하위 회원은 삭제 회원의 추천인에게 자동 승계, 관리자 계정 삭제 차단)
6. **상품 등록/수정(관리자)**: 시중가(취소선)·시작가 직접 입력 + 할인율 실시간 미리보기 · **참가비는 시작가와 동일하게 자동 책정**(입력칸 제거) · **상세 이미지 로컬 업로드**(브라우저 Canvas 자동 압축: 가로 800px · JPEG 품질 80% → Base64 저장)
5. **출금**: 잔액+임금 합계에서 차감, 최소 금액 검증, PENDING → 관리자 승인 시 차감 + COMPLETED

## 📱 화면 라우트 (해시 기반 SPA)
| 경로 | 화면 | 권한 |
|---|---|---|
| `#/` | 메인(진행중 경매 그리드) | Guest |
| `#/auth/login` | 로그인(+비밀번호 찾기 링크) | Guest |
| `#/auth/register` | 회원가입(추천코드 자동기입 `?ref=CODE`) | Guest |
| `#/auth/forgot` | 비밀번호 찾기(본인확인 후 재설정) | Guest |
| `#/products/:id` | 상품 상세 + 참여자 게이지 | Guest |
| `#/mypage` | 마이페이지(4종 포인트 카드) | Member |
| `#/mypage/charge` | 포인트 충전(입금계좌 안내 + 충전 요청/내역) | Member |
| `#/mypage/withdraw` | 출금 신청 + 계좌등록 | Member |
| `#/mypage/history` | 포인트 내역(필터) | Member |
| `#/mypage/bids` | 내 참여 내역(당첨/미당첨 탭) | Member |
| `#/mypage/network` | 내 조직도(SVG 트리) | Member |
| `#/mypage/password` | 비밀번호 변경 | Member |
| `#/admin` | 관리자 대시보드(KPI+차트) | Admin |
| `#/admin/products` | 상품 목록/순서변경(▲▼)/강제추첨/삭제 | Admin |
| `#/admin/products/new` | 상품 등록(가격 직접입력 + 이미지 업로드) | Admin |
| `#/admin/products/:id/edit` | 상품 수정 | Admin |
| `#/admin/members` | 회원 관리(검색+상세+포인트 조정+수정/삭제) | Admin |
| `#/admin/network` | 전체 조직도(추천인 계보도 SVG 트리) | Admin |
| `#/admin/charges` | 충전 요청 승인/거절(포인트 지급) | Admin |
| `#/admin/withdrawals` | 출금 승인/거절 | Admin |
| `#/admin/config` | 사이트 전역 설정 | Admin |

## 🔌 주요 API 엔드포인트
- `POST /api/auth/register | login | logout`, `GET /api/auth/me`
- `POST /api/auth/reset-password` (비밀번호 찾기 — 이메일/아이디+이름+휴대폰 본인확인 후 재설정)
- `POST /api/auth/change-password` (로그인 상태에서 현재 비밀번호 확인 후 변경)
- `GET /api/products`, `GET /api/products/:id`, `POST /api/products/:id/join`
- `POST /api/me/charge`(충전 **요청** 생성 — 입금자명 필수), `GET /api/me/charge-requests`(내 충전요청 내역)
- `POST /api/me/withdraw`(출금 — **예금주명=회원이름 일치 검증**), `POST /api/me/bank`, `GET /api/me/history | bids | withdrawals | network`
- `GET /api/admin/charge-requests`, `POST /api/admin/charge-requests/:id/process`(승인 시 경매P 지급+내역 기록)
- `GET /api/admin/stats`, 상품 CRUD `/api/admin/products`, `POST /api/admin/products/:id/draw`
- `POST /api/admin/products/:id/move` (상품 노출 순서 변경 — `{direction:'up'|'down'}`, 인접 상품과 sortOrder 교환)
- `GET /api/admin/members`, `GET /api/admin/members/:id`, `POST /api/admin/members/:id/adjust`
- `PUT /api/admin/members/:id` (정보/추천인 수정), `DELETE /api/admin/members/:id` (삭제+하위 승계)
- `GET /api/admin/network` (전체 조직도 — 회사 루트 추천인 계보도)
- `GET /api/admin/withdrawals`, `POST /api/admin/withdrawals/:id/process`
- `GET|PUT /api/admin/config`, `PATCH /api/admin/products/:id/settings` (상품별 빠른 설정)

## 🔑 계정
| 구분 | 아이디/이메일 | 비밀번호 | 비고 |
|---|---|---|---|
| 👑 관리자 | `admin` | `admin123` | 아이디 로그인 · 추천코드 ADMIN001 |
| 👤 회원 | `user1@test.com` ~ `user6@test.com` | `Test1234!` | 경매 포인트 지급 |

> 로그인 화면은 **이메일 또는 아이디** 입력을 받습니다. 관리자는 아이디 `admin` / 비밀번호 `admin123` 으로 로그인합니다.
>
> ⚠️ **프로덕션에서 관리자 로그인이 안 될 때**: 프로덕션 D1에 최신 계정이 없을 수 있습니다. 마이그레이션 `0003_ensure_admin_account.sql` 이 `admin`/`admin123` 계정을 멱등(INSERT OR IGNORE)으로 보장하므로, 배포 시 `npx wrangler d1 migrations apply webapp-production` 를 실행하면 관리자 계정이 자동 생성됩니다.

**추천 관계**: admin → user1 → (user2, user3), user2 → (user4, user5), user3 → user6
**시드 상품 5개**: 갤럭시 버즈 프로 / 스타벅스 텀블러 / 다이슨 V12 / 한우 등심 / 에어팟 프로 2
(상품1 "갤럭시 버즈 프로"에 user1~3이 사전 참여 중)

## 🎯 데모 시나리오
1. **관리자 플로우**: `admin`/`admin123` 로그인 → `#/admin` 대시보드 → 상품 등록 → **상품 순서 변경(▲▼)** → 회원 **상세 보기** → 정보 수정/포인트 조정/삭제 → 출금 승인
2. **회원 플로우**: user1 로그인 → 경매 참여 → 마이페이지 4종 포인트 확인 → `#/mypage/network` 조직도 확인
3. **자동 추첨 확인**: 정원이 작은 상품을 만들어 정원을 채우면 자동 추첨 → 당첨/미당첨 모달 연출

## 🚀 로컬 실행 방법
```bash
npm install
npm run db:migrate:local   # D1 로컬 마이그레이션
npm run db:seed            # 시드 데이터
npm run build              # Vite 빌드
pm2 start ecosystem.config.cjs   # 서버 시작 (포트 3000)
# 또는: npm run dev:sandbox

# DB 초기화(시드 재적용)
npm run db:reset
```

## ✅ 완료된 기능
- 회원가입(추천코드 검증/보너스 지급, **추천코드 미입력 시 회사(관리자) 자동 추천**) · 로그인/로그아웃 · JWT 세션
- 메인/상품카드/참여자 게이지(👤 10개 점등 + 진행바)
- 경매 참여(트랜잭션) + 정원 도달 자동 추첨 + 당첨/미당첨 모달(슬롯/폭죽)
- 마이페이지 4종 포인트 카드 · **충전 요청(입금→관리자승인)** · 출금 신청/계좌등록 · 포인트 내역(필터) · 참여 내역(탭)
- 조직도 SVG 트리(본인 산하 5단계, 상위 비노출) + 노드 활동 요약 패널
- 관리자: 대시보드(KPI+차트) · 상품 CRUD/강제추첨 · 회원 검색/포인트 조정/**정보 수정·삭제** · **전체 조직도(추천인 계보도 SVG 트리)** · 출금 승인
- **관리자 아이디 로그인**: 데모 계정 안내 박스 제거, 로그인 입력을 **이메일 또는 아이디**로 변경, 관리자는 **아이디 `admin` / 비밀번호 `admin123`** 으로 로그인
- **회원 상세 보기(관리자)**: 회원 목록에 "상세" 버튼 추가 → 회원가입 시 입력한 모든 항목을 **항목별로 정리**(가입 정보: 이메일/아이디·이름·닉네임·휴대폰·내 추천코드·추천인·가입일시 / 보유 포인트: 경매P·잔액P·임금P / 출금 계좌: 은행·계좌번호·예금주) · 상세 모달에서 바로 **수정/포인트조정/삭제** 가능(관리자 계정은 삭제 버튼 숨김)
- **상품 노출 순서 변경(관리자)**: 상품 목록의 ▲▼ 버튼으로 고객에게 보이는 노출 순서를 조정(`sortOrder` 컬럼 + 인접 상품 교환). 공개 상품 목록·관리자 목록 모두 `sortOrder ASC` 기준 정렬, 신규 상품은 맨 뒤로 자동 배치
- **추천 링크 복사**: 마이페이지에 **"추천코드 복사"**(코드만)와 **"추천 링크 복사"**(가입 URL) 버튼을 분리. 링크(`/#/auth/register?ref=CODE`)로 가입하면 회원가입 화면의 추천코드가 **자동 기입**되고 해당 추천인이 연결됨(비보안 컨텍스트 폴백 복사 지원)
- **비밀번호 찾기**: 로그인 화면 "비밀번호를 잊으셨나요?" → 이메일/아이디+이름+휴대폰 본인확인 후 새 비밀번호로 즉시 재설정(MVP — 이메일 발송 인프라 미구축)
- **비밀번호 변경(마이페이지)**: `#/mypage/password` — 현재 비밀번호 확인 → 새 비밀번호(6자 이상, 기존과 동일 불가) 변경
- 상품 등록: **시중가(취소선)·시작가 직접 입력** + 할인율 실시간 미리보기 · **참가비 시작가 자동 책정**(참가비 입력칸 제거) · **상세 이미지 로컬 업로드 + 자동 압축**(800px/JPEG 80% → Base64)
- **참가비 = 시작가 일원화**: 상품 카드/상세/참여내역에서 별도 "참가비" 표시 제거(시작가만 노출), 경매 참여 시 차감 포인트 = 시작가. 시드 상품도 entryFee=startPrice로 정렬, 데모 회원 보유 포인트 상향(고가 상품 참여 가능)
- **상품 이미지 800×800 정사각 통일**: 카드/상세 모두 `aspect-square`로 표시, 관리자 업로드 시 어떤 비율이든 **중앙 기준 정사각 cover 크롭 → 800×800 · JPEG 80%** 자동 변환
- **경매 참여 즉시 차감 + 잔액 부족 안내**: 참여 시 보유 포인트에서 시작가만큼 즉시 차감(서버 트랜잭션). 잔액 부족 시 참여 버튼 클릭 단계에서 **필요/보유/부족 포인트를 표시하는 모달 + 충전하기 버튼** 노출
- 설정 페이지: **전역 기본값**(신규 상품 등록 시 당첨자수·미당첨보상 자동 적용) + **상품별 개별 빠른 설정 테이블**(당첨자수·미당첨보상·정원 인라인 수정)
- **포인트 충전 요청/승인 (입금 기반)**: 회원이 지정 입금계좌(**케이뱅크 100-300-095256 · 예금주 큰바구니(임몽규)**)로 입금 후 마이페이지 `#/mypage/charge`에서 금액·입금자명을 넣어 **충전 요청** → 관리자 `#/admin/charges`에서 입금 확인 후 **승인** 시 회원에게 경매 포인트 지급(+내역 기록). 요청 상태(승인 대기/충전 완료/거절) 표시. 관리자 대시보드에 **대기 충전 건수 KPI** 추가
- **회원가입 개인정보 정책 동의**: 회원가입 폼에 `[필수] 개인정보 수집·이용 동의` 체크박스 + **정책 보기 모달**(수집항목/이용목적/보유기간/거부권리 4섹션) 추가, 미동의 시 가입 차단
- **출금 정보 일치 검증**: 출금 신청 시 등록된 **예금주명이 회원 이름과 일치**해야 출금 가능(공백 무시 비교) — 본인 명의 계좌로만 출금하도록 강제
- Mobile First 반응형 디자인 · 한국어 UI · 오렌지/골드 테마 · Pretendard 폰트

## 📋 미구현 / 향후 과제
- 실제 PG 결제(현재 **입금→관리자 승인** 방식), 휴대폰 본인인증, SMS/이메일 실발송(콘솔 로그 대체), WebSocket 실시간(현재 새로고침 기반)
- 이미지 저장: 현재 **Base64 자동 압축 방식**(D1 TEXT 저장 — 데모/MVP에 최적). 대용량 운영 시 Cloudflare R2 또는 Supabase Storage 전환 권장
- 다음 단계 권장: Cloudflare 프로덕션 배포(D1 원격 마이그레이션) → 실결제(Stripe 등) 연동 → 실시간 폴링/SSE → 이미지 오브젝트 스토리지(R2/Supabase Storage)

## 📦 배포 상태
- **플랫폼**: Cloudflare Pages (배포 대기)
- **로컬 상태**: ✅ 정상 동작 (PM2 + wrangler pages dev + 로컬 D1)
- **최종 업데이트**: 2026-06-11 (Batch F: **충전 요청/승인(입금 기반)** · 추천 보너스 문구 **포인트 1,000P** · **회원가입 개인정보 정책 동의 체크** · **출금 예금주명=회원이름 일치 검증**)
