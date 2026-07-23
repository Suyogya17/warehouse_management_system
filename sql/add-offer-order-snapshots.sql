ALTER TABLE order_items
  ADD COLUMN ordered_from_offer TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN offer_label_snapshot VARCHAR(120) NULL,
  ADD COLUMN offer_display_percentage DECIMAL(5,2) NULL,
  ADD COLUMN offer_display_quantity DECIMAL(12,2) NULL,
  ADD COLUMN offer_price_snapshot DECIMAL(12,2) NULL,
  ADD COLUMN offer_pairs_per_carton_snapshot DECIMAL(12,2) NULL;

CREATE INDEX idx_order_items_offer ON order_items (ordered_from_offer, order_id);
