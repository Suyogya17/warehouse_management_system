-- Adds a configurable regular-product markup per user and permanent order price snapshots.
-- Safe to run more than once.

SET @add_regular_price_markup = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN regular_price_markup DECIMAL(12,2) NOT NULL DEFAULT 0.00',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'regular_price_markup'
);
PREPARE add_regular_price_markup_stmt FROM @add_regular_price_markup;
EXECUTE add_regular_price_markup_stmt;
DEALLOCATE PREPARE add_regular_price_markup_stmt;

SET @add_unit_price_snapshot = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE order_items ADD COLUMN unit_price_snapshot DECIMAL(12,2) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_items'
    AND COLUMN_NAME = 'unit_price_snapshot'
);
PREPARE add_unit_price_snapshot_stmt FROM @add_unit_price_snapshot;
EXECUTE add_unit_price_snapshot_stmt;
DEALLOCATE PREPARE add_unit_price_snapshot_stmt;

SET @add_price_currency_snapshot = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE order_items ADD COLUMN price_currency_snapshot CHAR(3) NULL AFTER unit_price_snapshot',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_items'
    AND COLUMN_NAME = 'price_currency_snapshot'
);
PREPARE add_price_currency_snapshot_stmt FROM @add_price_currency_snapshot;
EXECUTE add_price_currency_snapshot_stmt;
DEALLOCATE PREPARE add_price_currency_snapshot_stmt;

UPDATE users
SET regular_price_markup = 50.00
WHERE LOWER(email) = 'ishwor.birtamod@nepcha.com';
