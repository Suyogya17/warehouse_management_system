const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { productionHistorySelect } = require('../utils/queryBuilders');
const { hasColumn } = require('../utils/schemaSupport');

const packagingSelect = (supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox) => `
  ${supportsInnerBoxPerPair ? 'fg.inner_box_per_pair' : '1::NUMERIC AS inner_box_per_pair'},
  ${supportsInnerBoxesPerOuterBox ? 'fg.inner_boxes_per_outer_box' : 'NULL::NUMERIC AS inner_boxes_per_outer_box'}
`;

const inputSelect = (supportsConsumptionBasis) => `
  SELECT fi.*,
         ${supportsConsumptionBasis ? 'fi.consumption_basis' : "'PER_PAIR' AS consumption_basis"},
         rm.name, rm.article_code, rm.color, rm.unit, rm.quantity AS current_stock
   FROM formula_inputs fi
   JOIN raw_materials rm ON rm.id = fi.raw_material_id
`;

const getPackagingSummary = (formula, qtyToProduce) => {
  const innerBoxPerPair = Number(formula.inner_box_per_pair || 1);
  const innerBoxesNeeded = Number(qtyToProduce) * innerBoxPerPair;
  const innerBoxesPerOuterBox = Number(formula.inner_boxes_per_outer_box || 0);
  const outerBoxesNeeded = innerBoxesPerOuterBox > 0
    ? Math.ceil(innerBoxesNeeded / innerBoxesPerOuterBox)
    : 0;

  return {
    inner_box_per_pair: innerBoxPerPair,
    inner_boxes_needed: innerBoxesNeeded,
    inner_boxes_per_outer_box: innerBoxesPerOuterBox || null,
    outer_boxes_needed: outerBoxesNeeded,
    loose_inner_boxes: innerBoxesPerOuterBox > 0 ? innerBoxesNeeded % innerBoxesPerOuterBox : innerBoxesNeeded,
  };
};

const calculateNeeded = (input, formula, qtyToProduce, packaging) => {
  if (input.consumption_basis === 'PER_OUTER_BOX') {
    if (!packaging.inner_boxes_per_outer_box) {
      const error = new Error('This formula has an outer-box material, but the finished good does not define inner boxes per outer box.');
      error.statusCode = 400;
      throw error;
    }
    return Number(input.quantity_needed) * packaging.outer_boxes_needed;
  }

  return Number(input.quantity_needed) * Number(qtyToProduce) / Number(formula.output_qty);
};

// ─── STEP 1: CHECK STOCK (dry run — does NOT deduct anything) ─────────────────
/**
 * POST /api/production/check
 * Body: { formula_id, qty_to_produce }
 *
 * Returns a stock feasibility report for the requested production run.
 * Use this before confirming an actual run.
 */
const checkStock = async (req, res, next) => {
  try {
    const { formula_id, qty_to_produce } = req.body;
    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');
    const supportsInnerBoxPerPair = await hasColumn('finished_goods', 'inner_box_per_pair');
    const supportsInnerBoxesPerOuterBox = await hasColumn('finished_goods', 'inner_boxes_per_outer_box');

    if (!formula_id || !qty_to_produce || qty_to_produce <= 0) {
      return res.status(400).json({ success: false, message: 'formula_id and qty_to_produce (>0) are required' });
    }

    // Load formula
    const formulaRes = await query(
      `SELECT f.*, fg.id AS fg_id, fg.name AS fg_name, ${packagingSelect(supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox)}
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       WHERE f.id=$1`,
      [formula_id]
    );
    if (formulaRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }
    const formula = formulaRes.rows[0];
    const packaging = getPackagingSummary(formula, qty_to_produce);

    // Load formula inputs
    const inputsRes = await query(
      `${inputSelect(supportsConsumptionBasis)}
       WHERE fi.formula_id = $1`,
      [formula_id]
    );

    const report = [];
    let canProduce = true;

    for (const inp of inputsRes.rows) {
      const needed = calculateNeeded(inp, formula, qty_to_produce, packaging);
      const available = parseFloat(inp.current_stock);
      const sufficient = available >= needed;

      if (!sufficient) canProduce = false;

      report.push({
        raw_material_id: inp.raw_material_id,
        name:            inp.name,
        article_code:    inp.article_code,
        color:           inp.color,
        unit:            inp.unit,
        consumption_basis: inp.consumption_basis,
        needed,
        available,
        after_production: available - needed,
        sufficient,
      });
    }

    return res.json({
      success: true,
      can_produce: canProduce,
      formula_name: formula.name,
      qty_to_produce,
      packaging,
      stock_check: report,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ─── STEP 2: RUN PRODUCTION ───────────────────────────────────────────────────
/**
 * POST /api/production/run
 * Body: { formula_id, qty_to_produce, notes }
 *
 * Full flow:
 *  1. Load formula + inputs
 *  2. Check all materials have sufficient stock
 *  3. FIFO deduct from stock batches
 *  4. Decrement raw_materials.quantity
 *  5. Increment finished_goods.quantity
 *  6. Record production + production_items + audit log
 */
const runProduction = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { formula_id, qty_to_produce, notes } = req.body;
    const supportsConsumptionBasis = await hasColumn('formula_inputs', 'consumption_basis');
    const supportsInnerBoxPerPair = await hasColumn('finished_goods', 'inner_box_per_pair');
    const supportsInnerBoxesPerOuterBox = await hasColumn('finished_goods', 'inner_boxes_per_outer_box');

    if (!formula_id || !qty_to_produce || qty_to_produce <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'formula_id and qty_to_produce (>0) are required' });
    }

    // ── Load formula ──────────────────────────────────────────────────────────
    const formulaRes = await client.query(
      `SELECT f.*, fg.id AS fg_id, fg.name AS fg_name, fg.color AS fg_color,
              ${packagingSelect(supportsInnerBoxPerPair, supportsInnerBoxesPerOuterBox)}
       FROM formulas f
       JOIN finished_goods fg ON fg.id = f.finished_good_id
       WHERE f.id = $1`,
      [formula_id]
    );
    if (formulaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Formula not found' });
    }
    const formula = formulaRes.rows[0];
    const packaging = getPackagingSummary(formula, qty_to_produce);

    // ── Load formula inputs ───────────────────────────────────────────────────
    const inputsRes = await client.query(
      `${inputSelect(supportsConsumptionBasis)}
       WHERE fi.formula_id = $1
       ORDER BY fi.id`,
      [formula_id]
    );
    const inputs = inputsRes.rows;

    // ── STEP 1: Stock sufficiency check ──────────────────────────────────────
    const shortfalls = [];
    for (const inp of inputs) {
      const needed = calculateNeeded(inp, formula, qty_to_produce, packaging);
      const available = parseFloat(inp.current_stock);
      if (available < needed) {
        shortfalls.push({
          material: `${inp.name} (${inp.article_code}${inp.color ? ' - ' + inp.color : ''})`,
          needed,
          available,
          shortfall: needed - available,
          unit: inp.unit,
        });
      }
    }

    if (shortfalls.length > 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: 'Insufficient stock to run this production',
        shortfalls,
      });
    }

    // ── STEP 2: Create production record ─────────────────────────────────────
    const prodRes = await client.query(
      `INSERT INTO production
         (formula_id, finished_good_id, qty_produced, color, batches, notes, produced_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        formula_id,
        formula.fg_id,
        qty_to_produce,
        formula.fg_color,
        Math.ceil(qty_to_produce / parseFloat(formula.output_qty)),
        notes || null,
        req.user.id,
      ]
    );
    const production = prodRes.rows[0];

    const consumptionSummary = [];

    // ── STEP 3: FIFO deduction per input ──────────────────────────────────────
    for (const inp of inputs) {
      const totalNeeded = calculateNeeded(inp, formula, qty_to_produce, packaging);
      let remaining = totalNeeded;

      // Fetch FIFO batches (oldest first, only those with stock left)
      const batches = await client.query(
        `SELECT id, qty_remaining FROM stock
         WHERE raw_material_id=$1 AND qty_remaining > 0
         ORDER BY purchased_at ASC`,
        [inp.raw_material_id]
      );

      for (const batch of batches.rows) {
        if (remaining <= 0) break;

        const batchRemaining = parseFloat(batch.qty_remaining);
        const deduct = Math.min(batchRemaining, remaining);

        await client.query(
          'UPDATE stock SET qty_remaining = qty_remaining - $1 WHERE id=$2',
          [deduct, batch.id]
        );

        remaining -= deduct;
      }

      // Update raw_materials.quantity (decrement)
      const prevQty = parseFloat(inp.current_stock);
      const newQty  = prevQty - totalNeeded;

      await client.query(
        'UPDATE raw_materials SET quantity=$1 WHERE id=$2',
        [newQty, inp.raw_material_id]
      );

      // Record production_items
      await client.query(
        `INSERT INTO production_items (production_id, raw_material_id, qty_consumed)
         VALUES ($1,$2,$3)`,
        [production.id, inp.raw_material_id, totalNeeded]
      );

      consumptionSummary.push({
        material:    `${inp.name} (${inp.article_code}${inp.color ? ' - ' + inp.color : ''})`,
        unit:        inp.unit,
        consumption_basis: inp.consumption_basis,
        consumed:    totalNeeded,
        before:      prevQty,
        after:       newQty,
      });
    }

    // ── STEP 4: Add finished goods ────────────────────────────────────────────
    const fgBefore = await client.query(
      'SELECT quantity FROM finished_goods WHERE id=$1',
      [formula.fg_id]
    );
    const fgPrevQty = parseFloat(fgBefore.rows[0].quantity);
    const fgNewQty  = fgPrevQty + parseFloat(qty_to_produce);

    await client.query(
      'UPDATE finished_goods SET quantity=$1 WHERE id=$2',
      [fgNewQty, formula.fg_id]
    );

    await client.query('COMMIT');

    // ── Audit log ─────────────────────────────────────────────────────────────
    await auditLog({
      userId:    req.user.id,
      action:    'PRODUCED',
      tableName: 'production',
      recordId:  production.id,
      detail:    `Produced ${qty_to_produce} x ${formula.fg_name} using formula "${formula.name}"`,
    });

    return res.status(201).json({
      success: true,
      message: `✅ Production complete. ${qty_to_produce} pairs of "${formula.fg_name}" produced.`,
      production_id: production.id,
      finished_good: {
        id:       formula.fg_id,
        name:     formula.fg_name,
        qty_before: fgPrevQty,
        qty_after:  fgNewQty,
      },
      materials_consumed: consumptionSummary,
      packaging,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  } finally {
    client.release();
  }
};

// ─── PRODUCTION HISTORY ───────────────────────────────────────────────────────
const getHistory = async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `${productionHistorySelect}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = await query('SELECT COUNT(*) FROM production');

    return res.json({
      success: true,
      total:   parseInt(total.rows[0].count),
      count:   result.rows.length,
      data:    result.rows,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ONE PRODUCTION RUN (with items) ─────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const prodRes = await query(
      `${productionHistorySelect} WHERE p.id = $1`,
      [req.params.id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Production run not found' });
    }

    const items = await query(
      `SELECT pi.*, rm.name, rm.article_code, rm.color, rm.unit
       FROM production_items pi
       JOIN raw_materials rm ON rm.id = pi.raw_material_id
       WHERE pi.production_id = $1`,
      [req.params.id]
    );

    return res.json({
      success: true,
      data:    { ...prodRes.rows[0], items_consumed: items.rows },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { checkStock, runProduction, getHistory, getOne };
