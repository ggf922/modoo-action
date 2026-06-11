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
- **products**: 경매 상품(시중가/시작가/참가비/정원/당첨자수/미당첨보상/상태)
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
4. **조직도**: 본인 루트로 산하 최대 5단계 BFS 조회 (상위 추천인 절대 비노출)
5. **출금**: 잔액+임금 합계에서 차감, 최소 금액 검증, PENDING → 관리자 승인 시 차감 + COMPLETED

## 📱 화면 라우트 (해시 기반 SPA)
| 경로 | 화면 | 권한 |
|---|---|---|
| `#/` | 메인(진행중 경매 그리드) | Guest |
| `#/auth/login` | 로그인 | Guest |
| `#/auth/register` | 회원가입(추천코드) | Guest |
| `#/products/:id` | 상품 상세 + 참여자 게이지 | Guest |
| `#/mypage` | 마이페이지(4종 포인트 카드) | Member |
| `#/mypage/charge` | 포인트 충전(더미 결제) | Member |
| `#/mypage/withdraw` | 출금 신청 + 계좌등록 | Member |
| `#/mypage/history` | 포인트 내역(필터) | Member |
| `#/mypage/bids` | 내 참여 내역(당첨/미당첨 탭) | Member |
| `#/mypage/network` | 내 조직도(SVG 트리) | Member |
| `#/admin` | 관리자 대시보드(KPI+차트) | Admin |
| `#/admin/products` | 상품 목록/강제추첨/삭제 | Admin |
| `#/admin/products/new` | 상품 등록 | Admin |
| `#/admin/products/:id/edit` | 상품 수정 | Admin |
| `#/admin/members` | 회원 관리(검색+포인트 조정) | Admin |
| `#/admin/withdrawals` | 출금 승인/거절 | Admin |
| `#/admin/config` | 사이트 전역 설정 | Admin |

## 🔌 주요 API 엔드포인트
- `POST /api/auth/register | login | logout`, `GET /api/auth/me`
- `GET /api/products`, `GET /api/products/:id`, `POST /api/products/:id/join`
- `POST /api/me/charge | withdraw | bank`, `GET /api/me/history | bids | withdrawals | network`
- `GET /api/admin/stats`, 상품 CRUD `/api/admin/products`, `POST /api/admin/products/:id/draw`
- `GET /api/admin/members`, `POST /api/admin/members/:id/adjust`
- `GET /api/admin/withdrawals`, `POST /api/admin/withdrawals/:id/process`
- `GET|PUT /api/admin/config`, `PATCH /api/admin/products/:id/settings` (상품별 빠른 설정)

## 🔑 데모 계정
| 구분 | 이메일 | 비밀번호 | 비고 |
|---|---|---|---|
| 👑 관리자 | `admin@modoo.com` | `Admin1234!` | 추천코드 ADMIN001 |
| 👤 회원 | `user1@test.com` ~ `user6@test.com` | `Test1234!` | 각 5,000P 지급 |

**추천 관계**: admin → user1 → (user2, user3), user2 → (user4, user5), user3 → user6
**시드 상품 5개**: 갤럭시 버즈 프로 / 스타벅스 텀블러 / 다이슨 V12 / 한우 등심 / 에어팟 프로 2
(상품1 "갤럭시 버즈 프로"에 user1~3이 사전 참여 중)

## 🎯 데모 시나리오
1. **관리자 플로우**: admin 로그인 → `#/admin` 대시보드 → 상품 등록 → 회원 포인트 조정 → 출금 승인
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
- 회원가입(추천코드 검증/보너스 지급) · 로그인/로그아웃 · JWT 세션
- 메인/상품카드/참여자 게이지(👤 10개 점등 + 진행바)
- 경매 참여(트랜잭션) + 정원 도달 자동 추첨 + 당첨/미당첨 모달(슬롯/폭죽)
- 마이페이지 4종 포인트 카드 · 더미 충전 · 출금 신청/계좌등록 · 포인트 내역(필터) · 참여 내역(탭)
- 조직도 SVG 트리(본인 산하 5단계, 상위 비노출) + 노드 활동 요약 패널
- 관리자: 대시보드(KPI+차트) · 상품 CRUD/강제추첨 · 회원 검색/포인트 조정 · 출금 승인
- 설정 페이지: **전역 기본값**(신규 상품 등록 시 당첨자수·미당첨보상 자동 적용) + **상품별 개별 빠른 설정 테이블**(당첨자수·미당첨보상·정원 인라인 수정)
- Mobile First 반응형 디자인 · 한국어 UI · 오렌지/골드 테마 · Pretendard 폰트

## 📋 미구현 / 향후 과제
- 실제 PG 결제(현재 더미), 휴대폰 본인인증, SMS/이메일 실발송(콘솔 로그 대체), WebSocket 실시간(현재 새로고침 기반)
- 다음 단계 권장: Cloudflare 프로덕션 배포(D1 원격 마이그레이션) → 실결제(Stripe 등) 연동 → 실시간 폴링/SSE → 이미지 업로드(R2)

## 📦 배포 상태
- **플랫폼**: Cloudflare Pages (배포 대기)
- **로컬 상태**: ✅ 정상 동작 (PM2 + wrangler pages dev + 로컬 D1)
- **최종 업데이트**: 2026-06-09
