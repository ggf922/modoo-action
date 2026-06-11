-- 상품 정렬 순서 컬럼 추가 (관리자가 노출 순서를 직접 조정)
ALTER TABLE products ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;

-- 기존 상품들에 createdAt 역순 기준으로 초기 순서 부여 (작을수록 먼저 노출)
-- SQLite는 UPDATE ... FROM 미지원 환경 대비, rowid 기반 간단 초기화
UPDATE products SET sortOrder = (
  SELECT COUNT(*) FROM products p2 WHERE p2.createdAt > products.createdAt
);

CREATE INDEX IF NOT EXISTS idx_products_sort ON products(sortOrder);
