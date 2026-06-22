const { query } = require('../config/db');

const imagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);
const mediaType = (req) => (req.file?.mimetype?.startsWith('video/') ? 'VIDEO' : 'IMAGE');
const placement = (value) =>
  ['ABOVE_STATUS', 'BELOW_STATUS'].includes(String(value).toUpperCase())
    ? String(value).toUpperCase()
    : 'BELOW_STATUS';
const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const nullable = (value) => (value === undefined || value === null || value === '' ? null : value);

const getAll = async (req, res, next) => {
  try {
    const canManage = ['ADMIN', 'CO_ADMIN'].includes(req.user.role);
    const sql = canManage
      ? `SELECT * FROM advertisements ORDER BY display_order, created_at DESC`
      : `SELECT * FROM advertisements
         WHERE is_active = 1
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (ends_at IS NULL OR ends_at >= NOW())
         ORDER BY display_order, created_at DESC`;
    const rows = await query(sql);
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    const result = await query(
      `INSERT INTO advertisements
       (title, message, image_url, media_type, placement, width_percent, height_px,
        link_url, is_active, display_order, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        nullable(req.body.message),
        imagePath(req),
        mediaType(req),
        placement(req.body.placement),
        clampNumber(req.body.width_percent, 50, 100, 100),
        clampNumber(req.body.height_px, 180, 600, 320),
        nullable(req.body.link_url),
        String(req.body.is_active) === 'false' || String(req.body.is_active) === '0' ? 0 : 1,
        Number(req.body.display_order || 0),
        nullable(req.body.starts_at),
        nullable(req.body.ends_at),
      ]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    const nextImage = imagePath(req);
    const params = [
      title,
      nullable(req.body.message),
      placement(req.body.placement),
      clampNumber(req.body.width_percent, 50, 100, 100),
      clampNumber(req.body.height_px, 180, 600, 320),
      nullable(req.body.link_url),
      String(req.body.is_active) === 'false' || String(req.body.is_active) === '0' ? 0 : 1,
      Number(req.body.display_order || 0),
      nullable(req.body.starts_at),
      nullable(req.body.ends_at),
    ];
    let sql = `UPDATE advertisements
               SET title = ?, message = ?, placement = ?, width_percent = ?, height_px = ?,
                   link_url = ?, is_active = ?,
                   display_order = ?, starts_at = ?, ends_at = ?`;
    if (nextImage) {
      sql += `, image_url = ?, media_type = ?`;
      params.push(nextImage, mediaType(req));
    }
    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    const result = await query(sql, params);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Advertisement not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const reorder = async (req, res, next) => {
  try {
    const orderedIds = Array.isArray(req.body.ordered_ids)
      ? req.body.ordered_ids.map(Number).filter((id) => id > 0)
      : [];
    if (!orderedIds.length) {
      return res.status(400).json({ success: false, message: 'ordered_ids is required.' });
    }
    await Promise.all(
      orderedIds.map((id, index) =>
        query('UPDATE advertisements SET display_order = ? WHERE id = ?', [index + 1, id])
      )
    );
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM advertisements WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Advertisement not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, create, update, reorder, remove };
