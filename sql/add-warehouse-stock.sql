CREATE TABLE IF NOT EXISTS warehouses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  updated_by INT NULL,
  deleted_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  FOREIGN KEY (deleted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finished_good_warehouse_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  finished_good_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fg_warehouse (finished_good_id, warehouse_id),
  INDEX idx_fgws_finished_good (finished_good_id),
  INDEX idx_fgws_warehouse (warehouse_id),
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finished_good_warehouse_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  finished_good_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  movement_type VARCHAR(30) NOT NULL,
  reference_type VARCHAR(30) NULL,
  reference_id INT NULL,
  notes TEXT,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fgwm_finished_good (finished_good_id),
  INDEX idx_fgwm_warehouse (warehouse_id),
  INDEX idx_fgwm_reference (reference_type, reference_id),
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_item_warehouse_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT NOT NULL,
  finished_good_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_oiwa_order_item (order_item_id),
  INDEX idx_oiwa_finished_good (finished_good_id),
  INDEX idx_oiwa_warehouse (warehouse_id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO warehouses (name)
SELECT 'Main Warehouse'
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses WHERE name = 'Main Warehouse'
);

INSERT INTO finished_good_warehouse_stock
  (finished_good_id, warehouse_id, quantity)
SELECT
  fg.id,
  w.id,
  fg.quantity
FROM finished_goods fg
JOIN warehouses w ON w.name = 'Main Warehouse'
WHERE fg.quantity > 0
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);
