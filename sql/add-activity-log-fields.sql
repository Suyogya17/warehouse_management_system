ALTER TABLE audit_logs
  ADD COLUMN user_name VARCHAR(255) NULL AFTER user_id,
  ADD COLUMN user_role VARCHAR(50) NULL AFTER user_name,
  ADD COLUMN action_type VARCHAR(80) NULL AFTER action,
  ADD COLUMN module VARCHAR(100) NULL AFTER action_type,
  ADD COLUMN entity_type VARCHAR(100) NULL AFTER module,
  ADD COLUMN entity_id INT NULL AFTER entity_type,
  ADD COLUMN entity_name VARCHAR(255) NULL AFTER entity_id,
  ADD COLUMN description TEXT NULL AFTER entity_name,
  ADD COLUMN metadata JSON NULL AFTER description,
  ADD COLUMN ip_address VARCHAR(64) NULL AFTER metadata;

UPDATE audit_logs
SET
  action_type = COALESCE(action_type, action),
  module = COALESCE(module, table_name),
  entity_type = COALESCE(entity_type, table_name),
  entity_id = COALESCE(entity_id, record_id),
  description = COALESCE(description, detail);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs (action_type);
CREATE INDEX idx_audit_logs_module ON audit_logs (module);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
