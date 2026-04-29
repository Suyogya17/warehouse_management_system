-- DROP TABLE IF EXISTS consumption              CASCADE;
-- DROP TABLE IF EXISTS product_bom             CASCADE;
-- DROP TABLE IF EXISTS product_colors          CASCADE;
-- DROP TABLE IF EXISTS product_images          CASCADE;
-- DROP TABLE IF EXISTS production              CASCADE;
-- DROP TABLE IF EXISTS production_rule_components CASCADE;
-- DROP TABLE IF EXISTS production_rules        CASCADE;
-- DROP TABLE IF EXISTS products                CASCADE;
-- DROP TABLE IF EXISTS stock                   CASCADE;
-- DROP TABLE IF EXISTS users                   CASCADE;

CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100)        NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255)        NOT NULL,
  role       VARCHAR(20)         NOT NULL DEFAULT 'USER'
               CHECK (role IN ('ADMIN', 'STORE_KEEPER', 'USER')),
  created_at TIMESTAMP           DEFAULT NOW()
);

SELECT email, password FROM users WHERE email = 'admin7@gmail.com';
SELECT * FROM users
-- WHERE email = 'admin7@gmail.com';
-- DELETE FROM users
-- WHERE email = 'storekeeper@gmail.com';

CREATE TABLE raw_materials (
  id           SERIAL        PRIMARY KEY,
  name         VARCHAR(150)  NOT NULL,         -- e.g. "Leather Upper", "Rubber Sole", "Flat Lace"
  article_code VARCHAR(100),                   -- e.g. "NIAE", "B-001", "LC-001"
  category     VARCHAR(50)   NOT NULL          -- Upper | Sole | Lace | Insole | Adhesive | Thread | Toe Box | Other
  CHECK (category IN ('Upper','Sole','Lace','Insole','Adhesive','Thread','Toe Box','Other')),
  color        VARCHAR(50),                    -- Red, Blue, Black — NULL if not color-specific
  unit         VARCHAR(20)   NOT NULL DEFAULT 'pcs',  -- pcs, pairs, meters, liters, kg
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 0,       -- current total stock
  min_quantity NUMERIC(10,2) NOT NULL DEFAULT 10,      -- low stock alert threshold
  created_at   TIMESTAMP     DEFAULT NOW(),
 
  -- Same article_code + color must be unique
  -- e.g. NIAE-Red is one record, NIAE-Blue is another
  UNIQUE (article_code, color)
);

SELECT * FROM raw_materials;


CREATE TABLE finished_goods (
  id           SERIAL        PRIMARY KEY,
  name         VARCHAR(150)  NOT NULL,    -- e.g. "NIAE Shoe - Red"
  article_code VARCHAR(100),             -- e.g. "NIAE" (from upper)
  sole_code    VARCHAR(100),             -- e.g. "B-001" (from sole)
  color        VARCHAR(50),              -- e.g. "Red" (from upper color)
  size         VARCHAR(20),              -- shoe size e.g. "42", "UK 8" (optional)
  unit         VARCHAR(20)   NOT NULL DEFAULT 'pairs',
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(10,2) NOT NULL DEFAULT 5,
  created_at   TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE stock (
  id              SERIAL        PRIMARY KEY,
  raw_material_id INT           NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  qty_added       NUMERIC(10,2) NOT NULL,      -- how much was purchased/received
  qty_remaining   NUMERIC(10,2) NOT NULL,      -- remaining in this batch (FIFO)
  purchased_at    TIMESTAMP     DEFAULT NOW(),
  notes           TEXT                         -- e.g. "Batch #12 from warehouse"
);

CREATE TABLE formulas (
  id               SERIAL        PRIMARY KEY,
  name             VARCHAR(150)  NOT NULL,       -- e.g. "NIAE + B-001 Standard"
  finished_good_id INT           NOT NULL REFERENCES finished_goods(id) ON DELETE CASCADE,
  output_qty       NUMERIC(10,2) NOT NULL DEFAULT 1,  -- pairs produced per batch
  notes            TEXT,
  created_at       TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE formula_inputs (
  id                       SERIAL        PRIMARY KEY,
  formula_id               INT           NOT NULL REFERENCES formulas(id) ON DELETE CASCADE,
  raw_material_id          INT           NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_needed          NUMERIC(10,2) NOT NULL,   -- per batch
  use_color_from_production BOOLEAN      NOT NULL DEFAULT FALSE,
  -- If TRUE → system will find the matching color variant of this
  --           material at production time
  -- If FALSE → use this exact raw_material_id as-is
 
  UNIQUE (formula_id, raw_material_id)
);

CREATE TABLE production (
  id               SERIAL        PRIMARY KEY,
  formula_id       INT           NOT NULL REFERENCES formulas(id),
  finished_good_id INT           NOT NULL REFERENCES finished_goods(id),
  color            VARCHAR(50),                -- which color upper was used
  batches          NUMERIC(10,2) NOT NULL DEFAULT 1,
  qty_produced     NUMERIC(10,2) NOT NULL,     -- total pairs made
  produced_by      INT           REFERENCES users(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMP     DEFAULT NOW()
);
 
 CREATE TABLE production_items (
  id              SERIAL        PRIMARY KEY,
  production_id   INT           NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  raw_material_id INT           NOT NULL REFERENCES raw_materials(id),
  qty_consumed    NUMERIC(10,2) NOT NULL
);

CREATE TABLE consumption_logs (
  id              SERIAL        PRIMARY KEY,
  raw_material_id INT           NOT NULL REFERENCES raw_materials(id),
  qty_used        NUMERIC(10,2) NOT NULL,
  reason          VARCHAR(255),   -- "Damaged", "QC Reject", "Sample", "Wastage"
  logged_by       INT            REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP      DEFAULT NOW()
);


CREATE TABLE audit_logs (
  id         SERIAL        PRIMARY KEY,
  user_id    INT           REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(255)  NOT NULL,    -- "CREATED", "UPDATED", "DELETED", "PRODUCED"
  table_name VARCHAR(100),             -- "raw_materials", "production", etc.
  record_id  INT,                      -- ID of the affected record
  detail     TEXT,                     -- extra info e.g. "qty changed 200→150"
  created_at TIMESTAMP     DEFAULT NOW()
);

ALTER TABLE raw_materials
ADD COLUMN IF NOT EXISTS image_url VARCHAR(255);

ALTER TABLE finished_goods
ADD COLUMN IF NOT EXISTS image_url VARCHAR(255);

ALTER TABLE formulas ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

SELECT * FROM formulas;
DELETE FROM formulas
WHERE id = 4;


UPDATE formulas
SET is_active = FALSE
WHERE id = 2;

SELECT * FROM formulas WHERE is_active = TRUE;

SELECT * FROM production;
DELETE FROM production
  WHERE id = 3;


SELECT * FROM consumption_logs;
DELETE FROM consumption_logs
WHERE id = 1;

ALTER TABLE formulas
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE finished_goods
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT FALSE;

SELECT * FROM finished_goods;
-- DELETE FROM formulas WHERE finished_good_id = ;
-- DELETE FROM production WHERE finished_good_id = ?
-- DELETE FROM finished_goods WHERE id = ?

-- New table: user_product_permissions
CREATE TABLE user_product_permissions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finished_good_id INT NOT NULL REFERENCES finished_goods(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, finished_good_id)
);

SELECT * FROM production_items;

-- Index for fast lookups
CREATE INDEX idx_user_product_perms ON user_product_permissions(user_id, finished_good_id);

TRUNCATE TABLE 
  production_items,
  production,
  formula_inputs,
  formulas,
  finished_goods,
  stock,
  consumption_logs,
  raw_materials,
  user_product_permissions,
  audit_logs,
  orders,
  order_items
RESTART IDENTITY CASCADE;