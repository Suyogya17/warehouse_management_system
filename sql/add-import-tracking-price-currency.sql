ALTER TABLE import_order_items
  ADD COLUMN price_currency VARCHAR(10) NOT NULL DEFAULT 'RMB' AFTER unit_price;
