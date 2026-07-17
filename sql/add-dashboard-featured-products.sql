ALTER TABLE finished_goods
  ADD COLUMN dashboard_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER display_order,
  ADD COLUMN dashboard_featured_order INT NULL AFTER dashboard_featured;

CREATE INDEX idx_finished_goods_dashboard_featured
  ON finished_goods (dashboard_featured, dashboard_featured_order);
