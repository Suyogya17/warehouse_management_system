CREATE TABLE IF NOT EXISTS dashboard_product_rotation_settings (
  id TINYINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  rotations_per_day TINYINT UNSIGNED NOT NULL DEFAULT 3,
  rotation_times TEXT NOT NULL,
  in_stock_only TINYINT(1) NOT NULL DEFAULT 1,
  locked TINYINT(1) NOT NULL DEFAULT 0,
  locked_rotation_key VARCHAR(120) NULL,
  manual_revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- migrate:split

INSERT IGNORE INTO dashboard_product_rotation_settings
  (id, enabled, rotations_per_day, rotation_times, in_stock_only, locked, manual_revision)
VALUES
  (1, 1, 3, '["06:00", "14:00", "22:00"]', 1, 0, 0);
