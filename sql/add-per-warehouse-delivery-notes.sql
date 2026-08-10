-- Independent sequential delivery-note numbers per warehouse and order.
-- Existing orders.delivery_note_number values remain untouched and continue to
-- use the legacy master-DN workflow. Safe to run more than once.

CREATE TABLE IF NOT EXISTS delivery_note_sequences (
  sequence_key VARCHAR(30) PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_warehouse_delivery_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  delivery_note_number VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  bs_fiscal_year VARCHAR(20) NULL,
  assigned_by INT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at DATETIME NULL,
  print_count INT NOT NULL DEFAULT 0,
  voided_at DATETIME NULL,
  void_reason VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_order_warehouse_dn (order_id, warehouse_id),
  UNIQUE KEY uniq_warehouse_delivery_note_number (delivery_note_number),
  INDEX idx_owdn_order_status (order_id, status),
  INDEX idx_owdn_warehouse (warehouse_id),
  INDEX idx_owdn_fiscal_year (bs_fiscal_year),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_warehouse_dn_reassignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_delivery_note_id INT NOT NULL,
  destination_delivery_note_id INT NOT NULL,
  reassigned_by INT NULL,
  reassigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_warehouse_dn_reassignment
    (source_delivery_note_id, destination_delivery_note_id),
  INDEX idx_owdn_reassignment_destination (destination_delivery_note_id),
  FOREIGN KEY (source_delivery_note_id)
    REFERENCES order_warehouse_delivery_notes(id),
  FOREIGN KEY (destination_delivery_note_id)
    REFERENCES order_warehouse_delivery_notes(id),
  FOREIGN KEY (reassigned_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_warehouse_delivery_note_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  old_delivery_note_number VARCHAR(50) NOT NULL,
  new_delivery_note_number VARCHAR(50) NOT NULL,
  old_printed_at DATETIME NULL,
  old_print_count INT NOT NULL DEFAULT 0,
  reason VARCHAR(500) NOT NULL,
  corrected_by INT NULL,
  corrected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_corrected_warehouse_dn (old_delivery_note_number),
  INDEX idx_owdn_correction_order (order_id),
  INDEX idx_owdn_correction_new_dn (new_delivery_note_number),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (corrected_by) REFERENCES users(id)
);
