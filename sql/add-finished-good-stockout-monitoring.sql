-- Records each real transition from positive physical stock to zero and keeps
-- physical-check history without deleting the underlying stockout evidence.

CREATE TABLE IF NOT EXISTS finished_good_stockout_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  finished_good_id INT NOT NULL,
  previous_quantity DECIMAL(12,2) NOT NULL,
  new_quantity DECIMAL(12,2) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fg_stockout_product_occurred (finished_good_id, occurred_at),
  CONSTRAINT fk_fg_stockout_finished_good
    FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finished_good_physical_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  finished_good_id INT NOT NULL,
  checked_by INT NULL,
  stockout_count_at_check INT NOT NULL DEFAULT 0,
  last_stockout_event_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fg_physical_check_product_checked (finished_good_id, checked_at),
  KEY idx_fg_physical_check_user (checked_by),
  CONSTRAINT fk_fg_physical_check_finished_good
    FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_fg_physical_check_user
    FOREIGN KEY (checked_by) REFERENCES users(id)
    ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_finished_goods_stockout_event;

DELIMITER $$
CREATE TRIGGER trg_finished_goods_stockout_event
AFTER UPDATE ON finished_goods
FOR EACH ROW
BEGIN
  IF COALESCE(OLD.quantity, 0) > 0 AND COALESCE(NEW.quantity, 0) <= 0 THEN
    INSERT INTO finished_good_stockout_events (
      finished_good_id,
      previous_quantity,
      new_quantity
    ) VALUES (
      NEW.id,
      OLD.quantity,
      NEW.quantity
    );
  END IF;
END$$
DELIMITER ;
