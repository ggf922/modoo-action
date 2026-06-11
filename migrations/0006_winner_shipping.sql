-- 당첨 상품 배송 정보 (winners 테이블 확장)
-- 당첨된 회원이 배송 받을 정보를 입력. 당첨 제품은 반품 불가.
ALTER TABLE winners ADD COLUMN recipientName TEXT;
ALTER TABLE winners ADD COLUMN recipientPhone TEXT;
ALTER TABLE winners ADD COLUMN postalCode TEXT;
ALTER TABLE winners ADD COLUMN address1 TEXT;
ALTER TABLE winners ADD COLUMN address2 TEXT;
ALTER TABLE winners ADD COLUMN deliveryMemo TEXT;
ALTER TABLE winners ADD COLUMN shippingStatus TEXT NOT NULL DEFAULT 'PENDING'; -- PENDING(미입력) | SUBMITTED(입력완료) | SHIPPED(발송) | DELIVERED(완료)
ALTER TABLE winners ADD COLUMN shippingSubmittedAt TEXT;
