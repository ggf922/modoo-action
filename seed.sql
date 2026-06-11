-- ===== 모두모두 경매몰 시드 데이터 =====
-- 비밀번호: admin = Admin1234!, 회원 = Test1234! (bcrypt saltRounds=10)

DELETE FROM winners;
DELETE FROM point_history;
DELETE FROM withdrawals;
DELETE FROM bids;
DELETE FROM products;
DELETE FROM users;
DELETE FROM site_config;

-- 사이트 설정
INSERT INTO site_config (id, defaultWinners, defaultLosingReward, minWithdrawAmount, referralBonus, updatedAt)
VALUES ('config-1', 1, 200, 10000, 500, datetime('now'));

-- 관리자
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, bankName, bankAccount, accountHolder, createdAt, updatedAt)
VALUES ('u-admin', 'admin@modoo.com', '$2b$10$C4XmjaISAZ.6nqrBJCs39OG.di0x6IiO/tJwUcmReius0.swICupO', '관리자', '010-0000-0000', '모두모두운영자', 'ADMIN', 100000, 0, 0, NULL, 'ADMIN001', '국민은행', '123456-00-000000', '관리자', datetime('now','-30 days'), datetime('now'));

-- 회원 6명 (추천 관계 구성)
-- user1 <- admin
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user1', 'user1@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '김일번', '010-1111-1111', '일번이', 'MEMBER', 50000, 0, 1000, 'u-admin', 'USER0001', datetime('now','-25 days'), datetime('now'));
-- user2 <- user1
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user2', 'user2@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '이이번', '010-2222-2222', '이번이', 'MEMBER', 50000, 0, 1000, 'u-user1', 'USER0002', datetime('now','-20 days'), datetime('now'));
-- user3 <- user1
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user3', 'user3@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '박삼번', '010-3333-3333', '삼번이', 'MEMBER', 50000, 0, 500, 'u-user1', 'USER0003', datetime('now','-18 days'), datetime('now'));
-- user4 <- user2
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user4', 'user4@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '최사번', '010-4444-4444', '사번이', 'MEMBER', 100000, 0, 0, 'u-user2', 'USER0004', datetime('now','-15 days'), datetime('now'));
-- user5 <- user2
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user5', 'user5@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '정오번', '010-5555-5555', '오번이', 'MEMBER', 100000, 0, 0, 'u-user2', 'USER0005', datetime('now','-12 days'), datetime('now'));
-- user6 <- user3
INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
VALUES ('u-user6', 'user6@test.com', '$2b$10$doUK/eh6lhsAQWgKfxJizO.uSmUeyTs7NmTG2GNDpY/sai.gfVfz6', '강육번', '010-6666-6666', '육번이', 'MEMBER', 100000, 0, 0, 'u-user3', 'USER0006', datetime('now','-10 days'), datetime('now'));

-- 추천 보너스 내역 (시드 회원의 wagePoint 근거)
INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES
 ('ph-r1', 'u-admin', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (일번이)', datetime('now','-25 days')),
 ('ph-r2', 'u-user1', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (이번이)', datetime('now','-20 days')),
 ('ph-r3', 'u-user1', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (삼번이)', datetime('now','-18 days')),
 ('ph-r4', 'u-user2', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (사번이)', datetime('now','-15 days')),
 ('ph-r5', 'u-user2', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (오번이)', datetime('now','-12 days')),
 ('ph-r6', 'u-user3', 'REFERRAL', 'WAGE', 500, '추천 가입 보너스 (육번이)', datetime('now','-10 days'));

-- 초기 충전 내역 (auctionPoint 5000 근거)
INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES
 ('ph-c1', 'u-user1', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-25 days')),
 ('ph-c2', 'u-user2', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-20 days')),
 ('ph-c3', 'u-user3', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-18 days')),
 ('ph-c4', 'u-user4', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-15 days')),
 ('ph-c5', 'u-user5', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-12 days')),
 ('ph-c6', 'u-user6', 'CHARGE', 'AUCTION', 100000, '가입 축하 포인트 지급', datetime('now','-10 days'));

-- 상품 5개
INSERT INTO products (id, title, description, imageUrl, category, marketPrice, startPrice, entryFee, maxParticipants, winnersCount, losingReward, status, startAt, createdAt) VALUES
 ('p-1', '삼성 갤럭시 버즈 프로', '최고급 노이즈 캔슬링 무선 이어버드. 풍부한 사운드와 편안한 착용감을 자랑합니다.', 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=600&q=80', '전자기기', 250000, 50000, 50000, 10, 1, 200, 'OPEN', datetime('now'), datetime('now')),
 ('p-2', '스타벅스 텀블러 세트', '한정판 스타벅스 텀블러 3종 세트. 따뜻한 커피 한 잔의 여유를 선물하세요.', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&q=80', '생활용품', 80000, 10000, 10000, 10, 1, 200, 'OPEN', datetime('now'), datetime('now')),
 ('p-3', '다이슨 무선청소기 V12', '강력한 흡입력의 다이슨 V12 무선청소기. 집안 청소가 즐거워집니다.', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&q=80', '가전', 950000, 200000, 200000, 10, 1, 200, 'OPEN', datetime('now'), datetime('now')),
 ('p-4', '한우 등심 1kg', '1++ 등급 프리미엄 한우 등심 1kg. 입에서 살살 녹는 최고의 맛.', 'https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=600&q=80', '식품', 120000, 30000, 30000, 10, 1, 200, 'OPEN', datetime('now'), datetime('now')),
 ('p-5', '에어팟 프로 2세대', '애플 에어팟 프로 2세대. 적응형 오디오와 강력한 노이즈 캔슬링.', 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&q=80', '전자기기', 350000, 80000, 80000, 10, 1, 200, 'OPEN', datetime('now'), datetime('now'));

-- 상품 1번에 user1, user2, user3 사전 참여
INSERT INTO bids (id, userId, productId, pointsUsed, isWinner, createdAt) VALUES
 ('b-1', 'u-user1', 'p-1', 50000, 0, datetime('now','-2 hours')),
 ('b-2', 'u-user2', 'p-1', 50000, 0, datetime('now','-1 hours')),
 ('b-3', 'u-user3', 'p-1', 50000, 0, datetime('now','-30 minutes'));

-- 상품 1번 사전 참여에 따른 포인트 차감 내역 (충전 100,000P - 참여 50,000P = 잔액 50,000P)
INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES
 ('ph-j1', 'u-user1', 'USE', 'AUCTION', -50000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-2 hours')),
 ('ph-j2', 'u-user2', 'USE', 'AUCTION', -50000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-1 hours')),
 ('ph-j3', 'u-user3', 'USE', 'AUCTION', -50000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-30 minutes'));

-- 사전 참여한 회원의 auctionPoint 차감 반영 (5000 - 1000 = 4000)
UPDATE users SET auctionPoint = 4000 WHERE id IN ('u-user1','u-user2','u-user3');

-- 사전 참여 포인트 사용 내역
INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES
 ('ph-u1', 'u-user1', 'USE', 'AUCTION', -1000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-2 hours')),
 ('ph-u2', 'u-user2', 'USE', 'AUCTION', -1000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-1 hours')),
 ('ph-u3', 'u-user3', 'USE', 'AUCTION', -1000, '경매 참여: 삼성 갤럭시 버즈 프로', datetime('now','-30 minutes'));
