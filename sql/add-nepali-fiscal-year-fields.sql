-- Nepali BS fiscal-year metadata.
-- Nepal fiscal year is Shrawan through Ashadh.
-- Run once, then new records will be stamped by the backend when these columns exist.

ALTER TABLE users
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE notifications
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE raw_materials
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE finished_goods
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE stock
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE formulas
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE production
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE production_items
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE consumption_logs
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE audit_logs
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE user_product_permissions
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE orders
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE order_items
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE order_item_warehouse_allocations
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE warehouses
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE finished_good_warehouse_stock
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE finished_good_warehouse_movements
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE stock_adjustments
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

ALTER TABLE advertisements
  ADD COLUMN bs_date VARCHAR(10) NULL,
  ADD COLUMN bs_year INT NULL,
  ADD COLUMN bs_month INT NULL,
  ADD COLUMN bs_fiscal_year VARCHAR(10) NULL;

CREATE INDEX idx_orders_bs_fiscal_year ON orders(bs_fiscal_year);
CREATE INDEX idx_production_bs_fiscal_year ON production(bs_fiscal_year);
CREATE INDEX idx_stock_bs_fiscal_year ON stock(bs_fiscal_year);
CREATE INDEX idx_consumption_logs_bs_fiscal_year ON consumption_logs(bs_fiscal_year);
CREATE INDEX idx_finished_good_movements_bs_fiscal_year ON finished_good_warehouse_movements(bs_fiscal_year);
