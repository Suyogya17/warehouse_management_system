CREATE TABLE IF NOT EXISTS warehouse_billing_history (
 id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, warehouse_id INT NOT NULL,
 delivery_note_number VARCHAR(50), created_by INT, output_type VARCHAR(20) NOT NULL,
 invoice_number VARCHAR(100), final_total DECIMAL(14,2), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_wbh_order_warehouse (order_id, warehouse_id)
);
