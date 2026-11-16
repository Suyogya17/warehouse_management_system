-- Percentage/non-commission product type. Safe to run more than once.
SET @add_finished_good_commission_flag = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'finished_goods'
      AND COLUMN_NAME = 'is_commission'
  ),
  'SELECT 1',
  'ALTER TABLE finished_goods ADD COLUMN is_commission TINYINT(1) NOT NULL DEFAULT 0'
);

PREPARE add_finished_good_commission_flag_stmt
  FROM @add_finished_good_commission_flag;
EXECUTE add_finished_good_commission_flag_stmt;
DEALLOCATE PREPARE add_finished_good_commission_flag_stmt;
