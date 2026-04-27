const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');

// ─── LIST ALL FORMULAS ────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const formulas = await query(
      `SELECT f.*, fg.name AS finished_good_name, fg.article_code, fg.sole_code, fg.color
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       ORDER BY f.id`
    );

    // Attach inputs to each formula
    const withInputs = await Promise.all(
      formulas.rows.map(async (formula) => {
        const inputs = await query(
          `SELECT fi.*, rm.name AS material_name, rm.article_code, rm.color, rm.unit, rm.category
           FROM formula_inputs fi
           JOIN raw_materials rm ON rm.id = fi.raw_material_id
           WHERE fi.formula_id = $1
           ORDER BY fi.id`,
          [formula.id]
        );
        return { ...formula, inputs: inputs.rows };
      })
    );

    return res.json({ success: true, count: withInputs.length, data: withInputs });
  } catch (err) {
    next(err);
  }
};

// ─── GET ONE FORMULA ──────────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const formulaRes = await query(
      `SELECT f.*, fg.name AS finished_good_name, fg.article_code, fg.sole_code, fg.color
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       WHERE f.id = $1`,
      [req.params.id]
    );

    if (formulaRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }

    const inputs = await query(
      `SELECT fi.*, rm.name AS material_name, rm.article_code, rm.color, rm.unit, rm.category
       FROM formula_inputs fi
       JOIN raw_materials rm ON rm.id = fi.raw_material_id
       WHERE fi.formula_id = $1`,
      [req.params.id]
    );

    return res.json({
      success: true,
      data: { ...formulaRes.rows[0], inputs: inputs.rows },
    });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE FORMULA + INPUTS ──────────────────────────────────────────────────
/**
 * POST /api/formulas
 * Body:
 * {
 *   name: "NIAE Red + B-001",
 *   finished_good_id: 1,
 *   output_qty: 1,
 *   notes: "...",
 *   inputs: [
 *     { raw_material_id: 1, quantity_needed: 1, use_color_from_production: false },
 *     { raw_material_id: 4, quantity_needed: 1, use_color_from_production: false }
 *   ]
 * }
 */
const create = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { name, finished_good_id, output_qty = 1, notes, inputs = [] } = req.body;

    if (!inputs.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'At least one formula input is required' });
    }

    const finishedGoodRes = await client.query(
      `SELECT id, name, article_code, sole_code, color
       FROM finished_goods
       WHERE id = $1`,
      [finished_good_id]
    );

    if (finishedGoodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }

    const finishedGood = finishedGoodRes.rows[0];
    const materialIds = [...new Set(inputs.map((item) => Number(item.raw_material_id)).filter(Boolean))];

    if (!materialIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Formula inputs must include valid raw materials' });
    }

    const materialsRes = await client.query(
      `SELECT id, name, article_code, color, category
       FROM raw_materials
       WHERE id = ANY($1::int[])`,
      [materialIds]
    );

    const materials = materialsRes.rows;
    const hasUpper = materials.some(
      (item) =>
        item.category === 'Upper' &&
        item.article_code === finishedGood.article_code &&
        (!finishedGood.color || item.color === finishedGood.color)
    );
    const hasSole = materials.some(
      (item) =>
        item.category === 'Sole' &&
        item.article_code === finishedGood.sole_code
    );

    if (!hasUpper || !hasSole) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Formula must include both the matching Upper and Sole for the selected finished good',
      });
    }

    const formulaRes = await client.query(
      `INSERT INTO formulas (name, finished_good_id, output_qty, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, finished_good_id, output_qty, notes || null]
    );
    const formula = formulaRes.rows[0];

    for (const inp of inputs) {
      await client.query(
        `INSERT INTO formula_inputs (formula_id, raw_material_id, quantity_needed, use_color_from_production)
         VALUES ($1,$2,$3,$4)`,
        [formula.id, inp.raw_material_id, inp.quantity_needed, inp.use_color_from_production || false]
      );
    }

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id, action: 'CREATED', tableName: 'formulas',
      recordId: formula.id, detail: `Formula created: ${name}`,
    });

    return res.status(201).json({ success: true, data: formula });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE FORMULA ───────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const usageCheck = await query(
      'SELECT COUNT(*) FROM production WHERE formula_id = $1',
      [req.params.id]
    );

    const usage = {
      production_runs: Number(usageCheck.rows[0].count),
    };

    if (usage.production_runs > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this formula because it is already used in production history.',
        usage,
      });
    }

    const result = await query('DELETE FROM formulas WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }
    await auditLog({
      userId: req.user.id, action: 'DELETED', tableName: 'formulas',
      recordId: req.params.id, detail: `Deleted formula: ${result.rows[0].name}`,
    });
    return res.json({ success: true, message: 'Formula deleted' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this formula because it is already referenced by other records.',
      });
    }
    next(err);
  }
};

module.exports = { getAll, getOne, create, remove };
