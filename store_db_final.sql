USE nepchawa_warehouse;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM table users;

CREATE TABLE raw_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  article_code VARCHAR(100),
  category VARCHAR(50) NOT NULL,
  color VARCHAR(50),
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_quantity DECIMAL(10,2) NOT NULL DEFAULT 10,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (article_code, color)
);

CREATE TABLE finished_goods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  article_code VARCHAR(100),
  sole_code VARCHAR(100),
  color VARCHAR(50),
  size VARCHAR(20),
  unit VARCHAR(20) NOT NULL DEFAULT 'pairs',
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_quantity DECIMAL(10,2) NOT NULL DEFAULT 5,
  image_url VARCHAR(255),
  is_visible TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_material_id INT NOT NULL,
  qty_added DECIMAL(10,2) NOT NULL,
  qty_remaining DECIMAL(10,2) NOT NULL,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE
);

CREATE TABLE formulas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  finished_good_id INT NOT NULL,
  output_qty DECIMAL(10,2) NOT NULL DEFAULT 1,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE CASCADE
);

CREATE TABLE formula_inputs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formula_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  quantity_needed DECIMAL(10,2) NOT NULL,
  use_color_from_production TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE (formula_id, raw_material_id),
  FOREIGN KEY (formula_id) REFERENCES formulas(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE
);

CREATE TABLE production (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formula_id INT NOT NULL,
  finished_good_id INT NOT NULL,
  color VARCHAR(50),
  batches DECIMAL(10,2) NOT NULL DEFAULT 1,
  qty_produced DECIMAL(10,2) NOT NULL,
  produced_by INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (formula_id) REFERENCES formulas(id),
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id),
  FOREIGN KEY (produced_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE production_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  production_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  qty_consumed DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (production_id) REFERENCES production(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id)
);

CREATE TABLE consumption_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_material_id INT NOT NULL,
  qty_used DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255),
  logged_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255) NOT NULL,
  table_name VARCHAR(100),
  record_id INT,
  detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE user_product_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  finished_good_id INT NOT NULL,
  can_view TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, finished_good_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_product_perms 
ON user_product_permissions(user_id, finished_good_id);

-- NOTE: MySQL does NOT support DROP CONSTRAINT IF EXISTS like PostgreSQL
-- So we skip dropping checks safely

-- raw_materials category constraint (MySQL-safe approach)
-- (MySQL may ignore CHECK depending on version, so treat as documentation-level validation)

ALTER TABLE raw_materials
ADD CONSTRAINT raw_materials_category_check
CHECK (
  category IN (
    'Upper',
    'Sole',
    'Sole Powder',
    'Sole Foam',
    'TPR',
    'Lace',
    'Inner Box',
    'Outer Box',
    'Chemical',
    'Insole',
    'Adhesive',
    'Thread',
    'Toe Box',
    'Packing',
    'Other'
  )
);

-- finished_goods columns (run only once)
ALTER TABLE finished_goods
ADD COLUMN inner_box_per_pair DECIMAL(10,2) NOT NULL DEFAULT 1,
ADD COLUMN inner_boxes_per_outer_box DECIMAL(10,2);

-- formula_inputs column
ALTER TABLE formula_inputs
ADD COLUMN consumption_basis VARCHAR(30) NOT NULL DEFAULT 'PER_PAIR';

-- MySQL does NOT support DROP CONSTRAINT IF EXISTS safely
-- So we skip it or handle manually if needed

-- consumption_basis validation (MySQL CHECK - optional support)
ALTER TABLE formula_inputs
ADD CONSTRAINT formula_inputs_consumption_basis_check
CHECK (consumption_basis IN ('PER_PAIR', 'PER_OUTER_BOX'));

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  finished_good_id INT NOT NULL,
  qty_ordered DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_finished_good ON order_items(finished_good_id);


ALTER TABLE finished_goods
ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 0;


SELECT * FROM users;

