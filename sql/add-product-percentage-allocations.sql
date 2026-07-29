ALTER TABLE user_product_permissions
  ADD COLUMN allocation_percentage DECIMAL(5, 2) NULL AFTER can_view,
  ADD COLUMN allocation_quantity INT NULL AFTER allocation_percentage,
  ADD COLUMN allocation_started_at DATETIME NULL AFTER allocation_quantity;

CREATE INDEX idx_user_product_allocation
  ON user_product_permissions (finished_good_id, user_id, allocation_started_at);

