ALTER TABLE consumption_logs
MODIFY raw_material_id INT NULL;

ALTER TABLE consumption_logs
ADD COLUMN finished_good_id INT NULL AFTER raw_material_id,
ADD COLUMN warehouse_id INT NULL AFTER finished_good_id;

ALTER TABLE consumption_logs
ADD INDEX idx_consumption_finished_good (finished_good_id),
ADD INDEX idx_consumption_warehouse (warehouse_id);
