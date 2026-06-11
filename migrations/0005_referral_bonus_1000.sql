-- 추천 가입 보너스 기본값을 1000P로 상향 (기존 site_config 행이 있어도 반영)
UPDATE site_config SET referralBonus = 1000, updatedAt = datetime('now') WHERE referralBonus < 1000;
