ALTER TABLE orders
  ADD COLUMN delivery_note_number VARCHAR(50) NULL AFTER stock_deducted,
  ADD COLUMN confirmed_by INT NULL AFTER delivery_note_number,
  ADD COLUMN confirmed_at DATETIME NULL AFTER confirmed_by,
  ADD COLUMN packed_by INT NULL AFTER confirmed_at,
  ADD COLUMN packed_at DATETIME NULL AFTER packed_by,
  ADD COLUMN delivered_by INT NULL AFTER packed_at,
  ADD COLUMN delivered_at DATETIME NULL AFTER delivered_by;

CREATE INDEX idx_orders_delivery_note_number ON orders(delivery_note_number);
CREATE INDEX idx_orders_confirmed_by ON orders(confirmed_by);
CREATE INDEX idx_orders_packed_by ON orders(packed_by);
CREATE INDEX idx_orders_delivered_by ON orders(delivered_by);
