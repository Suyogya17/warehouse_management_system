const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { buildStockSummarySelect } = require('../utils/queryBuilders');
const { hasColumn } = require('../utils/schemaSupport');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

const getActor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const getMaterialName = (material = {}) =>
  [material.name, material.article_code, material.color].filter(Boolean).join(' / ') || `Material #${material.id}`;

// ─────────────────────────────────────────────────────────────
// LIST ALL
// ─────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { category, article_code, low_stock } = req.query;
    const supportsImage = await hasColumn("raw_materials", "image_url");

    let sql = `${buildStockSummarySelect(supportsImage)} WHERE 1=1`;
    const params = [];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (article_code) {
      sql += ` AND article_code LIKE ?`;
      params.push(`%${article_code}%`);
    }

    if (low_stock === 'true') {
      sql += ` AND is_low_stock = 1`;
    }

    sql += ` ORDER BY category, article_code, color`;

    const result = await query(sql, params);

    return res.json({
      success: true,
      count: result.rows?.length || 0,
      data: result.rows || []
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET ONE
// ─────────────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const supportsImage = await hasColumn("raw_materials", "image_url");

    const result = await query(
      `${buildStockSummarySelect(supportsImage)} WHERE rm.id = ?`,
      [req.params.id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      category,
      color,
      unit,
      quantity,
      min_quantity
    } = req.body;

    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("raw_materials", "image_url");

    const baseColumns = ['name', 'article_code', 'category', 'color', 'unit', 'quantity', 'min_quantity'];
    const baseValues = [
      name,
      article_code,
      category,
      color || null,
      unit || 'pcs',
      Number(quantity || 0),
      Number(min_quantity || 10),
    ];

    if (supportsImage) {
      baseColumns.push('image_url');
      baseValues.push(image_url);
    }

    const { columns, values } = await appendFiscalInsertFields('raw_materials', baseColumns, baseValues);
    const sql = `
      INSERT INTO raw_materials (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `;

    const result = await query(sql, values);

    // MySQL FIX: fetch inserted row manually
    const inserted = await query(
      'SELECT * FROM raw_materials WHERE id = ?',
      [result.insertId]
    );

    const mat = inserted.rows[0];

    if (Number(mat.quantity || 0) > 0) {
      const stockInsert = await appendFiscalInsertFields(
        'stock',
        ['raw_material_id', 'qty_added', 'qty_remaining'],
        [mat.id, mat.quantity, mat.quantity]
      );
      await query(
        `INSERT INTO stock (${stockInsert.columns.join(', ')})
         VALUES (${stockInsert.columns.map(() => '?').join(', ')})`,
        stockInsert.values
      );
    }

    await auditLog({
      ...getActor(req),
      actionType: 'CREATE',
      module: 'raw_materials',
      entity_type: 'raw_material',
      entity_id: mat.id,
      entityName: getMaterialName(mat),
      description: `Created raw material ${getMaterialName(mat)}`,
      metadata: mat,
    });

    return res.status(201).json({
      success: true,
      data: mat
    });

  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      category,
      color,
      unit,
      min_quantity
    } = req.body;

    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("raw_materials", "image_url");

    let sql, values;

    if (supportsImage && image_url) {
      sql = `
        UPDATE raw_materials
        SET name=?, article_code=?, category=?, color=?, unit=?, min_quantity=?, image_url=?
        WHERE id=?
      `;
      values = [
        name,
        article_code,
        category,
        color || null,
        unit,
        Number(min_quantity),
        image_url,
        req.params.id
      ];
    } else {
      sql = `
        UPDATE raw_materials
        SET name=?, article_code=?, category=?, color=?, unit=?, min_quantity=?
        WHERE id=?
      `;
      values = [
        name,
        article_code,
        category,
        color || null,
        unit,
        Number(min_quantity),
        req.params.id
      ];
    }

    await query(sql, values);

    const updated = await query(
      'SELECT * FROM raw_materials WHERE id = ?',
      [req.params.id]
    );

    if (!updated.rows || updated.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'raw_materials',
      entity_type: 'raw_material',
      entity_id: req.params.id,
      entityName: getMaterialName(updated.rows[0]),
      description: `Edited raw material ${getMaterialName(updated.rows[0])}`,
      metadata: updated.rows[0],
    });

    return res.json({
      success: true,
      data: updated.rows[0]
    });

  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const materialRows = await query(
      'SELECT id, name, article_code, color, unit, quantity FROM raw_materials WHERE id = ?',
      [req.params.id]
    );

    if (!materialRows.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }

    const usageChecks = await Promise.all([
      query('SELECT COUNT(*) AS c FROM stock WHERE raw_material_id = ?', [req.params.id]),
      query('SELECT COUNT(*) AS c FROM formula_inputs WHERE raw_material_id = ?', [req.params.id]),
      query('SELECT COUNT(*) AS c FROM production_items WHERE raw_material_id = ?', [req.params.id]),
      query('SELECT COUNT(*) AS c FROM consumption_logs WHERE raw_material_id = ?', [req.params.id]),
    ]);

    const usage = {
      stock_batches: Number(usageChecks[0].rows[0].c),
      formulas: Number(usageChecks[1].rows[0].c),
      production_items: Number(usageChecks[2].rows[0].c),
      consumption_logs: Number(usageChecks[3].rows[0].c),
    };

    const blocking =
      usage.formulas +
      usage.production_items +
      usage.consumption_logs;

    if (blocking > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete raw material (in use)',
        usage
      });
    }

    await query(
      'DELETE FROM raw_materials WHERE id = ?',
      [req.params.id]
    );

    await auditLog({
      ...getActor(req),
      actionType: 'DELETE',
      module: 'raw_materials',
      entity_type: 'raw_material',
      entity_id: req.params.id,
      entityName: getMaterialName(materialRows.rows[0]),
      description: `Deleted raw material ${getMaterialName(materialRows.rows[0])}`,
      metadata: {
        material: materialRows.rows[0],
        usage,
      },
    });

    return res.json({
      success: true,
      message: 'Deleted successfully'
    });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove
};
