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
  console.log("BODY RECEIVED:", req.body);
  try {
    await client.query("BEGIN");

    const { type, raw_material_id, finished_good_id, qty_used, reason } = req.body;

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
      if (!finished_good_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "finished_good_id is required for FINISHED consumption",
        });
      }

      table = "finished_goods";
      idField = "finished_good_id";
      idValue = finished_good_id;

      item = await client.query(
        "SELECT id, name, article_code, quantity FROM finished_goods WHERE id=?",
        [finished_good_id]
      );
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
    `INSERT INTO consumption_logs (finished_good_id, qty_used, reason, logged_by)
     VALUES (?, ?, ?, ?)`,
    [finished_good_id, qty_used, reason || null, req.user.id]
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
