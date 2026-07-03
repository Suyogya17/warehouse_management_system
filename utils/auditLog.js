const { query } = require('../config/db');
const { appendFiscalInsertFields } = require('./nepaliFiscalYear');
const { hasColumn } = require('./schemaSupport');

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
const normalizeMetadata = (metadata, details) => {
  const value = metadata ?? details;
  if (value === undefined || value === null) return null;

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const logActivity = async ({
  userId,
  user_id,
  userName,
  user_name,
  userRole,
  user_role,
  action,
  actionType,
  action_type,
  module,
  tableName,
  table_name,
  entity_type,
  recordId,
  record_id,
  entity_id,
  entityName,
  entity_name,
  description,
  detail,
  details,
  metadata,
  ipAddress,
  ip_address,
}) => {
  try {
    const resolvedUserId = userId ?? user_id ?? null;
    const resolvedAction = actionType ?? action_type ?? action;
    const resolvedTableName = tableName ?? table_name ?? entity_type ?? null;
    const resolvedRecordId = recordId ?? record_id ?? entity_id ?? null;
    const resolvedDetail =
      description ?? detail ?? (details === undefined ? null : JSON.stringify(details));

    const baseColumns = ['user_id', 'action', 'table_name', 'record_id', 'detail'];
    const baseValues = [
      resolvedUserId,
      resolvedAction,
      resolvedTableName,
      resolvedRecordId,
      resolvedDetail,
    ];

    const optionalFields = [
      ['user_name', userName ?? user_name ?? null],
      ['user_role', userRole ?? user_role ?? null],
      ['action_type', resolvedAction],
      ['module', module ?? resolvedTableName],
      ['entity_type', entity_type ?? resolvedTableName],
      ['entity_id', resolvedRecordId],
      ['entity_name', entityName ?? entity_name ?? null],
      ['description', resolvedDetail],
      ['metadata', normalizeMetadata(metadata, details)],
      ['ip_address', ipAddress ?? ip_address ?? null],
    ];

    for (const [column, value] of optionalFields) {
      if (await hasColumn('audit_logs', column)) {
        baseColumns.push(column);
        baseValues.push(value);
      }
    }

    const auditInsert = await appendFiscalInsertFields(
      'audit_logs',
      baseColumns,
      baseValues
    );

    await query(
      `INSERT INTO audit_logs (${auditInsert.columns.join(', ')})
       VALUES (${auditInsert.columns.map(() => '?').join(', ')})`,
      auditInsert.values
    );
  } catch (err) {
    // Non-fatal — never let audit failure crash the main flow
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};

module.exports = logActivity;
module.exports.logActivity = logActivity;
