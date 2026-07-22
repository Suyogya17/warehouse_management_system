ALTER TABLE finished_goods
  ADD COLUMN offer_all_users TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE finished_good_offer_users (
  finished_good_id INT NOT NULL,
  user_id INT NOT NULL,
  display_quantity DECIMAL(12,2) NOT NULL DEFAULT 450,
  display_percentage DECIMAL(5,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finished_good_id, user_id),
  CONSTRAINT fk_offer_user_product FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_user_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
