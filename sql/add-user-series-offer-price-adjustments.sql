-- Per-user, per-series extra price applied only to active offer products.
-- The standard offer markup remains NPR 50; this table stores only the extra amount.

CREATE TABLE IF NOT EXISTS user_series_offer_price_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  series_code VARCHAR(120) NOT NULL,
  adjustment_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_series_offer_adjustment (user_id, series_code),
  KEY idx_series_offer_adjustment (series_code, is_active),
  KEY idx_user_offer_adjustment (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ishwor's USER account and Prabin's ELDER account both receive an additional
-- NPR 25 on Cherry-series offers. "Cherry" also matches stored values such as
-- Cherry_Sole through backend normalization.
INSERT INTO user_series_offer_price_adjustments (
  user_id,
  series_code,
  adjustment_amount,
  is_active
)
SELECT id, 'Cherry', 25.00, 1
FROM users
WHERE LOWER(email) IN (
  'ishwor.birtamod@nepcha.com',
  'prabin.birtamod@nepcha.com'
)
ON DUPLICATE KEY UPDATE
  adjustment_amount = 25.00,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;

SELECT u.name, u.email, a.series_code, a.adjustment_amount, a.is_active
FROM user_series_offer_price_adjustments a
JOIN users u ON u.id = a.user_id
WHERE LOWER(u.email) IN (
  'ishwor.birtamod@nepcha.com',
  'prabin.birtamod@nepcha.com'
)
ORDER BY u.email, a.series_code;
