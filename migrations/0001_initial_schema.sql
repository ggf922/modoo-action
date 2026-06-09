-- 모두모두 경매몰 초기 스키마
-- SQLite (Cloudflare D1) — Prisma 명세를 D1에 맞게 변환

-- 사용자
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  nickname      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'MEMBER',     -- MEMBER | ADMIN
  auctionPoint  INTEGER NOT NULL DEFAULT 0,         -- 경매 참여 포인트
  balancePoint  INTEGER NOT NULL DEFAULT 0,         -- 잔액 포인트 (미당첨 보상)
  wagePoint     INTEGER NOT NULL DEFAULT 0,         -- 임금 포인트 (추천 수당)
  referrerId    TEXT,                               -- 추천인 id
  referralCode  TEXT UNIQUE NOT NULL,               -- 본인 추천코드
  bankName      TEXT,
  bankAccount   TEXT,
  accountHolder TEXT,
  createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (referrerId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrerId);
CREATE INDEX IF NOT EXISTS idx_users_referralCode ON users(referralCode);

-- 상품(경매)
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  imageUrl        TEXT NOT NULL,
  category        TEXT NOT NULL,
  marketPrice     INTEGER NOT NULL,                 -- 시중가
  startPrice      INTEGER NOT NULL,                 -- 시작가(낙찰 자동구매가)
  entryFee        INTEGER NOT NULL,                 -- 참가비(auctionPoint)
  maxParticipants INTEGER NOT NULL DEFAULT 10,
  winnersCount    INTEGER NOT NULL DEFAULT 1,
  losingReward    INTEGER NOT NULL DEFAULT 0,       -- 미당첨 보상(balancePoint)
  status          TEXT NOT NULL DEFAULT 'OPEN',     -- OPEN | CLOSED | DRAWN
  startAt         TEXT NOT NULL DEFAULT (datetime('now')),
  endAt           TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- 입찰(참여)
CREATE TABLE IF NOT EXISTS bids (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  productId   TEXT NOT NULL,
  pointsUsed  INTEGER NOT NULL,
  isWinner    INTEGER NOT NULL DEFAULT 0,           -- 0/1
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, productId),
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (productId) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_bids_product ON bids(productId);
CREATE INDEX IF NOT EXISTS idx_bids_user ON bids(userId);

-- 당첨자
CREATE TABLE IF NOT EXISTS winners (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  productId   TEXT NOT NULL,
  finalPrice  INTEGER NOT NULL,
  drawnAt     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (productId) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_winners_user ON winners(userId);

-- 포인트 내역
CREATE TABLE IF NOT EXISTS point_history (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  type        TEXT NOT NULL,                        -- CHARGE USE REWARD REFERRAL WITHDRAW ADMIN_ADJ
  pointKind   TEXT NOT NULL,                        -- AUCTION BALANCE WAGE
  amount      INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_point_history_user ON point_history(userId);

-- 출금 신청
CREATE TABLE IF NOT EXISTS withdrawals (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING APPROVED REJECTED COMPLETED
  requestedAt TEXT NOT NULL DEFAULT (datetime('now')),
  processedAt TEXT,
  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- 사이트 전역 설정 (단일 행)
CREATE TABLE IF NOT EXISTS site_config (
  id                  TEXT PRIMARY KEY,
  defaultWinners      INTEGER NOT NULL DEFAULT 1,
  defaultLosingReward INTEGER NOT NULL DEFAULT 100,
  minWithdrawAmount   INTEGER NOT NULL DEFAULT 10000,
  referralBonus       INTEGER NOT NULL DEFAULT 500,
  updatedAt           TEXT NOT NULL DEFAULT (datetime('now'))
);
