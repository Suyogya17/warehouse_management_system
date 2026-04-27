const { query } = require('../config/db');

const getAll = async (req, res, next) => {
  try {
    const { table_name, action, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT al.*, u.name AS user_name, u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE 1=1`;
    const params = [];

    if (table_name) { params.push(table_name); sql += ` AND al.table_name=$${params.length}`; }
    if (action)     { params.push(action);     sql += ` AND al.action=$${params.length}`; }

    params.push(limit);  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll };