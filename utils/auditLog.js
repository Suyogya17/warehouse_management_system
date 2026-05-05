const { query } = require('../config/db');

/**
 * Records an action in audit_logs.
 * Call this inside controllers after any important mutation.
 *
 * @param {object} opts
 * @param {number|null} opts.userId    - ID of the acting user
 * @param {string}      opts.action    - e.g. "CREATED", "UPDATED", "DELETED", "PRODUCED"
 * @param {string}      opts.tableName - e.g. "raw_materials"
 * @param {number|null} opts.recordId  - ID of the affected row
 * @param {string}      opts.detail    - Human-readable description
 */
const auditLog = async ({ userId = null, action, tableName, recordId = null, detail }) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, action, tableName, recordId, detail]
    );
  } catch (err) {
    // Non-fatal — never let audit failure crash the main flow
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};

module.exports = auditLog;
