-- Adds a second product-allocation behaviour without changing existing records.
-- EXCLUSIVE: only selected users can see/order the product (legacy behaviour).
-- PRIVATE: selected quantities are protected; other permitted users share the remainder.

ALTER TABLE user_product_permissions
  ADD COLUMN allocation_scope ENUM('EXCLUSIVE', 'PRIVATE', 'CONTROLLED') NULL
  AFTER allocation_started_at;

UPDATE user_product_permissions
SET allocation_scope = 'EXCLUSIVE'
WHERE allocation_quantity IS NOT NULL
  AND allocation_scope IS NULL;

CREATE INDEX idx_user_product_allocation_scope
  ON user_product_permissions (finished_good_id, allocation_scope, user_id);

CREATE TABLE IF NOT EXISTS product_controlled_release_pools (
  finished_good_id INT PRIMARY KEY,
  public_quantity INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_controlled_release_product
    FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
    ON DELETE CASCADE
);

ALTER TABLE order_items
  ADD COLUMN controlled_personal_quantity INT NOT NULL DEFAULT 0
    AFTER qty_ordered,
  ADD COLUMN controlled_public_quantity INT NOT NULL DEFAULT 0
    AFTER controlled_personal_quantity;

CREATE INDEX idx_controlled_release_order_usage
  ON order_items (finished_good_id, controlled_personal_quantity, controlled_public_quantity);
