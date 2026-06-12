-- 회원 등급(grade) 추가
-- NORMAL(일반회원) | VIP | VVIP | AGENCY(대리점) | DISTRIBUTOR(총판) | DIRECTOR(이사)
-- 신규/기존 회원은 기본 NORMAL. 관리자가 승인(변경)으로 등급을 지정한다.
ALTER TABLE users ADD COLUMN grade TEXT NOT NULL DEFAULT 'NORMAL';
CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade);
