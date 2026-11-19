CREATE TABLE IF NOT EXISTS fiscal_years (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(12) NOT NULL,
  bs_start_date VARCHAR(10) NOT NULL,
  bs_end_date VARCHAR(10) NOT NULL,
  ad_start_date DATE NOT NULL,
  ad_end_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'FUTURE',
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fiscal_years_code (code),
  KEY idx_fiscal_years_ad_range (ad_start_date, ad_end_date),
  KEY idx_fiscal_years_status (status),
  CONSTRAINT chk_fiscal_years_status CHECK (status IN ('FUTURE', 'ACTIVE', 'CLOSED')),
  CONSTRAINT chk_fiscal_years_ad_dates CHECK (ad_start_date <= ad_end_date)
) ENGINE=InnoDB;

-- migrate:split

INSERT INTO fiscal_years
  (code, bs_start_date, bs_end_date, ad_start_date, ad_end_date, status, is_locked)
VALUES
  ('2080/81', '2080-04-01', '2081-03-31', '2023-07-17', '2024-07-15', 'CLOSED', 1),
  ('2081/82', '2081-04-01', '2082-03-32', '2024-07-16', '2025-07-16', 'CLOSED', 1),
  ('2082/83', '2082-04-01', '2083-03-32', '2025-07-17', '2026-07-16', 'CLOSED', 1),
  ('2083/84', '2083-04-01', '2084-03-31', '2026-07-17', '2027-07-16', 'ACTIVE', 0),
  ('2084/85', '2084-04-01', '2085-03-31', '2027-07-17', '2028-07-15', 'FUTURE', 0)
ON DUPLICATE KEY UPDATE code = VALUES(code);

-- The following ALTER statements are generated conditionally so the migration
-- remains safe after a partially completed MySQL/MariaDB DDL deployment.
-- Each fiscal_year_id is denormalized deliberately: it keeps historical
-- reports fast while fiscal_years remains the authoritative calendar.

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'orders')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE orders ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_orders_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'order_items')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_items' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE order_items ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_order_items_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'production')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'production' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE production ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_production_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'production_items')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'production_items' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE production_items ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_production_items_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'consumption_logs')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'consumption_logs' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE consumption_logs ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_consumption_logs_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'stock')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE stock ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_stock_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'stock_adjustments')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_adjustments' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE stock_adjustments ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_stock_adjustments_fy (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'warehouse_billing_history')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'warehouse_billing_history' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE warehouse_billing_history ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_warehouse_billing_fy (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'audit_logs')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE audit_logs ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_audit_logs_fiscal_year_id (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'finished_good_warehouse_movements')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'finished_good_warehouse_movements' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE finished_good_warehouse_movements ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_fg_warehouse_movements_fy (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'order_item_warehouse_allocations')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_item_warehouse_allocations' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_order_allocations_fy (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;

-- migrate:split

SET @fy_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'order_warehouse_delivery_notes')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_warehouse_delivery_notes' AND column_name = 'fiscal_year_id'),
  'ALTER TABLE order_warehouse_delivery_notes ADD COLUMN fiscal_year_id INT UNSIGNED NULL, ADD INDEX idx_order_delivery_notes_fy (fiscal_year_id)',
  'SELECT 1'
);
-- migrate:split
PREPARE fy_stmt FROM @fy_sql;
-- migrate:split
EXECUTE fy_stmt;
-- migrate:split
DEALLOCATE PREPARE fy_stmt;
