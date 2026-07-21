ALTER TABLE import_order_item_splits
  ADD COLUMN stock_added_at DATETIME NULL,
  ADD COLUMN stock_added_by INT NULL;

