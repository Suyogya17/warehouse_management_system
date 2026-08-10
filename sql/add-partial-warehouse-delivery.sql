-- Allow each warehouse slip under one master delivery note to be delivered
-- independently. Safe to run more than once.

SET @add_warehouse_delivered_by = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'delivered_by'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN delivered_by INT NULL AFTER print_group_name_snapshot'
);
PREPARE add_warehouse_delivered_by_stmt FROM @add_warehouse_delivered_by;
EXECUTE add_warehouse_delivered_by_stmt;
DEALLOCATE PREPARE add_warehouse_delivered_by_stmt;

SET @add_warehouse_delivered_at = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND COLUMN_NAME = 'delivered_at'
  ),
  'SELECT 1',
  'ALTER TABLE order_item_warehouse_allocations ADD COLUMN delivered_at DATETIME NULL AFTER delivered_by'
);
PREPARE add_warehouse_delivered_at_stmt FROM @add_warehouse_delivered_at;
EXECUTE add_warehouse_delivered_at_stmt;
DEALLOCATE PREPARE add_warehouse_delivered_at_stmt;

SET @add_order_warehouse_status_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_item_warehouse_allocations'
      AND INDEX_NAME = 'idx_oiwa_item_warehouse_status'
  ),
  'SELECT 1',
  'CREATE INDEX idx_oiwa_item_warehouse_status ON order_item_warehouse_allocations (order_item_id, warehouse_id, allocation_status)'
);
PREPARE add_order_warehouse_status_index_stmt FROM @add_order_warehouse_status_index;
EXECUTE add_order_warehouse_status_index_stmt;
DEALLOCATE PREPARE add_order_warehouse_status_index_stmt;

