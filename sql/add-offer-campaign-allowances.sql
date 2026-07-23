CREATE TABLE finished_good_offer_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  finished_good_id INT NOT NULL,
  offer_label VARCHAR(120) NULL,
  offer_ends_at DATETIME NULL,
  offer_all_users TINYINT(1) NOT NULL DEFAULT 1,
  stock_quantity_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  pairs_per_carton_snapshot DECIMAL(12,2) NULL,
  status ENUM('ACTIVE', 'ENDED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_offer_campaign_product_status (finished_good_id, status),
  CONSTRAINT fk_offer_campaign_product
    FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_campaign_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE finished_good_offer_campaign_users (
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  display_quantity DECIMAL(12,2) NOT NULL,
  display_percentage DECIMAL(5,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  KEY idx_offer_campaign_user (user_id, campaign_id),
  CONSTRAINT fk_offer_campaign_user_campaign
    FOREIGN KEY (campaign_id) REFERENCES finished_good_offer_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_campaign_user_account
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE finished_goods
  ADD COLUMN offer_campaign_id BIGINT UNSIGNED NULL,
  ADD KEY idx_finished_goods_offer_campaign (offer_campaign_id),
  ADD CONSTRAINT fk_finished_goods_offer_campaign
    FOREIGN KEY (offer_campaign_id) REFERENCES finished_good_offer_campaigns(id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN offer_campaign_id BIGINT UNSIGNED NULL,
  ADD KEY idx_order_items_offer_campaign (offer_campaign_id, finished_good_id),
  ADD CONSTRAINT fk_order_items_offer_campaign
    FOREIGN KEY (offer_campaign_id) REFERENCES finished_good_offer_campaigns(id) ON DELETE SET NULL;

INSERT INTO finished_good_offer_campaigns (
  finished_good_id,
  offer_label,
  offer_ends_at,
  offer_all_users,
  stock_quantity_snapshot,
  pairs_per_carton_snapshot,
  status
)
SELECT
  fg.id,
  fg.offer_label,
  fg.offer_ends_at,
  COALESCE(fg.offer_all_users, 1),
  GREATEST(COALESCE(fg.quantity, 0), 0),
  NULLIF(fg.inner_boxes_per_outer_box, 0),
  'ACTIVE'
FROM finished_goods fg
WHERE fg.offer_enabled = 1
  AND (fg.offer_ends_at IS NULL OR fg.offer_ends_at >= NOW());

UPDATE finished_goods fg
JOIN finished_good_offer_campaigns campaign
  ON campaign.finished_good_id = fg.id
 AND campaign.status = 'ACTIVE'
SET fg.offer_campaign_id = campaign.id
WHERE fg.offer_enabled = 1
  AND (fg.offer_ends_at IS NULL OR fg.offer_ends_at >= NOW());

INSERT INTO finished_good_offer_campaign_users (
  campaign_id,
  user_id,
  display_quantity,
  display_percentage
)
SELECT
  fg.offer_campaign_id,
  audience.user_id,
  audience.display_quantity,
  audience.display_percentage
FROM finished_goods fg
JOIN finished_good_offer_users audience
  ON audience.finished_good_id = fg.id
WHERE fg.offer_campaign_id IS NOT NULL;
