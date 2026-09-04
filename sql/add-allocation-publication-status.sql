-- Keeps product allocation planning separate from public product visibility.
-- Existing allocations remain active after migration.
ALTER TABLE finished_goods
  ADD COLUMN allocation_publication_status ENUM('DRAFT', 'ACTIVE', 'SCHEDULED')
    NOT NULL DEFAULT 'ACTIVE' AFTER is_visible,
  ADD COLUMN allocation_publish_at DATETIME NULL
    AFTER allocation_publication_status;

