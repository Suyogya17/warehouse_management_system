const { query } = require('../config/db');
const auditLog   = require('../utils/auditLog');
const { buildStockSummarySelect } = require('../utils/queryBuilders');
const { hasColumn } = require('../utils/schemaSupport');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

// ─── LIST ALL (with low-stock flag) ──────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { category, article_code, low_stock } = req.query;
    const supportsImage = await hasColumn("raw_materials", "image_url");

    let sql = `${buildStockSummarySelect(supportsImage)} WHERE 1=1`;
    const params = [];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (article_code) {
      params.push(article_code);
      sql += ` AND article_code ILIKE $${params.length}`;
    }
    if (low_stock === 'true') {
      sql += ` AND is_low_stock = TRUE`;
    }

    sql += ` ORDER BY category, article_code, color`;

    const result = await query(sql, params);
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET SINGLE ───────────────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const supportsImage = await hasColumn("raw_materials", "image_url");
    const result = await query(
      `${buildStockSummarySelect(supportsImage)} WHERE rm.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Raw material not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { name, article_code, category, color, unit, quantity, min_quantity } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("raw_materials", "image_url");

    const result = supportsImage
      ? await query(
          `INSERT INTO raw_materials (name, article_code, category, color, unit, quantity, min_quantity, image_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [name, article_code, category, color || null, unit || 'pcs', quantity || 0, min_quantity || 10, image_url]
        )
      : await query(
          `INSERT INTO raw_materials (name, article_code, category, color, unit, quantity, min_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [name, article_code, category, color || null, unit || 'pcs', quantity || 0, min_quantity || 10]
        );

    const mat = result.rows[0];

    // Add initial stock batch if quantity > 0
    if (mat.quantity > 0) {
      await query(
        `INSERT INTO stock (raw_material_id, qty_added, qty_remaining)
         VALUES ($1, $2, $2)`,
        [mat.id, mat.quantity]
      );
    }

    await auditLog({
      userId: req.user.id,
      action: 'CREATED',
      tableName: 'raw_materials',
      recordId: mat.id,
      detail: `Created ${mat.name} (${mat.article_code}) with qty=${mat.quantity}`,
    });

    return res.status(201).json({ success: true, data: mat });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const { name, article_code, category, color, unit, min_quantity } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("raw_materials", "image_url");
    // Note: quantity is managed via stock ledger, not direct update

    const result = supportsImage && image_url
      ? await query(
          `UPDATE raw_materials
           SET name=$1, article_code=$2, category=$3, color=$4, unit=$5, min_quantity=$6, image_url=$7
           WHERE id=$8 RETURNING *`,
          [name, article_code, category, color || null, unit, min_quantity, image_url, req.params.id]
        )
      : await query(
          `UPDATE raw_materials
           SET name=$1, article_code=$2, category=$3, color=$4, unit=$5, min_quantity=$6
           WHERE id=$7 RETURNING *`,
          [name, article_code, category, color || null, unit, min_quantity, req.params.id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Raw material not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'raw_materials',
      recordId: req.params.id,
      detail: `Updated raw material #${req.params.id}`,
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const usageChecks = await Promise.all([
      query('SELECT COUNT(*) FROM stock WHERE raw_material_id = $1', [req.params.id]),
      query('SELECT COUNT(*) FROM formula_inputs WHERE raw_material_id = $1', [req.params.id]),
      query('SELECT COUNT(*) FROM production_items WHERE raw_material_id = $1', [req.params.id]),
      query('SELECT COUNT(*) FROM consumption_logs WHERE raw_material_id = $1', [req.params.id]),
    ]);

    const usage = {
      stock_batches: Number(usageChecks[0].rows[0].count),
      formulas: Number(usageChecks[1].rows[0].count),
      production_items: Number(usageChecks[2].rows[0].count),
      consumption_logs: Number(usageChecks[3].rows[0].count),
    };

    const blockingReferences =
      usage.formulas + usage.production_items + usage.consumption_logs;

    if (blockingReferences > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this raw material because it is already used in formulas, production, or consumption history.',
        usage,
      });
    }

    const result = await query(
      'DELETE FROM raw_materials WHERE id=$1 RETURNING id, name',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Raw material not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'DELETED',
      tableName: 'raw_materials',
      recordId: req.params.id,
      detail: `Deleted ${result.rows[0].name}`,
    });

    return res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this raw material because it is already referenced by other records.',
      });
    }
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove };
