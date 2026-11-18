-- Establishes the first checksum-tracked migration for installations whose
-- existing schema was created from store_db_final.sql and the legacy sql/
-- patches. It intentionally makes no schema changes.
SELECT 1;
