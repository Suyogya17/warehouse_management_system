const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');

const soleMakingCategories = ['Sole', 'Sole Powder', 'Sole Foam', 'TPR'];

const formulaInputSelect = (supportsConsumptionBasis) => `
  SELECT fi.*,
         ${supportsConsumptionBasis ? 'fi.consumption_basis' : "'PER_PAIR' AS consumption_basis"},
         rm.name AS material_name, rm.article_code, rm.color, rm.unit, rm.category
   FROM formula_inputs fi
   JOIN raw_materials rm ON rm.id = fi.raw_material_id
`;

const formulaPackagingSelect = (supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox) => `
  ${supportsInnerBoxPerPair ? 'fg.inner_box_per_pair' : 'CAST(1 AS DECIMAL(10,2)) AS inner_box_per_pair'},
  ${supportsInnerBoxesPerOuterBox ? 'fg.inner_boxes_per_outer_box' : 'CAST(NULL AS DECIMAL(10,2)) AS inner_boxes_per_outer_box'}
`;

const hasRequiredShoeMaterials = (materials, finishedGood) => {
  const hasUpper = materials.some(
    (item) =>
      item.category === 'Upper' &&
      item.article_code === finishedGood.article_code &&
      (!finishedGood.color || item.color === finishedGood.color)
  );

  const hasSoleInput = materials.some(
    (item) =>
      soleMakingCategories.includes(item.category) &&
      (!finishedGood.sole_code || item.article_code === finishedGood.sole_code || item.category !== 'Sole')
  );

  return { hasUpper, hasSoleInput };
};

// ─── LIST ALL FORMULAS ────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const supportsActive = await hasColumn('formulas', 'is_active');
    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');
    const supportsInnerBoxPerPair = await hasColumn('finished_goods', 'inner_box_per_pair');
    const supportsInnerBoxesPerOuterBox = await hasColumn('finished_goods', 'inner_boxes_per_outer_box');
    const formulas = await query(
      `SELECT f.*, fg.name AS finished_good_name, fg.article_code, fg.sole_code, fg.color,
              ${formulaPackagingSelect(supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox)}
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       ${supportsActive ? 'WHERE f.is_active = 1' : ''}
       ORDER BY f.id`
    );

    // Attach inputs to each formula
    const withInputs = await Promise.all(
      formulas.rows.map(async (formula) => {
        const inputs = await query(
          `${formulaInputSelect(supportsConsumptionBasis)}
           WHERE fi.formula_id = ?
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
    const supportsActive = await hasColumn('formulas', 'is_active');
    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');
    const supportsInnerBoxPerPair = await hasColumn('finished_goods', 'inner_box_per_pair');
    const supportsInnerBoxesPerOuterBox = await hasColumn('finished_goods', 'inner_boxes_per_outer_box');
    const formulaRes = await query(
      `SELECT f.*, fg.name AS finished_good_name, fg.article_code, fg.sole_code, fg.color,
              ${formulaPackagingSelect(supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox)}
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       WHERE f.id = ? ${supportsActive ? 'AND f.is_active = 1' : ''}`,
      [req.params.id]
    );

    if (formulaRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }

    const inputs = await query(
      `${formulaInputSelect(supportsConsumptionBasis)}
       WHERE fi.formula_id = ?`,
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

const update = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { name, finished_good_id, output_qty = 1, notes, inputs = [] } = req.body;

    if (!inputs.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'At least one formula input is required' });
    }

    const formulaRes = await client.query('SELECT id FROM formulas WHERE id = ?', [req.params.id]);
    if (formulaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }

    const finishedGoodRes = await client.query(
      `SELECT id, name, article_code, sole_code, color
       FROM finished_goods
       WHERE id = ?`,
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
      `SELECT id, article_code, color, category
       FROM raw_materials
       WHERE id IN (?)`,
      [materialIds]
    );

    const materials = materialsRes.rows;
    const { hasUpper, hasSoleInput } = hasRequiredShoeMaterials(materials, finishedGood);

    if (!hasUpper || !hasSoleInput) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Formula must include the matching Upper and at least one sole-making input such as Sole, Sole Powder, Sole Foam, or TPR',
      });
    }

    await client.query(
      `UPDATE formulas
       SET name = ?, finished_good_id = ?, output_qty = ?, notes = ?
       WHERE id = ?`,
      [name, finished_good_id, output_qty, notes || null, req.params.id]
    );
    const result = await client.query('SELECT * FROM formulas WHERE id = ?', [req.params.id]);

    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');

    await client.query('DELETE FROM formula_inputs WHERE formula_id = ?', [req.params.id]);

    for (const inp of inputs) {
      if (supportsConsumptionBasis) {
        await client.query(
          `INSERT INTO formula_inputs (formula_id, raw_material_id, quantity_needed, use_color_from_production, consumption_basis)
           VALUES (?,?,?,?,?)`,
          [
            req.params.id,
            inp.raw_material_id,
            inp.quantity_needed,
            inp.use_color_from_production || false,
            inp.consumption_basis || 'PER_PAIR',
          ]
        );
      } else {
        await client.query(
          `INSERT INTO formula_inputs (formula_id, raw_material_id, quantity_needed, use_color_from_production)
           VALUES (?,?,?,?)`,
          [req.params.id, inp.raw_material_id, inp.quantity_needed, inp.use_color_from_production || false]
        );
      }
    }

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'formulas',
      recordId: result.rows[0].id,
      detail: `Updated formula: ${result.rows[0].name}`,
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const deactivate = async (req, res, next) => {
  try {
    const supportsActive = await hasColumn('formulas', 'is_active');

    if (!supportsActive) {
      return res.status(400).json({
        success: false,
        message: 'Formula archive is not enabled in the database yet. Run sql/add-soft-delete-and-visibility.sql first.',
      });
    }

    await query('UPDATE formulas SET is_active = 0 WHERE id = ?', [req.params.id]);
    const result = await query('SELECT id, name FROM formulas WHERE id = ?', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'ARCHIVED',
      tableName: 'formulas',
      recordId: result.rows[0].id,
      detail: `Archived formula: ${result.rows[0].name}`,
    });

    return res.json({ success: true, message: 'Formula archived' });
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
       WHERE id = ?`,
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
       WHERE id IN (?)`,
      [materialIds]
    );

    const materials = materialsRes.rows;
    const { hasUpper, hasSoleInput } = hasRequiredShoeMaterials(materials, finishedGood);

    if (!hasUpper || !hasSoleInput) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Formula must include the matching Upper and at least one sole-making input such as Sole, Sole Powder, Sole Foam, or TPR',
      });
    }

    const formulaRes = await client.query(
      `INSERT INTO formulas (name, finished_good_id, output_qty, notes)
       VALUES (?,?,?,?)`,
      [name, finished_good_id, output_qty, notes || null]
    );
    const formula = { id: formulaRes.insertId, name, finished_good_id, output_qty, notes: notes || null };

    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');

    for (const inp of inputs) {
      if (supportsConsumptionBasis) {
        await client.query(
          `INSERT INTO formula_inputs (formula_id, raw_material_id, quantity_needed, use_color_from_production, consumption_basis)
           VALUES (?,?,?,?,?)`,
          [
            formula.id,
            inp.raw_material_id,
            inp.quantity_needed,
            inp.use_color_from_production || false,
            inp.consumption_basis || 'PER_PAIR',
          ]
        );
      } else {
        await client.query(
          `INSERT INTO formula_inputs (formula_id, raw_material_id, quantity_needed, use_color_from_production)
           VALUES (?,?,?,?)`,
          [formula.id, inp.raw_material_id, inp.quantity_needed, inp.use_color_from_production || false]
        );
      }
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
      'SELECT COUNT(*) AS count FROM production WHERE formula_id = ?',
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

    const existing = await query('SELECT id, name FROM formulas WHERE id=?', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }
    await query('DELETE FROM formulas WHERE id=?', [req.params.id]);
    await auditLog({
      userId: req.user.id, action: 'DELETED', tableName: 'formulas',
      recordId: req.params.id, detail: `Deleted formula: ${existing.rows[0].name}`,
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

module.exports = { getAll, getOne, create, update, deactivate, remove };
