CREATE TABLE IF NOT EXISTS import_order_item_splits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_order_item_id INT NOT NULL,
  raw_material_id INT NULL,
  product_article VARCHAR(120) NULL,
  product_name VARCHAR(180) NULL,
  color VARCHAR(80) NULL,
  size VARCHAR(60) NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'IMPORTED',
  source_country VARCHAR(100) NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  used_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  remaining_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_item_splits_item
    FOREIGN KEY (import_order_item_id) REFERENCES import_order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_item_splits_material
    FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS raw_material_lots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_material_id INT NULL,
  import_order_item_id INT NULL,
  import_order_item_split_id INT NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'IMPORTED',
  source_country VARCHAR(100) NULL,
  supplier_name VARCHAR(255) NULL,
  product_article VARCHAR(120) NULL,
  product_name VARCHAR(180) NULL,
  color VARCHAR(80) NULL,
  size VARCHAR(60) NULL,
  qty_received DECIMAL(12,2) NOT NULL DEFAULT 0,
  qty_used DECIMAL(12,2) NOT NULL DEFAULT 0,
  qty_remaining DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit VARCHAR(40) NULL,
  reference_type VARCHAR(60) NULL,
  reference_id INT NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_raw_material_lots_material
    FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
  CONSTRAINT fk_raw_material_lots_import_item
    FOREIGN KEY (import_order_item_id) REFERENCES import_order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_raw_material_lots_import_split
    FOREIGN KEY (import_order_item_split_id) REFERENCES import_order_item_splits(id) ON DELETE CASCADE
);

CREATE INDEX idx_import_item_splits_item ON import_order_item_splits (import_order_item_id);
CREATE INDEX idx_import_item_splits_material ON import_order_item_splits (raw_material_id);
CREATE INDEX idx_raw_material_lots_material ON raw_material_lots (raw_material_id);
CREATE INDEX idx_raw_material_lots_source ON raw_material_lots (source_type, source_country);
CREATE INDEX idx_raw_material_lots_import_item ON raw_material_lots (import_order_item_id);
