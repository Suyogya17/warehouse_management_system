-- Preserve printed warehouse DN numbers when correcting a system-generated
-- sequence error. The old paper becomes invalid but remains permanently
-- traceable to its replacement. Safe to run more than once.

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
