-- Standalone images for the customer dashboard carousel.
-- These images do not replace or alter finished-good product photos.
CREATE TABLE IF NOT EXISTS dashboard_carousel_slides (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NULL,
  image_url VARCHAR(500) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dashboard_carousel_slides_order (display_order, is_active)
);
