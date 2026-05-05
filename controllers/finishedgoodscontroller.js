const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

// ─── LIST ALL ───────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { article_code } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = '';
    let params = [];

    if (userRole === 'ADMIN' || userRole === 'STORE_KEEPER') {
      sql = `SELECT * FROM finished_goods WHERE 1=1`;

      if (article_code) {
        sql += ` AND article_code LIKE ?`;
        params.push(`%${article_code}%`);
      }

      sql += ` ORDER BY article_code, color`;

    } else if (userRole === 'USER') {
      sql = `
        SELECT fg.*
        FROM finished_goods fg
        INNER JOIN user_product_permissions upp
          ON upp.finished_good_id = fg.id
        WHERE upp.user_id = ?
          AND upp.can_view = 1
      `;

      params.push(userId);

      if (article_code) {
        sql += ` AND fg.article_code LIKE ?`;
        params.push(`%${article_code}%`);
      }

      sql += ` ORDER BY fg.article_code, fg.color`;

    } else {
      return res.json({ success: true, count: 0, data: [] });
    }

    const rows = await query(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    next(err);
  }
};

// ─── GET ONE ────────────────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql;
    let params = [req.params.id];

    if (userRole === 'ADMIN' || userRole === 'STORE_KEEPER') {
      sql = `SELECT * FROM finished_goods WHERE id = ?`;

    } else {
      sql = `
        SELECT fg.*
        FROM finished_goods fg
        INNER JOIN user_product_permissions upp
          ON upp.finished_good_id = fg.id
        WHERE fg.id = ?
          AND upp.user_id = ?
          AND upp.can_view = 1
      `;
      params.push(userId);
    }

    const rows = await query(sql, params);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied'
      });
    }

    return res.json({ success: true, data: rows[0] });

  } catch (err) {
    next(err);
  }
};

// ─── CREATE ────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      sole_code,
      color,
      size,
      unit,
      min_quantity,
      inner_box_per_pair,
      inner_boxes_per_outer_box
    } = req.body;

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `
      INSERT INTO finished_goods
      (name, article_code, sole_code, color, size, unit,
       quantity, min_quantity,
       inner_box_per_pair, inner_boxes_per_outer_box,
       image_url, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0)
    `;

    const params = [
      name,
      article_code,
      sole_code || null,
      color || null,
      size || null,
      unit || 'pairs',
      min_quantity || 5,
      Number(inner_box_per_pair || 1),
      inner_boxes_per_outer_box ? Number(inner_boxes_per_outer_box) : null,
      image_url
    ];

    const rows = await query(sql, params);

    return res.status(201).json({
      success: true,
      id: rows.insertId
    });

  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      sole_code,
      color,
      size,
      unit,
      min_quantity
    } = req.body;

    const image_url = req.file
      ? `/uploads/${req.file.filename}`
      : null;

    let sql = `
      UPDATE finished_goods
      SET name = ?,
          article_code = ?,
          sole_code = ?,
          color = ?,
          size = ?,
          unit = ?,
          min_quantity = ?
    `;

    const params = [
      name,
      article_code,
      sole_code || null,
      color || null,
      size || null,
      unit || 'pairs',
      min_quantity || 5
    ];

    if (image_url) {
      sql += `, image_url = ?`;
      params.push(image_url);
    }

    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    const result = await query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
};
// ─── DELETE ────────────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM finished_goods WHERE id = ?`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    return res.json({ success: true, message: 'Deleted successfully' });

  } catch (err) {
    next(err);
  }
};

// ─── VISIBILITY ────────────────────────────────────────────────────────────
const setVisibility = async (req, res, next) => {
  try {
    const { is_visible } = req.body;

    const result = await query(
      `UPDATE finished_goods SET is_visible = ? WHERE id = ?`,
      [is_visible ? 1 : 0, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  setVisibility
};