  -- Named warehouse groups and planned allocations for grouped delivery notes.
  -- This migration is safe to run more than once.

  CREATE TABLE IF NOT EXISTS warehouse_print_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS warehouse_print_group_members (
    print_group_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (print_group_id, warehouse_id),
    UNIQUE KEY uniq_warehouse_print_group_member (warehouse_id),
    CONSTRAINT fk_wpgm_group
      FOREIGN KEY (print_group_id) REFERENCES warehouse_print_groups(id),
    CONSTRAINT fk_wpgm_warehouse
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  );

  INSERT INTO warehouse_print_groups (code, name, display_order)
  VALUES
    ('FACTORY_WAREHOUSE', 'Factory Warehouse', 1),
    ('DHALKU', 'Dhalku', 2),
    ('KALANKI', 'Kalanki', 3)
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    display_order = VALUES(display_order),
    is_active = 1;

  -- Rebuild the default membership from the operational warehouse number in the
  -- name (for example W-4(DHALKU)). Database IDs are not treated as warehouse
  -- numbers because a legacy Main Warehouse row may have been inserted first.
  DELETE members
  FROM warehouse_print_group_members members
  JOIN warehouse_print_groups print_group
    ON print_group.id = members.print_group_id
  WHERE print_group.code IN ('FACTORY_WAREHOUSE', 'DHALKU', 'KALANKI');

  -- Warehouses 1, 2 and 3 print together as Factory Warehouse.
  INSERT INTO warehouse_print_group_members (print_group_id, warehouse_id)
  SELECT print_group.id, warehouse.id
  FROM warehouse_print_groups print_group
  JOIN warehouses warehouse
    ON LOWER(warehouse.name) REGEXP '^(w|warehouse)[ _-]*[123]([^0-9]|$)'
  WHERE print_group.code = 'FACTORY_WAREHOUSE'
  ON DUPLICATE KEY UPDATE print_group_id = VALUES(print_group_id);

  -- Warehouses 4 and 6 print together as Dhalku.
  INSERT INTO warehouse_print_group_members (print_group_id, warehouse_id)
  SELECT print_group.id, warehouse.id
  FROM warehouse_print_groups print_group
  JOIN warehouses warehouse
    ON LOWER(warehouse.name) REGEXP '^(w|warehouse)[ _-]*[46]([^0-9]|$)'
  WHERE print_group.code = 'DHALKU'
  ON DUPLICATE KEY UPDATE print_group_id = VALUES(print_group_id);

  -- Warehouse 5 prints as Kalanki.
  INSERT INTO warehouse_print_group_members (print_group_id, warehouse_id)
  SELECT print_group.id, warehouse.id
  FROM warehouse_print_groups print_group
  JOIN warehouses warehouse
    ON LOWER(warehouse.name) REGEXP '^(w|warehouse)[ _-]*5([^0-9]|$)'
  WHERE print_group.code = 'KALANKI'
  ON DUPLICATE KEY UPDATE print_group_id = VALUES(print_group_id);

  SET @add_allocation_status = IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND COLUMN_NAME = 'allocation_status'
    ),
    'SELECT 1',
    'ALTER TABLE order_item_warehouse_allocations ADD COLUMN allocation_status VARCHAR(20) NOT NULL DEFAULT ''DEDUCTED'' AFTER quantity'
  );
  PREPARE add_allocation_status_stmt FROM @add_allocation_status;
  EXECUTE add_allocation_status_stmt;
  DEALLOCATE PREPARE add_allocation_status_stmt;

  SET @add_packed_quantity = IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND COLUMN_NAME = 'packed_quantity'
    ),
    'SELECT 1',
    'ALTER TABLE order_item_warehouse_allocations ADD COLUMN packed_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER allocation_status'
  );
  PREPARE add_packed_quantity_stmt FROM @add_packed_quantity;
  EXECUTE add_packed_quantity_stmt;
  DEALLOCATE PREPARE add_packed_quantity_stmt;

  SET @add_print_group_code = IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND COLUMN_NAME = 'print_group_code_snapshot'
    ),
    'SELECT 1',
    'ALTER TABLE order_item_warehouse_allocations ADD COLUMN print_group_code_snapshot VARCHAR(50) NULL AFTER packed_quantity'
  );
  PREPARE add_print_group_code_stmt FROM @add_print_group_code;
  EXECUTE add_print_group_code_stmt;
  DEALLOCATE PREPARE add_print_group_code_stmt;

  SET @add_print_group_name = IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND COLUMN_NAME = 'print_group_name_snapshot'
    ),
    'SELECT 1',
    'ALTER TABLE order_item_warehouse_allocations ADD COLUMN print_group_name_snapshot VARCHAR(120) NULL AFTER print_group_code_snapshot'
  );
  PREPARE add_print_group_name_stmt FROM @add_print_group_name;
  EXECUTE add_print_group_name_stmt;
  DEALLOCATE PREPARE add_print_group_name_stmt;

  SET @add_allocation_updated_at = IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND COLUMN_NAME = 'updated_at'
    ),
    'SELECT 1',
    'ALTER TABLE order_item_warehouse_allocations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
  );
  PREPARE add_allocation_updated_at_stmt FROM @add_allocation_updated_at;
  EXECUTE add_allocation_updated_at_stmt;
  DEALLOCATE PREPARE add_allocation_updated_at_stmt;

  UPDATE order_item_warehouse_allocations
  SET allocation_status = 'DEDUCTED',
      packed_quantity = quantity
  WHERE allocation_status IS NULL
    OR allocation_status = ''
    OR (allocation_status = 'DEDUCTED' AND packed_quantity = 0);

  SET @add_allocation_status_index = IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_item_warehouse_allocations'
        AND INDEX_NAME = 'idx_oiwa_status'
    ),
    'SELECT 1',
    'CREATE INDEX idx_oiwa_status ON order_item_warehouse_allocations (allocation_status)'
  );
  PREPARE add_allocation_status_index_stmt FROM @add_allocation_status_index;
  EXECUTE add_allocation_status_index_stmt;
  DEALLOCATE PREPARE add_allocation_status_index_stmt;
