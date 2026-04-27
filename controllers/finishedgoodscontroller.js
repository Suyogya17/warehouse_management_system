const { query } = require('../config/db');
const auditLog   = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);
const baseSelect = (supportsImage, supportsVisibility) =>
  [
    "id",
    "name",
    "article_code",
    "sole_code",
    "color",
    "size",
    "unit",
    "quantity",
    "min_quantity",
    "created_at",
    supportsImage ? "image_url" : "NULL::VARCHAR AS image_url",
    supportsVisibility ? "is_visible" : "TRUE::BOOLEAN AS is_visible",
  ].join(", ");

// ─── LIST ALL ─────────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { article_code } = req.query;
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");
    let sql = `SELECT ${baseSelect(supportsImage, supportsVisibility)} FROM finished_goods WHERE 1=1`;
    const params = [];

    if (article_code) {
      params.push(article_code);
      sql += ` AND article_code ILIKE $${params.length}`;
    }

    if (req.user?.role === "USER" && supportsVisibility) {
      sql += ` AND is_visible = TRUE`;
    }

    sql += ' ORDER BY article_code, color';
    const result = await query(sql, params);
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");
    const result = await query(
      `SELECT ${baseSelect(supportsImage, supportsVisibility)} FROM finished_goods WHERE id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { name, article_code, sole_code, color, size, unit, min_quantity } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");

    const result = supportsImage && supportsVisibility
      ? await query(
          `INSERT INTO finished_goods (name, article_code, sole_code, color, size, unit, quantity, min_quantity, image_url, is_visible)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,FALSE) RETURNING *`,
          [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity || 5, image_url]
        )
      : supportsImage
      ? await query(
          `INSERT INTO finished_goods (name, article_code, sole_code, color, size, unit, quantity, min_quantity, image_url)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8) RETURNING *`,
          [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity || 5, image_url]
        )
      : await query(
          `INSERT INTO finished_goods (name, article_code, sole_code, color, size, unit, quantity, min_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7) RETURNING *`,
          [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity || 5]
        );

    await auditLog({
      userId: req.user.id, action: 'CREATED', tableName: 'finished_goods',
      recordId: result.rows[0].id, detail: `Created finished good: ${name}`,
    });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const { name, article_code, sole_code, color, size, unit, min_quantity } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const result = supportsImage && image_url
      ? await query(
          `UPDATE finished_goods
           SET name=$1, article_code=$2, sole_code=$3, color=$4, size=$5, unit=$6, min_quantity=$7, image_url=$8
           WHERE id=$9
           RETURNING *`,
          [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity, image_url, req.params.id]
        )
      : await query(
          `UPDATE finished_goods
           SET name=$1, article_code=$2, sole_code=$3, color=$4, size=$5, unit=$6, min_quantity=$7
           WHERE id=$8
           RETURNING *`,
          [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity, req.params.id]
        );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }
    await auditLog({
      userId: req.user.id, action: 'UPDATED', tableName: 'finished_goods',
      recordId: result.rows[0].id, detail: `Updated finished good: ${result.rows[0].name}`,
    });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── VISIBILITY ───────────────────────────────────────────────────────────────
const setVisibility = async (req, res, next) => {
  try {
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");

    if (!supportsVisibility) {
      return res.status(400).json({
        success: false,
        message: 'Visibility control is not enabled in the database yet. Run sql/add-soft-delete-and-visibility.sql first.',
      });
    }

    const { is_visible } = req.body;
    const result = await query(
      `UPDATE finished_goods
       SET is_visible = $1
       WHERE id = $2
       RETURNING id, name, is_visible`,
      [Boolean(is_visible), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'finished_goods',
      recordId: result.rows[0].id,
      detail: `${result.rows[0].is_visible ? 'Displayed' : 'Hidden'} finished good: ${result.rows[0].name}`,
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
      query('SELECT COUNT(*) FROM formulas WHERE finished_good_id = $1', [req.params.id]),
      query('SELECT COUNT(*) FROM production WHERE finished_good_id = $1', [req.params.id]),
    ]);

    const usage = {
      formulas: Number(usageChecks[0].rows[0].count),
      production_runs: Number(usageChecks[1].rows[0].count),
    };

    const blockingReferences = usage.formulas + usage.production_runs;

    if (blockingReferences > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this finished good because it is already used in formulas or production history.',
        usage,
      });
    }

    const result = await query('DELETE FROM finished_goods WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }
    return res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this finished good because it is already referenced by other records.',
      });
    }
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove, setVisibility };
