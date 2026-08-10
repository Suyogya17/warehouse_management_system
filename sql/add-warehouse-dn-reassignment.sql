-- Track an emptied warehouse DN as reassigned to one or more destination DNs.
-- This preserves the permanent source number without presenting it as a
-- deliverable or partially delivered note. Safe to run more than once.

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
