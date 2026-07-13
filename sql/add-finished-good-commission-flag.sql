ALTER TABLE finished_goods
  ADD COLUMN is_commission TINYINT(1) NOT NULL DEFAULT 0 AFTER price;
