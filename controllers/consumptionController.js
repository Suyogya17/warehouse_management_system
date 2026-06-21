const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { getPagination, shouldIncludeTotal } = require('../utils/pagination');
const { hasColumn } = require('../utils/schemaSupport');

// ─── LIST ALL LOGS ────────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { limit, offset } = getPagination(req.query, { defaultLimit: 100, maxLimit: 500 });
    const supportsFinishedGood = await hasColumn('consumption_logs', 'finished_good_id');
    const supportsWarehouse = await hasColumn('consumption_logs', 'warehouse_id');

    const result = await query(
      `SELECT cl.*,
              CASE WHEN cl.raw_material_id IS NOT NULL THEN 'RAW' ELSE 'FINISHED' END AS type,
              COALESCE(rm.name${supportsFinishedGood ? ', fg.name' : ''}) AS name,
              COALESCE(rm.article_code${supportsFinishedGood ? ', fg.article_code' : ''}) AS article_code,
              COALESCE(rm.color${supportsFinishedGood ? ', fg.color' : ''}) AS color,
              COALESCE(rm.unit${supportsFinishedGood ? ', fg.unit' : ''}, 'pairs') AS unit,
              ${supportsWarehouse ? 'w.name AS warehouse_name,' : ''}
              u.name AS logged_by_name
       FROM consumption_logs cl
       LEFT JOIN raw_materials rm ON rm.id = cl.raw_material_id
       ${supportsFinishedGood ? 'LEFT JOIN finished_goods fg ON fg.id = cl.finished_good_id' : ''}
       ${supportsWarehouse ? 'LEFT JOIN warehouses w ON w.id = cl.warehouse_id' : ''}
       LEFT JOIN users u ON u.id = cl.logged_by
       ORDER BY cl.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const total = shouldIncludeTotal(req.query)
      ? await query('SELECT COUNT(*) AS count FROM consumption_logs')
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

// ─── LOG MANUAL CONSUMPTION ───────────────────────────────────────────────────
/**
 * POST /api/consumption
 * Body: { raw_material_id, qty_used, reason }
 * reason: "Damaged" | "QC Reject" | "Sample" | "Wastage"
 */
const logConsumption = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { type, raw_material_id, finished_good_id, warehouse_id, qty_used, reason } = req.body;
    const supportsFinishedGood = await hasColumn('consumption_logs', 'finished_good_id');
    const supportsWarehouse = await hasColumn('consumption_logs', 'warehouse_id');

    // ─── BASIC VALIDATION ─────────────────────────────
    if (!type || !qty_used || qty_used <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "type and qty_used (>0) are required",
      });
    }

    let item;
    let table;
    let idField;
    let idValue;

    // ─── TYPE HANDLING ────────────────────────────────
    if (type === "RAW") {
      if (!raw_material_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "raw_material_id is required for RAW consumption",
        });
      }

      table = "raw_materials";
      idField = "raw_material_id";
      idValue = raw_material_id;

      item = await client.query(
        "SELECT id, name, article_code, quantity FROM raw_materials WHERE id=?",
        [raw_material_id]
      );
    } 
    else if (type === "FINISHED") {
      if (!supportsFinishedGood || !supportsWarehouse) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Finished goods consumption needs consumption_logs.finished_good_id and warehouse_id columns.",
        });
      }

      if (!finished_good_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "finished_good_id is required for FINISHED consumption",
        });
      }

      if (!warehouse_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "warehouse_id is required for FINISHED consumption",
        });
      }

      table = "finished_goods";
      idField = "finished_good_id";
      idValue = finished_good_id;

      item = await client.query(
        "SELECT id, name, article_code, quantity FROM finished_goods WHERE id=?",
        [finished_good_id]
      );

      const warehouseStock = await client.query(
        `SELECT quantity
         FROM finished_good_warehouse_stock
         WHERE finished_good_id = ? AND warehouse_id = ?
         FOR UPDATE`,
        [finished_good_id, warehouse_id]
      );

      const warehouseQty = Number(warehouseStock.rows[0]?.quantity || 0);
      if (warehouseQty < qty_used) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          success: false,
          message: "Insufficient stock in selected warehouse",
          available: warehouseQty,
        });
      }
    } 
    else {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid type",
      });
    }

    // ─── CHECK ITEM EXISTS ─────────────────────────────
    if (item.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Item not found" });
    }

    const row = item.rows[0];

    // ─── STOCK CHECK ───────────────────────────────────
    if (row.quantity < qty_used) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        success: false,
        message: "Insufficient stock",
      });
    }

   // ─── INSERT LOG ────────────────────────────────────
let logRes;

if (raw_material_id) {
  logRes = await client.query(
    `INSERT INTO consumption_logs (raw_material_id, qty_used, reason, logged_by)
     VALUES (?, ?, ?, ?)`,
    [raw_material_id, qty_used, reason || null, req.user.id]
  );
} else {
  logRes = await client.query(
    `INSERT INTO consumption_logs (finished_good_id, warehouse_id, qty_used, reason, logged_by)
     VALUES (?, ?, ?, ?, ?)`,
    [finished_good_id, warehouse_id, qty_used, reason || null, req.user.id]
  );
}

const logId = logRes.insertId;

    // ─── UPDATE STOCK ─────────────────────────────────
    await client.query(
      `UPDATE ${table}
       SET quantity = quantity - ?
       WHERE id = ?`,
      [qty_used, idValue]
    );

    if (type === "FINISHED") {
      await client.query(
        `UPDATE finished_good_warehouse_stock
         SET quantity = quantity - ?, updated_by = ?
         WHERE finished_good_id = ? AND warehouse_id = ?`,
        [qty_used, req.user.id, finished_good_id, warehouse_id]
      );

      await client.query(
        `INSERT INTO finished_good_warehouse_movements
           (finished_good_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
         VALUES (?, ?, ?, 'ADJUSTMENT_OUT', 'consumption', ?, ?, ?)`,
        [
          finished_good_id,
          warehouse_id,
          qty_used,
          logId,
          reason ? `Finished goods consumption: ${reason}` : 'Finished goods consumption',
          req.user.id,
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Consumption logged successfully",
      data: { id: logId },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getAll, logConsumption };
