ALTER TABLE import_orders
  MODIFY supplier_name VARCHAR(255) NULL;

ALTER TABLE import_order_items
  ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER ordered_qty;
