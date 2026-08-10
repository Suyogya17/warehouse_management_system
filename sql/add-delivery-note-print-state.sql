-- Permanent print state used to prevent unsafe delivery-note number reuse.
-- Safe to run more than once.

SET @add_delivery_note_printed_at = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'delivery_note_printed_at'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN delivery_note_printed_at DATETIME NULL AFTER delivered_at'
);
PREPARE add_delivery_note_printed_at_stmt FROM @add_delivery_note_printed_at;
EXECUTE add_delivery_note_printed_at_stmt;
DEALLOCATE PREPARE add_delivery_note_printed_at_stmt;

SET @add_delivery_note_print_count = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'delivery_note_print_count'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN delivery_note_print_count INT NOT NULL DEFAULT 0 AFTER delivery_note_printed_at'
);
PREPARE add_delivery_note_print_count_stmt FROM @add_delivery_note_print_count;
EXECUTE add_delivery_note_print_count_stmt;
DEALLOCATE PREPARE add_delivery_note_print_count_stmt;

SET @add_delivery_note_printed_at_index = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND INDEX_NAME = 'idx_orders_delivery_note_printed_at'
  ),
  'SELECT 1',
  'CREATE INDEX idx_orders_delivery_note_printed_at ON orders (delivery_note_printed_at)'
);
PREPARE add_delivery_note_printed_at_index_stmt
  FROM @add_delivery_note_printed_at_index;
EXECUTE add_delivery_note_printed_at_index_stmt;
DEALLOCATE PREPARE add_delivery_note_printed_at_index_stmt;
