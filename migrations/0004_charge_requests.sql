-- 포인트 충전 요청 (회원이 계좌 입금 후 신청 → 관리자 승인 시 경매 포인트 지급)
CREATE TABLE IF NOT EXISTS charge_requests (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  amount      INTEGER NOT NULL,                   -- 입금/충전 요청 금액 (P)
  depositor   TEXT,                               -- 입금자명 (회원이 실제 입금한 이름)
  status      TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING | COMPLETED | REJECTED
  requestedAt TEXT NOT NULL DEFAULT (datetime('now')),
  processedAt TEXT,
  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_charge_requests_user ON charge_requests(userId);
CREATE INDEX IF NOT EXISTS idx_charge_requests_status ON charge_requests(status);
