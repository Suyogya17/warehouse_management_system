const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { buildStockSummarySelect } = require('../utils/queryBuilders');
const { hasColumn } = require('../utils/schemaSupport');

// ─── GET ALL STOCK BATCHES FOR A MATERIAL ────────────────────────────────────
const getBatchesForMaterial = async (req, res, next) => {
  try {
    const { raw_material_id } = req.params;

    const result = await query(
      `SELECT s.*, rm.name, rm.article_code, rm.color, rm.unit
       FROM stock s
       JOIN raw_materials rm ON rm.id = s.raw_material_id
       WHERE s.raw_material_id = $1
       ORDER BY s.purchased_at ASC`,
      [raw_material_id]
    );

    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── RECEIVE STOCK (new purchase/delivery) ───────────────────────────────────
/**
 * POST /api/stock/receive
 * Body: { raw_material_id, qty_added, notes }
 *
 * This adds a new FIFO batch AND increments raw_materials.quantity.
 */
const receiveStock = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { raw_material_id, qty_added, notes } = req.body;

    if (!raw_material_id || !qty_added || qty_added <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'raw_material_id and qty_added (>0) are required' });
    }

    // Check material exists
    const matRes = await client.query(
      'SELECT id, name, article_code, quantity FROM raw_materials WHERE id=$1',
      [raw_material_id]
    );
    if (matRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Raw material not found' });
    }

    const mat = matRes.rows[0];
    const prevQty = parseFloat(mat.quantity);

    // 1. Add stock batch (FIFO entry)
    const batchRes = await client.query(
      `INSERT INTO stock (raw_material_id, qty_added, qty_remaining, notes)
       VALUES ($1, $2, $2, $3) RETURNING *`,
      [raw_material_id, qty_added, notes || null]
    );

    // 2. Increment raw_materials.quantity
    const newQty = prevQty + parseFloat(qty_added);
    await client.query(
      'UPDATE raw_materials SET quantity=$1 WHERE id=$2',
      [newQty, raw_material_id]
    );

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: 'STOCK_RECEIVED',
      tableName: 'stock',
      recordId: batchRes.rows[0].id,
      detail: `${mat.name} (${mat.article_code}): qty ${prevQty} → ${newQty} (+${qty_added})`,
    });

    return res.status(201).json({
      success: true,
      message: `Stock received. ${mat.name} updated: ${prevQty} → ${newQty}`,
      data: { batch: batchRes.rows[0], new_total_quantity: newQty },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── STOCK SUMMARY (all materials) ───────────────────────────────────────────
const getStockSummary = async (req, res, next) => {
  try {
    const supportsImage = await hasColumn("raw_materials", "image_url");
    const result = await query(`${buildStockSummarySelect(supportsImage)} ORDER BY rm.category, rm.article_code, rm.color`);
    const lowStock = result.rows.filter(r => r.is_low_stock);

    return res.json({
      success: true,
      summary: {
        total_materials: result.rows.length,
        low_stock_count: lowStock.length,
      },
      data: result.rows,
      low_stock_alerts: lowStock,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBatchesForMaterial, receiveStock, getStockSummary };
