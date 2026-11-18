const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { getPagination, shouldIncludeTotal } = require('../utils/pagination');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const {
  validateStockAdjustmentInput,
} = require('../utils/stockAdjustmentValidation');

// GET /api/stock-adjustments
const getAdjustments = async (req, res, next) => {
  try {
    const { finished_good_id } = req.query;
    const { limit, offset } = getPagination(req.query, { defaultLimit: 100, maxLimit: 500 });
    let sql = `
      SELECT sa.*,
             fg.name AS finished_good_name,
             fg.article_code AS finished_good_article_code,
             u.name AS adjusted_by_name
      FROM stock_adjustments sa
      JOIN finished_goods fg ON fg.id = sa.finished_good_id
      LEFT JOIN users u ON u.id = sa.adjusted_by
    `;
    const params = [];
    if (finished_good_id) {
      sql += ' WHERE sa.finished_good_id = ?';
      params.push(finished_good_id);
    }
    sql += ' ORDER BY sa.adjusted_at DESC LIMIT ? OFFSET ?';

    const result = await query(sql, [...params, limit, offset]);
    const total = shouldIncludeTotal(req.query)
      ? await query(
          `SELECT COUNT(*) AS count
           FROM stock_adjustments sa
           ${finished_good_id ? 'WHERE sa.finished_good_id = ?' : ''}`,
          finished_good_id ? [finished_good_id] : []
        )
      : null;

    return res.json({
      success: true,
      total: total ? parseInt(total.rows[0].count, 10) : undefined,
      count: result.rows.length,
      limit,
      offset,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/stock-adjustments
const createAdjustment = async (req, res, next) => {
  let client;
  try {
    const validation = validateStockAdjustmentInput(req.body);
    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const {
      finishedGoodId,
      quantity,
      reason,
    } = validation.value;

    client = await getClient();
    await client.query('BEGIN');

    // Lock the row until commit so simultaneous adjustments cannot overwrite
    // each other after reading the same starting quantity.
    const fgRes = await client.query(
      'SELECT id, name, quantity FROM finished_goods WHERE id = ? FOR UPDATE',
      [finishedGoodId]
    );
    if (fgRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Finished good not found.' });
    }

    const fg = fgRes.rows[0];
    const qtyBefore = Number(fg.quantity);
    const qtyAfter = qtyBefore + quantity;

    // Prevent negative stock
    if (qtyAfter < 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: `Cannot remove ${Math.abs(quantity)} pairs — only ${qtyBefore} in stock.`,
      });
    }

    // Insert adjustment record
    const adjustmentInsert = await appendFiscalInsertFields(
      'stock_adjustments',
      ['finished_good_id', 'qty', 'reason', 'adjusted_by'],
      [finishedGoodId, quantity, reason, req.user.id]
    );
    const insertRes = await client.query(
      `INSERT INTO stock_adjustments (${adjustmentInsert.columns.join(', ')})
       VALUES (${adjustmentInsert.columns.map(() => '?').join(', ')})`,
      adjustmentInsert.values
    );

    // Update finished_goods quantity
    await client.query(
      'UPDATE finished_goods SET quantity = ? WHERE id = ?',
      [qtyAfter, finishedGoodId]
    );

    await client.query('COMMIT');

    await auditLog({
      userId:    req.user.id,
      action:    quantity > 0 ? 'STOCK_ADDED' : 'STOCK_REMOVED',
      tableName: 'stock_adjustments',
      recordId:  insertRes.insertId,
      detail:    `Adjusted "${fg.name}" by ${quantity > 0 ? '+' : ''}${quantity} pairs. Reason: ${reason || '—'}`,
    });

    return res.status(201).json({
      success: true,
      message: `Stock adjusted successfully.`,
      data: {
        id:               insertRes.insertId,
        finished_good_id: finishedGoodId,
        finished_good_name: fg.name,
        qty:              quantity,
        qty_before:       qtyBefore,
        qty_after:        qtyAfter,
        reason,
      },
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
};

// DELETE /api/stock-adjustments/:id  (admin only)
const deleteAdjustment = async (req, res, next) => {
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');

    if (!['ADMIN', 'CO_ADMIN'].includes(req.user.role)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const adjRes = await client.query(
      'SELECT * FROM stock_adjustments WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (adjRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Adjustment not found.' });
    }

    const adj = adjRes.rows[0];

    const stockRes = await client.query(
      'SELECT id, quantity FROM finished_goods WHERE id = ? FOR UPDATE',
      [adj.finished_good_id]
    );
    if (stockRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'The related finished good no longer exists.',
      });
    }

    const quantityAfterReversal = Number(stockRes.rows[0].quantity) - Number(adj.qty);
    if (quantityAfterReversal < 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          'This adjustment cannot be reversed because some of the added stock has already been used.',
      });
    }

    // Reverse the qty change on finished_goods
    await client.query(
      'UPDATE finished_goods SET quantity = ? WHERE id = ?',
      [quantityAfterReversal, adj.finished_good_id]
    );

    await client.query(
      'DELETE FROM stock_adjustments WHERE id = ?',
      [req.params.id]
    );

    await client.query('COMMIT');

    await auditLog({
      userId:    req.user.id,
      action:    'DELETED',
      tableName: 'stock_adjustments',
      recordId:  req.params.id,
      detail:    `Reversed stock adjustment #${req.params.id} (${adj.qty > 0 ? '+' : ''}${adj.qty} pairs)`,
    });

    return res.json({ success: true, message: 'Adjustment reversed and deleted.' });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
};

module.exports = { getAdjustments, createAdjustment, deleteAdjustment };
