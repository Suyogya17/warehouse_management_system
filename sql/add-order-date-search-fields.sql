-- Add searchable Nepali date metadata to orders.
-- Safe to run more than once.

SET @add_orders_bs_date = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'bs_date'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN bs_date VARCHAR(10) NULL AFTER updated_at'
);
PREPARE add_orders_bs_date_stmt FROM @add_orders_bs_date;
EXECUTE add_orders_bs_date_stmt;
DEALLOCATE PREPARE add_orders_bs_date_stmt;

SET @add_orders_bs_year = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'bs_year'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN bs_year INT NULL AFTER bs_date'
);
PREPARE add_orders_bs_year_stmt FROM @add_orders_bs_year;
EXECUTE add_orders_bs_year_stmt;
DEALLOCATE PREPARE add_orders_bs_year_stmt;

SET @add_orders_bs_month = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'bs_month'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN bs_month INT NULL AFTER bs_year'
);
PREPARE add_orders_bs_month_stmt FROM @add_orders_bs_month;
EXECUTE add_orders_bs_month_stmt;
DEALLOCATE PREPARE add_orders_bs_month_stmt;

SET @add_orders_bs_fiscal_year = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'bs_fiscal_year'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN bs_fiscal_year VARCHAR(10) NULL AFTER bs_month'
);
PREPARE add_orders_bs_fiscal_year_stmt FROM @add_orders_bs_fiscal_year;
EXECUTE add_orders_bs_fiscal_year_stmt;
DEALLOCATE PREPARE add_orders_bs_fiscal_year_stmt;

SET @add_orders_bs_date_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_bs_date_id'
  ),
  'SELECT 1',
  'CREATE INDEX idx_orders_bs_date_id ON orders (bs_date, id)'
);
PREPARE add_orders_bs_date_index_stmt FROM @add_orders_bs_date_index;
EXECUTE add_orders_bs_date_index_stmt;
DEALLOCATE PREPARE add_orders_bs_date_index_stmt;

SET @add_orders_fiscal_date_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_fiscal_date_id'
  ),
  'SELECT 1',
  'CREATE INDEX idx_orders_fiscal_date_id ON orders (bs_fiscal_year, bs_date, id)'
);
PREPARE add_orders_fiscal_date_index_stmt FROM @add_orders_fiscal_date_index;
EXECUTE add_orders_fiscal_date_index_stmt;
DEALLOCATE PREPARE add_orders_fiscal_date_index_stmt;
