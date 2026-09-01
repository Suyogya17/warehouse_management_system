-- Run this only when add-parent-dealer-users.sql was already installed before
-- parent allocation shares were added.
ALTER TABLE users
  ADD COLUMN parent_allocation_share_percent DECIMAL(7,4) NULL
  AFTER parent_dealer_id;
