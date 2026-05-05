const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');

// ─── LIST ALL LOGS ────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT cl.*, rm.name, rm.article_code, rm.color, rm.unit, u.name AS logged_by_name
       FROM consumption_logs cl
       JOIN raw_materials rm ON rm.id = cl.raw_material_id
       LEFT JOIN users u ON u.id = cl.logged_by
       ORDER BY cl.created_at DESC`
    );
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── LOG MANUAL CONSUMPTION ───────────────────────────────────────────────────
/**
 * POST /api/consumption
 * Body: { raw_material_id, qty_used, reason }
 * reason: "Damaged" | "QC Reject" | "Sample" | "Wastage"
 */
const logConsumption = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { raw_material_id, qty_used, reason } = req.body;

    if (!raw_material_id || !qty_used || qty_used <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'raw_material_id and qty_used (>0) are required' });
    }

    // Check material + current stock
    const matRes = await client.query(
      'SELECT id, name, article_code, quantity FROM raw_materials WHERE id=?',
      [raw_material_id]
    );
    if (matRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Raw material not found' });
    }

    const mat = matRes.rows[0];
    const prevQty = parseFloat(mat.quantity);

    if (prevQty < qty_used) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: `Insufficient stock. Available: ${prevQty}, Requested: ${qty_used}`,
      });
    }

    // 1. Log the consumption
    const logRes = await client.query(
      `INSERT INTO consumption_logs (raw_material_id, qty_used, reason, logged_by)
       VALUES (?,?,?,?)`,
      [raw_material_id, qty_used, reason || null, req.user.id]
    );
    const logId = logRes.insertId;

    // 2. Deduct from raw_materials (simple — not FIFO, as this is manual)
    const newQty = prevQty - parseFloat(qty_used);
    await client.query('UPDATE raw_materials SET quantity=? WHERE id=?', [newQty, raw_material_id]);

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id, action: 'CONSUMPTION', tableName: 'consumption_logs',
      recordId: logId,
      detail: `${mat.name} (${mat.article_code}): -${qty_used} [${reason}]. ${prevQty} → ${newQty}`,
    });

    return res.status(201).json({
      success: true,
      message: `Consumption logged. ${mat.name}: ${prevQty} → ${newQty}`,
      data: { id: logId, raw_material_id, qty_used, reason: reason || null, logged_by: req.user.id },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getAll, logConsumption };
