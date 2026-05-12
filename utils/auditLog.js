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
const auditLog = async ({
  userId,
  user_id,
  action,
  tableName,
  table_name,
  entity_type,
  recordId,
  record_id,
  entity_id,
  detail,
  details,
}) => {
  try {
    const resolvedUserId = userId ?? user_id ?? null;
    const resolvedTableName = tableName ?? table_name ?? entity_type ?? null;
    const resolvedRecordId = recordId ?? record_id ?? entity_id ?? null;
    const resolvedDetail =
      detail ?? (details === undefined ? null : JSON.stringify(details));

    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [resolvedUserId, action, resolvedTableName, resolvedRecordId, resolvedDetail]
    );
  } catch (err) {
    // Non-fatal — never let audit failure crash the main flow
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};

module.exports = auditLog;
