-- Structured cancellation categories for dependable sales and dealer analytics.
-- This migration is safe to run more than once.

DROP PROCEDURE IF EXISTS add_structured_order_cancellations;

DELIMITER $$
CREATE PROCEDURE add_structured_order_cancellations()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND column_name = 'cancellation_code'
  ) THEN
    ALTER TABLE orders
      ADD COLUMN cancellation_code VARCHAR(48) NULL AFTER cancellation_reason;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND column_name = 'duplicate_of_order_id'
  ) THEN
    ALTER TABLE orders
      ADD COLUMN duplicate_of_order_id INT NULL AFTER cancellation_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND index_name = 'idx_orders_cancellation_code'
  ) THEN
    CREATE INDEX idx_orders_cancellation_code
      ON orders (status, cancellation_code, created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND index_name = 'idx_orders_duplicate_of'
  ) THEN
    CREATE INDEX idx_orders_duplicate_of
      ON orders (duplicate_of_order_id);
  END IF;
END$$
DELIMITER ;

CALL add_structured_order_cancellations();
DROP PROCEDURE IF EXISTS add_structured_order_cancellations;

-- The business confirmed that historical cancellations were repeated orders.
-- Existing cancelled orders are therefore classified as duplicates. Their
-- original free-text reasons remain untouched for audit history.
UPDATE orders
SET cancellation_code = 'DUPLICATE_ORDER'
WHERE status = 'CANCELLED'
  AND cancellation_code IS NULL;
