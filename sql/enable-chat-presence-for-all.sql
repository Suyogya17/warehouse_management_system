INSERT INTO chat_presence (user_id, active_status_enabled, last_seen_at)
SELECT id, 1, NULL
FROM users
ON DUPLICATE KEY UPDATE active_status_enabled = 1;
