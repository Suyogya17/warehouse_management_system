ALTER TABLE finished_goods
ADD COLUMN display_order INT NOT NULL DEFAULT 0;

SET @row_number := 0;

UPDATE finished_goods
SET display_order = (@row_number := @row_number + 1)
WHERE is_deleted = 0
ORDER BY article_code, color, id;

UPDATE finished_goods
SET display_order = 999999
WHERE is_deleted = 1;

CREATE INDEX idx_finished_goods_display_order
ON finished_goods (display_order, article_code, color, id);
