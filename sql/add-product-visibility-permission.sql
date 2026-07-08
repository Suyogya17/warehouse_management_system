CREATE TABLE IF NOT EXISTS user_page_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  page_key VARCHAR(100) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_page (user_id, page_key),
  KEY idx_user_page_permissions_user (user_id),
  KEY idx_user_page_permissions_page (page_key)
);

-- Grant product show/hide access to selected co-admins after replacing the ids.
-- INSERT INTO user_page_permissions (user_id, page_key, can_view, can_edit)
-- VALUES (12, 'product_visibility', 1, 1), (18, 'product_visibility', 1, 1)
-- ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);
