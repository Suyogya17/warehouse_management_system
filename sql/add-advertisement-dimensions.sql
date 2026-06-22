ALTER TABLE advertisements
  ADD COLUMN width_percent INT NOT NULL DEFAULT 100 AFTER placement,
  ADD COLUMN height_px INT NOT NULL DEFAULT 320 AFTER width_percent;
