CREATE TABLE IF NOT EXISTS chat_presence (
  user_id INT NOT NULL,
  active_status_enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  KEY idx_chat_presence_online (active_status_enabled, last_seen_at),
  CONSTRAINT fk_chat_presence_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
