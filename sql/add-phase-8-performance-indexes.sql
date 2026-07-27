-- Phase 8 performance indexes.
-- Idempotent: an index is added only when its table/columns exist and the
-- index name is not already installed.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_index_if_missing$$
CREATE PROCEDURE add_index_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_columns_sql VARCHAR(500),
  IN p_required_columns VARCHAR(500),
  IN p_required_count INT
)
BEGIN
  DECLARE table_count INT DEFAULT 0;
  DECLARE column_count INT DEFAULT 0;
  DECLARE index_count INT DEFAULT 0;

  SELECT COUNT(*)
    INTO table_count
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = p_table_name;

  SELECT COUNT(*)
    INTO column_count
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = p_table_name
    AND FIND_IN_SET(column_name, p_required_columns) > 0;

  SELECT COUNT(*)
    INTO index_count
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = p_table_name
    AND index_name = p_index_name;

  IF table_count = 1
     AND column_count = p_required_count
     AND index_count = 0 THEN
    SET @index_sql = CONCAT(
      'ALTER TABLE `',
      REPLACE(p_table_name, '`', '``'),
      '` ADD INDEX `',
      REPLACE(p_index_name, '`', '``'),
      '` (',
      p_columns_sql,
      ')'
    );
    PREPARE index_statement FROM @index_sql;
    EXECUTE index_statement;
    DEALLOCATE PREPARE index_statement;
  END IF;
END$$

DELIMITER ;

CALL add_index_if_missing(
  'orders',
  'idx_orders_created_at_id',
  '`created_at`, `id`',
  'created_at,id',
  2
);
CALL add_index_if_missing(
  'orders',
  'idx_orders_created_by_created_at_id',
  '`created_by`, `created_at`, `id`',
  'created_by,created_at,id',
  3
);
CALL add_index_if_missing(
  'orders',
  'idx_orders_status_created_at_id',
  '`status`, `created_at`, `id`',
  'status,created_at,id',
  3
);
CALL add_index_if_missing(
  'order_items',
  'idx_order_items_order_product',
  '`order_id`, `finished_good_id`',
  'order_id,finished_good_id',
  2
);
CALL add_index_if_missing(
  'order_items',
  'idx_order_items_product_order',
  '`finished_good_id`, `order_id`',
  'finished_good_id,order_id',
  2
);
CALL add_index_if_missing(
  'order_items',
  'idx_order_items_offer_order_product',
  '`ordered_from_offer`, `order_id`, `finished_good_id`',
  'ordered_from_offer,order_id,finished_good_id',
  3
);
CALL add_index_if_missing(
  'production',
  'idx_production_product_created',
  '`finished_good_id`, `created_at`, `id`',
  'finished_good_id,created_at,id',
  3
);
CALL add_index_if_missing(
  'production',
  'idx_production_created_product',
  '`created_at`, `finished_good_id`',
  'created_at,finished_good_id',
  2
);
CALL add_index_if_missing(
  'finished_goods',
  'idx_finished_goods_active_display',
  '`is_deleted`, `display_order`, `id`',
  'is_deleted,display_order,id',
  3
);
CALL add_index_if_missing(
  'finished_goods',
  'idx_finished_goods_active_series',
  '`is_deleted`, `sole_code`, `id`',
  'is_deleted,sole_code,id',
  3
);
CALL add_index_if_missing(
  'product_interest_events',
  'idx_interest_user_event_surface_created',
  '`user_id`, `event_type`, `surface`, `created_at`',
  'user_id,event_type,surface,created_at',
  4
);
CALL add_index_if_missing(
  'product_interest_events',
  'idx_interest_user_product_event',
  '`user_id`, `finished_good_id`, `event_type`, `surface`, `created_at`',
  'user_id,finished_good_id,event_type,surface,created_at',
  5
);
CALL add_index_if_missing(
  'finished_good_warehouse_stock',
  'idx_fg_warehouse_stock_product_qty',
  '`finished_good_id`, `quantity`, `updated_at`, `id`',
  'finished_good_id,quantity,updated_at,id',
  4
);
CALL add_index_if_missing(
  'finished_good_offer_users',
  'idx_offer_users_product_user',
  '`finished_good_id`, `user_id`',
  'finished_good_id,user_id',
  2
);

DROP PROCEDURE IF EXISTS add_index_if_missing;
