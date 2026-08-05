CREATE TABLE IF NOT EXISTS chat_message_references (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  reference_type ENUM('PRODUCT', 'ORDER') NOT NULL,
  reference_id BIGINT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_message_reference_message (message_id),
  KEY idx_chat_message_reference_lookup (reference_type, reference_id),
  CONSTRAINT fk_chat_message_reference_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  uploaded_by INT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  thumbnail_name VARCHAR(255) NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_attachment_stored_name (stored_name),
  KEY idx_chat_attachment_message (message_id, id),
  CONSTRAINT fk_chat_attachment_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_attachment_user
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
