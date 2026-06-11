-- 관리자 계정 + 기본 사이트 설정 보장 (멱등)
-- 프로덕션 배포 시 seed 없이도 관리자 로그인(admin / admin123)이 동작하도록 보장합니다.
-- 비밀번호 해시는 bcrypt(admin123, saltRounds=10) 입니다.

INSERT OR IGNORE INTO users
  (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, bankName, bankAccount, accountHolder, createdAt, updatedAt)
VALUES
  ('u-admin', 'admin', '$2b$10$ydSHn.R0Pnuw9PE8AsDZFu1hgef4S1F4UChVoBF0YR3iFpFmKFEbi', '관리자', '010-0000-0000', '모두모두운영자', 'ADMIN', 100000, 0, 0, NULL, 'ADMIN001', '국민은행', '123456-00-000000', '관리자', datetime('now'), datetime('now'));

-- 기본 사이트 설정 1행 보장
INSERT OR IGNORE INTO site_config
  (id, defaultWinners, defaultLosingReward, minWithdrawAmount, referralBonus, updatedAt)
VALUES
  ('config-1', 1, 100, 10000, 500, datetime('now'));
