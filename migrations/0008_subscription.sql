-- 월 구독료 기능
-- 회원이 매월 구독료(10,000P)를 경매 포인트로 납부 → 모두모두 혜택 활성화.
-- 관리자는 구독 신청한 회원을 활성/비활성으로 관리할 수 있다.

-- users: 구독 활성 여부 + 구독 만료일(마지막 납부월 기준)
ALTER TABLE users ADD COLUMN subscriptionActive INTEGER NOT NULL DEFAULT 0; -- 0=비활성 1=활성
ALTER TABLE users ADD COLUMN subscriptionUntil TEXT;                        -- 구독 유효 종료일(YYYY-MM-DD), NULL=없음

-- 구독료 납부 내역
CREATE TABLE IF NOT EXISTS subscription_payments (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  amount      INTEGER NOT NULL,                  -- 납부 금액(P)
  period      TEXT NOT NULL,                     -- 납부 대상 월 (YYYY-MM)
  status      TEXT NOT NULL DEFAULT 'PAID',      -- PAID(납부완료) | ACTIVE(관리자 활성) | INACTIVE(관리자 비활성)
  paidAt      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(userId);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_period ON subscription_payments(period);
-- 같은 회원이 같은 달에 중복 납부하지 못하도록 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_user_period ON subscription_payments(userId, period);
