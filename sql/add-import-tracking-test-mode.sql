ALTER TABLE import_orders
  ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 1 AFTER status;

CREATE INDEX idx_import_orders_test_status ON import_orders (is_test, status);
