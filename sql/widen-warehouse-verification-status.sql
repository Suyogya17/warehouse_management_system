-- Fix "Data too long for column verification_status" when a product is found
-- in another warehouse. Safe to run more than once.

SET @widen_verification_status = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verification_status'
      AND CHARACTER_MAXIMUM_LENGTH < 40
  ),
  'ALTER TABLE order_item_warehouse_allocations MODIFY COLUMN verification_status VARCHAR(40) NULL',
  'SELECT 1'
);
PREPARE widen_verification_status_stmt FROM @widen_verification_status;
EXECUTE widen_verification_status_stmt;
DEALLOCATE PREPARE widen_verification_status_stmt;
