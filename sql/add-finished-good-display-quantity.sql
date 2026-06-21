ALTER TABLE finished_goods
ADD COLUMN display_quantity DECIMAL(10,2) NULL DEFAULT 450;

UPDATE finished_goods
SET display_quantity = 450
WHERE display_quantity IS NULL;
