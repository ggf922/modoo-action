-- ============================================================
-- 0008 — 대규모 트래픽 대비 인덱스/비정규화 (Supabase / PostgreSQL)
-- 목표: 동시접속 10,000명 / 누적회원 500,000명 안정 운영
-- Supabase 대시보드 → SQL Editor 에 그대로 붙여넣어 실행하세요.
-- 멱등(idempotent): 여러 번 실행해도 안전합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) products: 참여자 수 비정규화 컬럼
--    기존: 목록 조회 시마다 (SELECT COUNT(*) FROM bids ...) 서브쿼리 → bids 풀스캔
--    개선: products.participantCount 를 입찰 시 +1 하여 목록 조회는 단순 SELECT
-- ------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS "participantCount" INTEGER NOT NULL DEFAULT 0;

-- 기존 데이터 백필 (현재 bids 수로 동기화)
UPDATE products p
SET "participantCount" = (
  SELECT COUNT(*) FROM bids b WHERE b."productId" = p.id
)
WHERE p."participantCount" IS DISTINCT FROM (
  SELECT COUNT(*) FROM bids b WHERE b."productId" = p.id
);

-- ------------------------------------------------------------
-- 2) products: 목록 조회 복합 인덱스
--    쿼리: WHERE status = ? ORDER BY sortOrder ASC, createdAt DESC
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_status_sort
  ON products(status, "sortOrder", "createdAt" DESC);

-- 마감 처리(스케줄/배치)용: 열려있고 종료시각 지난 것
CREATE INDEX IF NOT EXISTS idx_products_status_endat
  ON products(status, "endAt");

-- ------------------------------------------------------------
-- 3) users: 로그인/조회 인덱스
--    email/nickname/referralCode 는 UNIQUE 제약으로 이미 인덱스 존재.
--    가입 시 중복확인 쿼리 (email OR nickname) 대비 nickname 인덱스 보강.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users("createdAt" DESC);

-- ------------------------------------------------------------
-- 4) bids: 정원 카운트/중복확인/상세 조인 인덱스
--    UNIQUE(userId, productId) 는 이미 존재(중복참여 차단 + 조회 가속).
--    productId 단독 인덱스로 정원 카운트/상세 참여자 목록 가속.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bids_product_created
  ON bids("productId", "createdAt");

-- ------------------------------------------------------------
-- 5) point_history / withdrawals / charge_requests: 사용자별 내역 조회
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_point_history_user_created
  ON point_history("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status
  ON withdrawals("userId", status);

CREATE INDEX IF NOT EXISTS idx_charge_requests_user_status
  ON charge_requests("userId", status);

-- ------------------------------------------------------------
-- 6) winners: 사용자별/상품별 조회
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_winners_product ON winners("productId");
CREATE INDEX IF NOT EXISTS idx_winners_shipping ON winners("shippingStatus");

-- ------------------------------------------------------------
-- 7) 통계 갱신 (플래너가 새 인덱스를 즉시 활용하도록)
-- ------------------------------------------------------------
ANALYZE products;
ANALYZE users;
ANALYZE bids;
ANALYZE point_history;
ANALYZE winners;
