ALTER TABLE advertisements
  ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'IMAGE' AFTER image_url;
