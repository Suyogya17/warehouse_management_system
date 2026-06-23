const { query } = require('../config/db');

const normalizeTone = (value) => {
  const tone = String(value || 'info').toLowerCase();
  return ['info', 'success', 'warning', 'error'].includes(tone) ? tone : 'info';
};

const mapNotification = (row) => ({
  id: row.id,
  unique_key: row.unique_key,
  title: row.title,
  message: row.message,
  tone: row.tone,
  read: Boolean(row.is_read),
  createdAt: row.created_at,
  readAt: row.read_at,
});

const getAll = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const rows = await query(
      `SELECT id, unique_key, title, message, tone, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [req.user.id, limit]
    );

    return res.json({ success: true, data: rows.map(mapNotification) });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    const uniqueKey = String(req.body.unique_key || '').trim();
    const isRead = req.body.read === true || req.body.is_read === true || req.body.is_read === 1 ? 1 : 0;

    if (!title || !message || !uniqueKey) {
      return res.status(400).json({
        success: false,
        message: 'title, message and unique_key are required.',
      });
    }

    await query(
      `INSERT INTO notifications (user_id, unique_key, title, message, tone, is_read, read_at)
       VALUES (?, ?, ?, ?, ?, ?, IF(? = 1, NOW(), NULL))
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         message = VALUES(message),
         tone = VALUES(tone),
         is_read = GREATEST(is_read, VALUES(is_read)),
         read_at = IF(GREATEST(is_read, VALUES(is_read)) = 1, COALESCE(read_at, NOW()), read_at)`,
      [req.user.id, uniqueKey, title, message, normalizeTone(req.body.tone), isRead, isRead]
    );

    const rows = await query(
      `SELECT id, unique_key, title, message, tone, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = ? AND unique_key = ?
       LIMIT 1`,
      [req.user.id, uniqueKey]
    );

    return res.status(201).json({
      success: true,
      data: rows[0] ? mapNotification(rows[0]) : null,
    });
  } catch (error) {
    next(error);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const markOneRead = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, create, markAllRead, markOneRead };
