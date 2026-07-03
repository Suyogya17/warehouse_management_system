const { query } = require('../config/db');
const { hasColumn } = require('../utils/schemaSupport');

const toPositiveInt = (value, fallback, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
};

const getColumnExpr = async (column, fallback) =>
  (await hasColumn('audit_logs', column)) ? `al.${column}` : fallback;

const parseMetadata = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getAll = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1, 100000);
    const limit = toPositiveInt(req.query.limit, 25, 100);
    const offset = (page - 1) * limit;

    const actionExpr = await getColumnExpr('action_type', 'al.action');
    const moduleExpr = await getColumnExpr('module', 'al.table_name');
    const entityTypeExpr = await getColumnExpr('entity_type', 'al.table_name');
    const entityIdExpr = await getColumnExpr('entity_id', 'al.record_id');
    const entityNameExpr = await getColumnExpr('entity_name', 'NULL');
    const descriptionExpr = await getColumnExpr('description', 'al.detail');
    const metadataExpr = await getColumnExpr('metadata', 'NULL');
    const userNameExpr = await getColumnExpr('user_name', 'NULL');
    const userRoleExpr = await getColumnExpr('user_role', 'NULL');
    const ipAddressExpr = await getColumnExpr('ip_address', 'NULL');

    const filters = [];
    const params = [];

    const search = String(req.query.search || '').trim();
    if (search) {
      const term = `%${search}%`;
      filters.push(`(
        COALESCE(u.name, ${userNameExpr}, '') LIKE ?
        OR COALESCE(u.role, ${userRoleExpr}, '') LIKE ?
        OR COALESCE(${actionExpr}, '') LIKE ?
        OR COALESCE(${moduleExpr}, '') LIKE ?
        OR COALESCE(${entityTypeExpr}, '') LIKE ?
        OR COALESCE(${entityNameExpr}, '') LIKE ?
        OR COALESCE(${descriptionExpr}, '') LIKE ?
        OR COALESCE(${metadataExpr}, '') LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term);
    }

    if (req.query.user_id) {
      filters.push('al.user_id = ?');
      params.push(req.query.user_id);
    }

    if (req.query.action_type) {
      filters.push(`${actionExpr} = ?`);
      params.push(String(req.query.action_type).toUpperCase());
    }

    if (req.query.module) {
      filters.push(`${moduleExpr} = ?`);
      params.push(req.query.module);
    }

    if (req.query.entity_type) {
      filters.push(`${entityTypeExpr} = ?`);
      params.push(req.query.entity_type);
    }

    if (req.query.date_from) {
      filters.push('DATE(al.created_at) >= ?');
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      filters.push('DATE(al.created_at) <= ?');
      params.push(req.query.date_to);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await query(
      `SELECT
         al.id,
         al.user_id,
         COALESCE(u.name, ${userNameExpr}, 'Unknown user') AS user_name,
         COALESCE(u.role, ${userRoleExpr}, '-') AS user_role,
         ${actionExpr} AS action_type,
         ${moduleExpr} AS module,
         ${entityTypeExpr} AS entity_type,
         ${entityIdExpr} AS entity_id,
         ${entityNameExpr} AS entity_name,
         ${descriptionExpr} AS description,
         ${metadataExpr} AS metadata,
         ${ipAddressExpr} AS ip_address,
         al.created_at,
         DATE_FORMAT(al.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_formatted
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalRows = await query(
      `SELECT COUNT(*) AS count
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}`,
      params
    );

    const [users, modules, actions, entityTypes] = await Promise.all([
      query(
        `SELECT DISTINCT al.user_id AS id, COALESCE(u.name, ${userNameExpr}, 'Unknown user') AS name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.user_id IS NOT NULL
         ORDER BY name`
      ),
      query(
        `SELECT DISTINCT ${moduleExpr} AS value
         FROM audit_logs al
         WHERE ${moduleExpr} IS NOT NULL AND ${moduleExpr} <> ''
         ORDER BY value`
      ),
      query(
        `SELECT DISTINCT ${actionExpr} AS value
         FROM audit_logs al
         WHERE ${actionExpr} IS NOT NULL AND ${actionExpr} <> ''
         ORDER BY value`
      ),
      query(
        `SELECT DISTINCT ${entityTypeExpr} AS value
         FROM audit_logs al
         WHERE ${entityTypeExpr} IS NOT NULL AND ${entityTypeExpr} <> ''
         ORDER BY value`
      ),
    ]);

    const total = Number(totalRows.rows[0]?.count || 0);

    return res.json({
      success: true,
      data: rows.rows.map((row) => ({
        ...row,
        metadata: parseMetadata(row.metadata),
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        users: users.rows,
        modules: modules.rows.map((row) => row.value).filter(Boolean),
        action_types: actions.rows.map((row) => row.value).filter(Boolean),
        entity_types: entityTypes.rows.map((row) => row.value).filter(Boolean),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll };
