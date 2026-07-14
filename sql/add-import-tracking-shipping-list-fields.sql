ALTER TABLE import_orders
  ADD COLUMN loading_date DATE NULL AFTER order_date,
  ADD COLUMN vehicle_no VARCHAR(120) NULL AFTER tracking_number,
  ADD COLUMN vehicle_size VARCHAR(60) NULL AFTER vehicle_no,
  ADD COLUMN destination VARCHAR(120) NULL AFTER vehicle_size,
  ADD COLUMN ocean_company VARCHAR(120) NULL AFTER destination;

ALTER TABLE import_order_items
  ADD COLUMN size VARCHAR(60) NULL AFTER color,
  ADD COLUMN carton_qty DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER unit,
  ADD COLUMN qty_per_carton DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER carton_qty,
  ADD COLUMN creditor VARCHAR(120) NULL AFTER price_currency;
