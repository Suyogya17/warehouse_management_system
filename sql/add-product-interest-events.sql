CREATE TABLE IF NOT EXISTS product_interest_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  event_type ENUM('SEARCH', 'PRODUCT_INTEREST') NOT NULL,
  surface VARCHAR(40) NOT NULL,
  search_term VARCHAR(160) NULL,
  finished_good_id INT NULL,
  result_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_interest_user_created (user_id, created_at),
  KEY idx_product_interest_product_created (finished_good_id, created_at),
  KEY idx_product_interest_surface_created (surface, created_at),
  CONSTRAINT fk_product_interest_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_interest_finished_good
    FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE SET NULL
);
