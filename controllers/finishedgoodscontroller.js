const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const { clearCache } = require('../middleware/cacheMiddleware');

const DEFAULT_DISPLAY_QUANTITY = 450;

const getDisplayQuantityLimit = (quantity) =>
  Math.min(DEFAULT_DISPLAY_QUANTITY, Math.max(0, Math.floor(Number(quantity || 0))));

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

const getActor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const getProductName = (product = {}) =>
  [product.name, product.article_code, product.color].filter(Boolean).join(' / ') || `Product #${product.id}`;

const normalizeCommissionFlag = (value) =>
  value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;

const getFinishedGoodsOrderClause = async (alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');

  return supportsDisplayOrder
    ? `ORDER BY (${prefix}display_order IS NULL), ${prefix}display_order ASC, ${prefix}article_code, ${prefix}color, ${prefix}id`
    : `ORDER BY ${prefix}article_code, ${prefix}color, ${prefix}id`;
};

// ─── LIST ALL ───────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { article_code } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = '';
    let params = [];

    if (userRole === 'ADMIN' || userRole === 'CO_ADMIN' || userRole === 'MEMBER') {
      sql = `SELECT * FROM finished_goods WHERE is_deleted = 0`;

      if (article_code) {
        sql += ` AND article_code LIKE ?`;
        params.push(`%${article_code}%`);
      }

      sql += ` ${await getFinishedGoodsOrderClause()}`;

    } else if (userRole === 'USER' || userRole === 'ELDER') {
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

    if (userRole === 'ADMIN' || userRole === 'CO_ADMIN' || userRole === 'MEMBER') {
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
      price,
      is_commission,
      min_quantity,
      inner_box_per_pair,
      inner_boxes_per_outer_box
    } = req.body;

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');
    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');
    const supportsCommissionFlag = await hasColumn('finished_goods', 'is_commission');
    let nextDisplayOrder = null;

    if (supportsDisplayOrder) {
      const orderRows = await query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_display_order FROM finished_goods`
      );
      nextDisplayOrder = orderRows[0]?.next_display_order || 1;
    }

    const baseColumns = [
      'name',
      'article_code',
      'sole_code',
      'color',
      'size',
      'unit',
      'quantity',
      'price',
      'min_quantity',
      'inner_box_per_pair',
      'inner_boxes_per_outer_box',
      'image_url',
      'is_visible',
    ];
    const baseValues = [
      name,
      article_code,
      sole_code || null,
      color || null,
      size || null,
      unit || 'pairs',
      Number(quantity || 0),
      Number(price || 0),
      min_quantity || 5,
      Number(inner_box_per_pair || 1),
      inner_boxes_per_outer_box ? Number(inner_boxes_per_outer_box) : null,
      image_url,
      0,
    ];

    if (supportsDisplayOrder) {
      baseColumns.push('display_order');
      baseValues.push(nextDisplayOrder);
    }

    if (supportsDisplayQuantity) {
      baseColumns.push('display_quantity');
      baseValues.push(getDisplayQuantityLimit(quantity));
    }

    if (supportsCommissionFlag) {
      baseColumns.push('is_commission');
      baseValues.push(normalizeCommissionFlag(is_commission));
    }

    const { columns, values } = await appendFiscalInsertFields('finished_goods', baseColumns, baseValues);
    const sql = `
      INSERT INTO finished_goods (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `;

    const rows = await query(sql, values);
    const product = {
      id: rows.insertId,
      name,
      article_code,
      color,
      size,
      unit: unit || 'pairs',
    };

    await auditLog({
      ...getActor(req),
      actionType: 'CREATE',
      module: 'finished_goods',
      entity_type: 'finished_good',
      entity_id: rows.insertId,
      entityName: getProductName(product),
      description: `Created finished good ${getProductName(product)}`,
      metadata: product,
    });

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
      price,
      is_commission,
      min_quantity,
      inner_box_per_pair,           
      inner_boxes_per_outer_box
    } = req.body;
    const supportsCommissionFlag = await hasColumn('finished_goods', 'is_commission');

    const existingRows = await query(
      'SELECT id, name, article_code, color, size, unit FROM finished_goods WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );

    if (!existingRows.rows.length) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

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
          price = ?,
          min_quantity = ?,
          inner_box_per_pair = ?,
          inner_boxes_per_outer_box = ?
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
      Number(price || 0),
      min_quantity || 5,
      Number(inner_box_per_pair || 1),
      parsedOuterBox,

    ];

    if (supportsCommissionFlag) {
      sql += `, is_commission = ?`;
      params.push(normalizeCommissionFlag(is_commission));
    }

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

    const updatedProduct = {
      id: Number(req.params.id),
      name,
      article_code,
      color,
      size,
      unit: unit || 'pairs',
    };

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'finished_goods',
      entity_type: 'finished_good',
      entity_id: req.params.id,
      entityName: getProductName(updatedProduct),
      description: `Edited finished good ${getProductName(updatedProduct)}`,
      metadata: {
        before: existingRows.rows[0],
        after: updatedProduct,
      },
    });

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
};
// ─── DELETE ────────────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
   try {
    const { id } = req.params;
    const productRows = await query(
      'SELECT id, name, article_code, color, size, unit FROM finished_goods WHERE id = ?',
      [id]
    );

    const result = await query(
      "UPDATE finished_goods SET is_deleted = 1 WHERE id = ?",
      [id]
    );

    if (!result || result.affectedRows === 0){
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const product = productRows.rows[0] || { id };
    await auditLog({
      ...getActor(req),
      actionType: 'DELETE',
      module: 'finished_goods',
      entity_type: 'finished_good',
      entity_id: id,
      entityName: getProductName(product),
      description: `Deleted finished good ${getProductName(product)}`,
      metadata: product,
    });

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
    const productRows = await query(
      'SELECT id, name, article_code, color, size, unit, is_visible FROM finished_goods WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );

    if (!productRows.rows.length) {
      return res.status(404).json({ success: false });
    }

    const result = await query(
      `UPDATE finished_goods SET is_visible = ? WHERE id = ?`,
      [is_visible ? 1 : 0, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false });
    }

    clearCache();

    const product = productRows.rows[0];
    const actionType = is_visible ? 'SHOW' : 'HIDE';
    await auditLog({
      ...getActor(req),
      actionType,
      module: 'product_visibility',
      entity_type: 'finished_good',
      entity_id: req.params.id,
      entityName: getProductName(product),
      description: `${is_visible ? 'Showed' : 'Hid'} product ${getProductName(product)}`,
      metadata: {
        product,
        previous_visibility: Number(product.is_visible || 0),
        new_visibility: is_visible ? 1 : 0,
      },
    });

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

// ─── DISPLAY QUANTITY ──────────────────────────────────────────────────────
const setDisplayQuantity = async (req, res, next) => {
  try {
    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');

    if (!supportsDisplayQuantity) {
      return res.status(400).json({
        success: false,
        message: 'Display quantity is not enabled yet. Run sql/add-finished-good-display-quantity.sql first.',
      });
    }

    const displayQuantity = Number(req.body.display_quantity);

    if (!Number.isFinite(displayQuantity) || displayQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Display quantity must be 0 or more.',
      });
    }

    const productRows = await query(
      'SELECT id, quantity FROM finished_goods WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );

    if (!productRows.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const physicalQuantity = Math.floor(Number(productRows.rows[0].quantity || 0));
    const savedDisplayQuantity = Math.min(Math.floor(displayQuantity), getDisplayQuantityLimit(physicalQuantity));
    const result = await query(
      `UPDATE finished_goods SET display_quantity = ? WHERE id = ? AND is_deleted = 0`,
      [savedDisplayQuantity, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.json({
      success: true,
      data: {
        id: Number(req.params.id),
        display_quantity: savedDisplayQuantity,
      },
    });
  } catch (err) {
    next(err);
  }
};

const resetDisplayQuantities = async (req, res, next) => {
  try {
    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');

    if (!supportsDisplayQuantity) {
      return res.status(400).json({
        success: false,
        message: 'Display quantity is not enabled yet. Run sql/add-finished-good-display-quantity.sql first.',
      });
    }

    const result = await query(
      `UPDATE finished_goods
       SET display_quantity = LEAST(GREATEST(FLOOR(COALESCE(quantity, 0)), 0), ?)
       WHERE is_deleted = 0`,
      [DEFAULT_DISPLAY_QUANTITY]
    );

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'product_display',
      entity_type: 'finished_good',
      entity_id: null,
      entityName: 'Finished goods display quantity',
      description: `Reset user-visible quantity to actual stock up to ${DEFAULT_DISPLAY_QUANTITY}`,
      metadata: {
        display_quantity_max: DEFAULT_DISPLAY_QUANTITY,
        affected_rows: result.affectedRows || 0,
      },
    });

    return res.json({
      success: true,
      message: `Products now show actual stock up to ${DEFAULT_DISPLAY_QUANTITY} pairs.`,
      data: {
        display_quantity_max: DEFAULT_DISPLAY_QUANTITY,
        affected_rows: result.affectedRows || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PRICE ─────────────────────────────────────────────────────────────────
const setPrice = async (req, res, next) => {
  try {
    const price = Number(req.body.price);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be 0 or more.',
      });
    }

    const savedPrice = Math.round(price * 100) / 100;
    const result = await query(
      `UPDATE finished_goods SET price = ? WHERE id = ? AND is_deleted = 0`,
      [savedPrice, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.json({
      success: true,
      data: { id: Number(req.params.id), price: savedPrice },
    });
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

    const caseSql = orderedIds.map(() => 'WHEN ? THEN ?').join(' ');
    const placeholders = orderedIds.map(() => '?').join(', ');
    const caseParams = orderedIds.flatMap((id, index) => [id, index + 1]);

    await query(
      `UPDATE finished_goods
       SET display_order = CASE id ${caseSql} ELSE display_order END
       WHERE id IN (${placeholders}) AND is_deleted = 0`,
      [...caseParams, ...orderedIds]
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
  setDisplayQuantity,
  resetDisplayQuantities,
  setPrice,
  setDisplayOrder
};
