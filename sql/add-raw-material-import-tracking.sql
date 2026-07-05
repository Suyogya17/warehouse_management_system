CREATE TABLE IF NOT EXISTS import_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(80) NOT NULL UNIQUE,
  supplier_name VARCHAR(255),
  supplier_country VARCHAR(100),
  sender_name VARCHAR(255),
  agent_name VARCHAR(255),
  shipping_method VARCHAR(50),
  transport_company VARCHAR(255),
  tracking_number VARCHAR(120),
  order_date DATE NOT NULL,
  expected_delivery_date DATE,
  shipped_date DATE,
  delivered_date DATE,
  reached_site_date DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'ORDERED',
  is_test TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INT,
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_order_id INT NOT NULL,
  raw_material_id INT NULL,
  material_name VARCHAR(255) NOT NULL,
  article_code VARCHAR(120),
  category VARCHAR(120),
  color VARCHAR(120),
  unit VARCHAR(40) DEFAULT 'pcs',
  ordered_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_currency VARCHAR(10) NOT NULL DEFAULT 'RMB',
  received_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  damaged_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  short_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_order_id) REFERENCES import_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_containers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_order_id INT NOT NULL,
  container_number VARCHAR(120) NOT NULL,
  seal_number VARCHAR(120),
  container_size VARCHAR(60),
  status VARCHAR(40) NOT NULL DEFAULT 'PLANNED',
  departure_date DATE,
  expected_arrival_date DATE,
  actual_arrival_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (import_order_id) REFERENCES import_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_container_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  container_id INT NOT NULL,
  import_order_item_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (container_id) REFERENCES import_containers(id) ON DELETE CASCADE,
  FOREIGN KEY (import_order_item_id) REFERENCES import_order_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_import_orders_status ON import_orders (status);
CREATE INDEX idx_import_orders_order_date ON import_orders (order_date);
CREATE INDEX idx_import_order_items_material ON import_order_items (raw_material_id);
CREATE INDEX idx_import_containers_order ON import_containers (import_order_id);
