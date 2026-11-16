-- Optional N-series classification shown on finished-good product cards and
-- warehouse delivery notes. Safe to run more than once.
SET @add_finished_good_n_classification = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'finished_goods'
      AND COLUMN_NAME = 'n_classification'
  ),
  'SELECT 1',
  'ALTER TABLE finished_goods ADD COLUMN n_classification VARCHAR(2) NULL'
);

PREPARE add_finished_good_n_classification_stmt
  FROM @add_finished_good_n_classification;
EXECUTE add_finished_good_n_classification_stmt;
DEALLOCATE PREPARE add_finished_good_n_classification_stmt;
