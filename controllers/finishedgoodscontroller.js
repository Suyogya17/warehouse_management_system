const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

const getFinishedGoodsOrderClause = async (alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');

  return supportsDisplayOrder
    ? `ORDER BY ${prefix}display_order ASC, ${prefix}article_code, ${prefix}color, ${prefix}id`
    : `ORDER BY ${prefix}article_code, ${prefix}color, ${prefix}id`;
};

// ─── LIST ALL ───────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    console.log("=== getAll HIT ===", req.user);
    const { article_code } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = '';
    let params = [];

    if (userRole === 'ADMIN' || userRole === 'CO_ADMIN') {
      sql = `SELECT * FROM finished_goods WHERE is_deleted = 0`;

      if (article_code) {
        sql += ` AND article_code LIKE ?`;
        params.push(`%${article_code}%`);
      }

      sql += ` ${await getFinishedGoodsOrderClause()}`;

    } else if (userRole === 'USER' || userRole === 'MEMBER' || userRole === 'ELDER') {
      sql = `
        SELECT fg.*
        FROM finished_goods fg
        INNER JOIN user_product_permissions upp
          ON upp.finished_good_id = fg.id
        WHERE upp.user_id = ?
          AND upp.can_view = 1
          AND fg.is_visible = 1
          AND fg.is_deleted = 0
          AND NOT EXISTS (
            SELECT 1 FROM user_product_permissions deny
            WHERE deny.finished_good_id = fg.id
              AND deny.user_id = ?
              AND deny.can_view = 0
          )
      `;

      params.push(userId, userId);

      if (article_code) {
        sql += ` AND fg.article_code LIKE ?`;
        params.push(`%${article_code}%`);
      }

      sql += ` ${await getFinishedGoodsOrderClause('fg')}`;

    } else {
      return res.json({ success: true, count: 0, data: [] });
    }

    const rows = await query(sql, params);
    console.log("SQL:", sql);
    console.log("ROWS RETURNED:", rows.length);  // ← add this
    console.log("USER ROLE:", userRole);          // ← and this

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

    if (userRole === 'ADMIN' || userRole === 'CO_ADMIN') {
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
          AND fg.is_visible = 1
          AND NOT EXISTS (
            SELECT 1 FROM user_product_permissions deny
            WHERE deny.finished_good_id = fg.id
              AND deny.user_id = ?
              AND deny.can_view = 0
          )
      `;
      params.push(userId, userId);
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
      quantity,
      min_quantity,
      inner_box_per_pair,
      inner_boxes_per_outer_box
    } = req.body;

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');
    let nextDisplayOrder = null;

    if (supportsDisplayOrder) {
      const orderRows = await query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_display_order FROM finished_goods`
      );
      nextDisplayOrder = orderRows[0]?.next_display_order || 1;
    }

    const sql = `
      INSERT INTO finished_goods
      (name, article_code, sole_code, color, size, unit,
       quantity, min_quantity,
       inner_box_per_pair, inner_boxes_per_outer_box,
       image_url, is_visible${supportsDisplayOrder ? ', display_order' : ''})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0${supportsDisplayOrder ? ', ?' : ''})
    `;

    const params = [
      name,
      article_code,
      sole_code || null,
      color || null,
      size || null,
      unit || 'pairs',
      Number(quantity || 0),
      min_quantity || 5,
      Number(inner_box_per_pair || 1),
      inner_boxes_per_outer_box ? Number(inner_boxes_per_outer_box) : null,
      image_url
    ];

    if (supportsDisplayOrder) {
      params.push(nextDisplayOrder);
    }

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
      min_quantity,
      inner_box_per_pair,           
      inner_boxes_per_outer_box
    } = req.body;

    const image_url = req.file
      ? `/uploads/${req.file.filename}`
      : null;

    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');

    let sql = `
      UPDATE finished_goods
      SET name = ?,
          article_code = ?,
          sole_code = ?,
          color = ?,
          size = ?,
          unit = ?,
          min_quantity = ?,
          inner_box_per_pair = ?,
          inner_boxes_per_outer_box = ?
          ${supportsDisplayQuantity ? ', display_quantity = COALESCE(NULLIF(display_quantity, 0), quantity)' : ''}
    `;

    const parsedOuterBox =
  inner_boxes_per_outer_box !== undefined &&
  inner_boxes_per_outer_box !== null &&
  inner_boxes_per_outer_box !== ""
    ? Number(inner_boxes_per_outer_box)
    : null;

    const params = [
      name,
      article_code,
      sole_code || null,
      color || null,
      size || null,
      unit || 'pairs',
      min_quantity || 5,
      Number(inner_box_per_pair || 1),
      parsedOuterBox,

    ];

    if (image_url) {
      sql += `, image_url = ?`;
      params.push(image_url);
    }

    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    const result = await query(sql, params);

    if (!result || result.affectedRows === 0) {
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
    const { id } = req.params;

     const result = await query(
      "UPDATE finished_goods SET is_deleted = 1 WHERE id = ?",
      [id]
    );
    console.log("DELETE HIT:", req.params.id);

    if (!result || result.affectedRows === 0){
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    res.json({
      success: true,
      message: "Item moved to deleted state",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

// ─── DISPLAY ORDER ─────────────────────────────────────────────────────────
const setDisplayOrder = async (req, res, next) => {
  try {
    const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');

    if (!supportsDisplayOrder) {
      return res.status(400).json({
        success: false,
        message: 'Product ordering is not enabled yet. Run sql/add-finished-good-display-order.sql first.',
      });
    }

    const orderedIds = Array.isArray(req.body.ordered_ids)
      ? req.body.ordered_ids.map((id) => Number(id)).filter((id) => id > 0)
      : [];

    if (!orderedIds.length) {
      return res.status(400).json({
        success: false,
        message: 'ordered_ids must contain at least one product id.',
      });
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        query(
          `UPDATE finished_goods SET display_order = ? WHERE id = ? AND is_deleted = 0`,
          [index + 1, id]
        )
      )
    );

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
  setVisibility,
  setDisplayOrder
};
