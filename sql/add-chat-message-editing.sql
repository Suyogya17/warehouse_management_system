-- Adds secure soft-delete and edit timestamps to private chat messages.
-- Safe to run more than once.

SET @add_chat_message_edited_at = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_messages ADD COLUMN edited_at DATETIME(6) NULL AFTER created_at',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_messages'
    AND COLUMN_NAME = 'edited_at'
);
PREPARE add_chat_message_edited_at_stmt FROM @add_chat_message_edited_at;
EXECUTE add_chat_message_edited_at_stmt;
DEALLOCATE PREPARE add_chat_message_edited_at_stmt;

SET @add_chat_message_deleted_at = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE chat_messages ADD COLUMN deleted_at DATETIME(6) NULL AFTER edited_at',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'chat_messages'
    AND COLUMN_NAME = 'deleted_at'
);
PREPARE add_chat_message_deleted_at_stmt FROM @add_chat_message_deleted_at;
EXECUTE add_chat_message_deleted_at_stmt;
DEALLOCATE PREPARE add_chat_message_deleted_at_stmt;
