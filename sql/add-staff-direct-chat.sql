-- Adds private ADMIN/CO_ADMIN direct conversations without changing customer support chats.
-- Safe to run more than once.

SET @add_chat_conversation_type = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_conversations ADD COLUMN conversation_type ENUM(''CUSTOMER_SUPPORT'',''STAFF_DIRECT'') NOT NULL DEFAULT ''CUSTOMER_SUPPORT'' AFTER id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_conversations'
    AND COLUMN_NAME = 'conversation_type'
);
PREPARE add_chat_conversation_type_stmt FROM @add_chat_conversation_type;
EXECUTE add_chat_conversation_type_stmt;
DEALLOCATE PREPARE add_chat_conversation_type_stmt;

SET @add_chat_staff_pair_key = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_conversations ADD COLUMN staff_pair_key VARCHAR(80) NULL AFTER assigned_admin_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_conversations'
    AND COLUMN_NAME = 'staff_pair_key'
);
PREPARE add_chat_staff_pair_key_stmt FROM @add_chat_staff_pair_key;
EXECUTE add_chat_staff_pair_key_stmt;
DEALLOCATE PREPARE add_chat_staff_pair_key_stmt;

ALTER TABLE chat_conversations MODIFY COLUMN user_id INT NULL;

SET @add_chat_staff_pair_index = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_conversations ADD UNIQUE KEY uq_chat_conversation_staff_pair (staff_pair_key)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_conversations'
    AND INDEX_NAME = 'uq_chat_conversation_staff_pair'
);
PREPARE add_chat_staff_pair_index_stmt FROM @add_chat_staff_pair_index;
EXECUTE add_chat_staff_pair_index_stmt;
DEALLOCATE PREPARE add_chat_staff_pair_index_stmt;

SET @add_chat_type_activity_index = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_conversations ADD KEY idx_chat_conversations_type_activity (conversation_type, last_message_at)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_conversations'
    AND INDEX_NAME = 'idx_chat_conversations_type_activity'
);
PREPARE add_chat_type_activity_index_stmt FROM @add_chat_type_activity_index;
EXECUTE add_chat_type_activity_index_stmt;
DEALLOCATE PREPARE add_chat_type_activity_index_stmt;

CREATE TABLE IF NOT EXISTS chat_conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_chat_participants_user (user_id, conversation_id),
  CONSTRAINT fk_chat_participant_conversation
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_participant_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
