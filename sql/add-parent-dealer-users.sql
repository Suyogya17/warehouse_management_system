-- Links a shareholder/sub-dealer shop to the dealer that owns the relationship.
-- Run once before creating the first shareholder-shop account.

ALTER TABLE users
  ADD COLUMN parent_dealer_id INT NULL AFTER role,
  ADD COLUMN parent_allocation_share_percent DECIMAL(7,4) NULL AFTER parent_dealer_id;

CREATE INDEX idx_users_parent_dealer
  ON users (parent_dealer_id, role);

ALTER TABLE users
  ADD CONSTRAINT fk_users_parent_dealer
  FOREIGN KEY (parent_dealer_id) REFERENCES users(id)
  ON DELETE SET NULL;
