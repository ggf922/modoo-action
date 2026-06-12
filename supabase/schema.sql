-- ============================================================
-- 모두모두 경매몰 — Supabase (PostgreSQL) 통합 스키마
-- Cloudflare D1(SQLite) 마이그레이션 0001~0007을 PostgreSQL로 변환
-- Supabase 대시보드 → SQL Editor 에 그대로 붙여넣어 실행하세요.
-- 멱등(idempotent): 여러 번 실행해도 안전합니다.
-- ============================================================

-- ===== 사용자 =====
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  nickname      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'MEMBER',      -- MEMBER | ADMIN
  grade         TEXT NOT NULL DEFAULT 'NORMAL',      -- NORMAL|VIP|VVIP|AGENCY|DISTRIBUTOR|DIRECTOR
  "auctionPoint"  BIGINT NOT NULL DEFAULT 0,         -- 경매 포인트(단일 체계)
  "balancePoint"  BIGINT NOT NULL DEFAULT 0,         -- (레거시) 잔액 포인트
  "wagePoint"     BIGINT NOT NULL DEFAULT 0,         -- (레거시) 임금 포인트
  "referrerId"    TEXT,
  "referralCode"  TEXT UNIQUE NOT NULL,
  "bankName"      TEXT,
  "bankAccount"   TEXT,
  "accountHolder" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_users_referrer FOREIGN KEY ("referrerId") REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users("referrerId");
CREATE INDEX IF NOT EXISTS idx_users_referralCode ON users("referralCode");
CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade);

-- ===== 상품(경매) =====
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  "imageUrl"        TEXT NOT NULL,
  category        TEXT NOT NULL,
  "marketPrice"     BIGINT NOT NULL,
  "startPrice"      BIGINT NOT NULL,
  "entryFee"        BIGINT NOT NULL,
  "maxParticipants" INTEGER NOT NULL DEFAULT 10,
  "winnersCount"    INTEGER NOT NULL DEFAULT 1,
  "losingReward"    BIGINT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN | CLOSED | DRAWN
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "startAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "endAt"           TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_sort ON products("sortOrder");

-- ===== 입찰(참여) =====
CREATE TABLE IF NOT EXISTS bids (
  id          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "pointsUsed"  BIGINT NOT NULL,
  "isWinner"    INTEGER NOT NULL DEFAULT 0,          -- 0/1
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId", "productId"),
  CONSTRAINT fk_bids_user FOREIGN KEY ("userId") REFERENCES users(id),
  CONSTRAINT fk_bids_product FOREIGN KEY ("productId") REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_bids_product ON bids("productId");
CREATE INDEX IF NOT EXISTS idx_bids_user ON bids("userId");

-- ===== 당첨자 (배송 정보 포함) =====
CREATE TABLE IF NOT EXISTS winners (
  id          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "finalPrice"  BIGINT NOT NULL,
  "drawnAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "recipientName"  TEXT,
  "recipientPhone" TEXT,
  "postalCode"     TEXT,
  address1         TEXT,
  address2         TEXT,
  "deliveryMemo"   TEXT,
  "shippingStatus" TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING|SUBMITTED|SHIPPED|DELIVERED
  "shippingSubmittedAt" TIMESTAMPTZ,
  CONSTRAINT fk_winners_user FOREIGN KEY ("userId") REFERENCES users(id),
  CONSTRAINT fk_winners_product FOREIGN KEY ("productId") REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_winners_user ON winners("userId");

-- ===== 포인트 내역 =====
CREATE TABLE IF NOT EXISTS point_history (
  id          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  type        TEXT NOT NULL,        -- CHARGE USE REWARD REFERRAL WITHDRAW ADMIN_ADJ
  "pointKind"   TEXT NOT NULL,      -- AUCTION BALANCE WAGE
  amount      BIGINT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_ph_user FOREIGN KEY ("userId") REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_point_history_user ON point_history("userId");

-- ===== 출금 신청 =====
CREATE TABLE IF NOT EXISTS withdrawals (
  id          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  amount      BIGINT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING APPROVED REJECTED COMPLETED
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt" TIMESTAMPTZ,
  CONSTRAINT fk_wd_user FOREIGN KEY ("userId") REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- ===== 포인트 충전 요청 =====
CREATE TABLE IF NOT EXISTS charge_requests (
  id          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  amount      BIGINT NOT NULL,
  depositor   TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING | COMPLETED | REJECTED
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt" TIMESTAMPTZ,
  CONSTRAINT fk_cr_user FOREIGN KEY ("userId") REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_charge_requests_user ON charge_requests("userId");
CREATE INDEX IF NOT EXISTS idx_charge_requests_status ON charge_requests(status);

-- ===== 사이트 전역 설정 (단일 행) =====
CREATE TABLE IF NOT EXISTS site_config (
  id                  TEXT PRIMARY KEY,
  "defaultWinners"      INTEGER NOT NULL DEFAULT 1,
  "defaultLosingReward" BIGINT NOT NULL DEFAULT 100,
  "minWithdrawAmount"   BIGINT NOT NULL DEFAULT 10000,
  "referralBonus"       BIGINT NOT NULL DEFAULT 1000,
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 초기 데이터: 관리자 계정 + 기본 사이트 설정 (멱등)
-- 관리자 로그인: 아이디 admin / 비밀번호 admin123
-- ⚠️ 운영 배포 후 반드시 비밀번호를 변경하세요!
-- ============================================================
INSERT INTO users
  (id, email, password, name, phone, nickname, role, grade,
   "auctionPoint", "balancePoint", "wagePoint", "referrerId", "referralCode",
   "bankName", "bankAccount", "accountHolder", "createdAt", "updatedAt")
VALUES
  ('u-admin', 'admin', '$2b$10$ydSHn.R0Pnuw9PE8AsDZFu1hgef4S1F4UChVoBF0YR3iFpFmKFEbi',
   '관리자', '010-0000-0000', '모두모두운영자', 'ADMIN', 'DIRECTOR',
   100000, 0, 0, NULL, 'ADMIN001',
   '국민은행', '123456-00-000000', '관리자', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_config
  (id, "defaultWinners", "defaultLosingReward", "minWithdrawAmount", "referralBonus", "updatedAt")
VALUES
  ('config-1', 1, 100, 10000, 1000, now())
ON CONFLICT (id) DO NOTHING;
