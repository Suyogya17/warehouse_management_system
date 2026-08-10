-- Record the storekeeper's physical verification before warehouse delivery.
-- Safe to run more than once. Apply after add-partial-warehouse-delivery.sql.

SET @add_verification_status = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verification_status'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN verification_status VARCHAR(20) NULL AFTER delivered_at'
);
PREPARE add_verification_status_stmt FROM @add_verification_status;
EXECUTE add_verification_status_stmt;
DEALLOCATE PREPARE add_verification_status_stmt;

SET @add_verified_quantity = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verified_quantity'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN verified_quantity DECIMAL(10,2) NULL AFTER verification_status'
);
PREPARE add_verified_quantity_stmt FROM @add_verified_quantity;
EXECUTE add_verified_quantity_stmt;
DEALLOCATE PREPARE add_verified_quantity_stmt;

SET @add_verification_note = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verification_note'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN verification_note VARCHAR(500) NULL AFTER verified_quantity'
);
PREPARE add_verification_note_stmt FROM @add_verification_note;
EXECUTE add_verification_note_stmt;
DEALLOCATE PREPARE add_verification_note_stmt;

SET @add_verified_by = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verified_by'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN verified_by INT NULL AFTER verification_note'
);
PREPARE add_verified_by_stmt FROM @add_verified_by;
EXECUTE add_verified_by_stmt;
DEALLOCATE PREPARE add_verified_by_stmt;

SET @add_verified_at = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'verified_at'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN verified_at DATETIME NULL AFTER verified_by'
);
PREPARE add_verified_at_stmt FROM @add_verified_at;
EXECUTE add_verified_at_stmt;
DEALLOCATE PREPARE add_verified_at_stmt;

SET @add_verification_status_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND INDEX_NAME = 'idx_oiwa_verification_status'
  ),
  'SELECT 1',
  'CREATE INDEX idx_oiwa_verification_status ON order_item_warehouse_allocations (verification_status)'
);
PREPARE add_verification_status_index_stmt FROM @add_verification_status_index;
EXECUTE add_verification_status_index_stmt;
DEALLOCATE PREPARE add_verification_status_index_stmt;
