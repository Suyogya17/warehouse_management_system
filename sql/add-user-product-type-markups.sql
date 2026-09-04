-- Adds separate per-user NPR price increases for percentage and non-commission products.
-- Safe to run more than once. Existing regular markup is copied into both fields.

SET @percentage_product_markup_was_missing = (
  SELECT COUNT(*) = 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'percentage_product_markup'
);

SET @non_commission_product_markup_was_missing = (
  SELECT COUNT(*) = 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'non_commission_product_markup'
);

SET @add_percentage_product_markup = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN percentage_product_markup DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER regular_price_markup',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'percentage_product_markup'
);
PREPARE add_percentage_product_markup_stmt FROM @add_percentage_product_markup;
EXECUTE add_percentage_product_markup_stmt;
DEALLOCATE PREPARE add_percentage_product_markup_stmt;

SET @add_non_commission_product_markup = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN non_commission_product_markup DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER percentage_product_markup',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'non_commission_product_markup'
);
PREPARE add_non_commission_product_markup_stmt FROM @add_non_commission_product_markup;
EXECUTE add_non_commission_product_markup_stmt;
DEALLOCATE PREPARE add_non_commission_product_markup_stmt;

UPDATE users
SET percentage_product_markup = regular_price_markup,
    non_commission_product_markup = regular_price_markup
WHERE regular_price_markup > 0
  AND (
    @percentage_product_markup_was_missing = 1
    OR @non_commission_product_markup_was_missing = 1
  )
  AND percentage_product_markup = 0
  AND non_commission_product_markup = 0;
