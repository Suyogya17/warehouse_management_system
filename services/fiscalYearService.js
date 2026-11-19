const { getClient, query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const FISCAL_YEAR_TABLE = 'fiscal_years';
const VALID_STATUSES = new Set(['FUTURE', 'ACTIVE', 'CLOSED']);
const CODE_PATTERN = /^\d{4}\/\d{2}$/;
const BS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_TTL_MS = 60_000;

let fiscalYearCache = null;
let fiscalYearCacheExpiresAt = 0;

const invalidateFiscalYearCache = () => {
  fiscalYearCache = null;
  fiscalYearCacheExpiresAt = 0;
};

const normalizeSqlDate = (value = new Date()) => {
  if (typeof value === 'string' && AD_DATE_PATTERN.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('Invalid transaction date.'), { statusCode: 400 });
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const listFiscalYears = async ({ includeCounts = false } = {}) => {
  if (!(await hasTable(FISCAL_YEAR_TABLE))) return [];

  const rows = await query(
    `SELECT id, code, bs_start_date, bs_end_date,
            DATE_FORMAT(ad_start_date, '%Y-%m-%d') AS ad_start_date,
            DATE_FORMAT(ad_end_date, '%Y-%m-%d') AS ad_end_date,
            status, is_locked, created_by, created_at, updated_at
     FROM fiscal_years
     ORDER BY ad_start_date DESC`
  );

  if (!includeCounts || !(await hasColumn('orders', 'fiscal_year_id'))) {
    return rows;
  }

  const counts = await query(
    `SELECT fiscal_year_id, COUNT(*) AS order_count
     FROM orders
     WHERE fiscal_year_id IS NOT NULL
     GROUP BY fiscal_year_id`
  );
  const countById = new Map(
    counts.map((row) => [Number(row.fiscal_year_id), Number(row.order_count)])
  );

  return rows.map((row) => ({
    ...row,
    order_count: countById.get(Number(row.id)) || 0,
  }));
};

const loadFiscalYearRanges = async () => {
  if (fiscalYearCache && fiscalYearCacheExpiresAt > Date.now()) {
    return fiscalYearCache;
  }

  fiscalYearCache = await listFiscalYears();
  fiscalYearCacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return fiscalYearCache;
};

const getFiscalYearForDate = async (value = new Date()) => {
  const sqlDate = normalizeSqlDate(value);
  const fiscalYears = await loadFiscalYearRanges();
  return (
    fiscalYears.find(
      (year) => sqlDate >= year.ad_start_date && sqlDate <= year.ad_end_date
    ) || null
  );
};

const validateFiscalYearInput = (input = {}) => {
  const value = {
    code: String(input.code || '').trim().replace('-', '/'),
    bs_start_date: String(input.bs_start_date || '').trim(),
    bs_end_date: String(input.bs_end_date || '').trim(),
    ad_start_date: String(input.ad_start_date || '').trim(),
    ad_end_date: String(input.ad_end_date || '').trim(),
  };

  if (!CODE_PATTERN.test(value.code)) {
    throw Object.assign(new Error('Fiscal-year code must look like 2083/84.'), {
      statusCode: 400,
    });
  }
  if (!BS_DATE_PATTERN.test(value.bs_start_date) || !BS_DATE_PATTERN.test(value.bs_end_date)) {
    throw Object.assign(new Error('BS dates must use YYYY-MM-DD.'), { statusCode: 400 });
  }
  if (!AD_DATE_PATTERN.test(value.ad_start_date) || !AD_DATE_PATTERN.test(value.ad_end_date)) {
    throw Object.assign(new Error('AD dates must use YYYY-MM-DD.'), { statusCode: 400 });
  }
  if (value.ad_start_date > value.ad_end_date || value.bs_start_date > value.bs_end_date) {
    throw Object.assign(new Error('Fiscal-year start date must be before its end date.'), {
      statusCode: 400,
    });
  }

  const startYear = Number(value.code.slice(0, 4));
  const expectedEnd = String(startYear + 1).slice(-2);
  if (value.code.slice(-2) !== expectedEnd) {
    throw Object.assign(new Error(`Fiscal-year code should be ${startYear}/${expectedEnd}.`), {
      statusCode: 400,
    });
  }

  return value;
};

const createFiscalYear = async (input, userId = null) => {
  const value = validateFiscalYearInput(input);
  const overlap = await query(
    `SELECT id, code
     FROM fiscal_years
     WHERE NOT (? < ad_start_date OR ? > ad_end_date)
     LIMIT 1`,
    [value.ad_end_date, value.ad_start_date]
  );
  if (overlap.length) {
    throw Object.assign(
      new Error(`The AD date range overlaps fiscal year ${overlap[0].code}.`),
      { statusCode: 409 }
    );
  }

  const result = await query(
    `INSERT INTO fiscal_years
       (code, bs_start_date, bs_end_date, ad_start_date, ad_end_date, status, is_locked, created_by)
     VALUES (?, ?, ?, ?, ?, 'FUTURE', 0, ?)`,
    [
      value.code,
      value.bs_start_date,
      value.bs_end_date,
      value.ad_start_date,
      value.ad_end_date,
      userId,
    ]
  );
  invalidateFiscalYearCache();
  return Number(result.insertId);
};

const setFiscalYearState = async (id, input = {}) => {
  const fiscalYearId = Number(id);
  if (!Number.isInteger(fiscalYearId) || fiscalYearId < 1) {
    throw Object.assign(new Error('Invalid fiscal year.'), { statusCode: 400 });
  }

  const client = await getClient();
  try {
    await client.query('START TRANSACTION');
    const rows = await client.query(
      'SELECT * FROM fiscal_years WHERE id = ? FOR UPDATE',
      [fiscalYearId]
    );
    const current = rows[0];
    if (!current) {
      throw Object.assign(new Error('Fiscal year not found.'), { statusCode: 404 });
    }

    const status = input.status
      ? String(input.status).trim().toUpperCase()
      : String(current.status).toUpperCase();
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error('Status must be FUTURE, ACTIVE, or CLOSED.'), {
        statusCode: 400,
      });
    }

    let isLocked = input.is_locked === undefined
      ? Number(current.is_locked) === 1
      : Boolean(input.is_locked);

    if (status === 'ACTIVE') {
      // Year rollover is atomic: the former active year is closed before the
      // new one becomes active, so reports never observe two active years.
      await client.query(
        `UPDATE fiscal_years
         SET status = 'CLOSED', is_locked = 1
         WHERE status = 'ACTIVE' AND id <> ?`,
        [fiscalYearId]
      );
      isLocked = false;
    } else if (status === 'FUTURE') {
      isLocked = false;
    } else if (input.is_locked === undefined) {
      isLocked = true;
    }

    await client.query(
      'UPDATE fiscal_years SET status = ?, is_locked = ? WHERE id = ?',
      [status, isLocked ? 1 : 0, fiscalYearId]
    );
    await client.query('COMMIT');
    invalidateFiscalYearCache();
    return {
      ...current,
      previous_status: current.status,
      previous_is_locked: Number(current.is_locked) === 1,
      status,
      is_locked: isLocked,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const DIRECT_BACKFILL_TABLES = [
  ['orders', ['created_at']],
  ['production', ['created_at']],
  ['consumption_logs', ['created_at']],
  ['stock', ['purchased_at', 'created_at']],
  ['stock_adjustments', ['created_at']],
  ['audit_logs', ['created_at']],
  ['finished_good_warehouse_movements', ['created_at', 'movement_date']],
  ['order_item_warehouse_allocations', ['created_at', 'assigned_at']],
  ['order_warehouse_delivery_notes', ['created_at', 'delivered_at']],
  ['warehouse_billing_history', ['created_at']],
];

const backfillFiscalYears = async () => {
  const summary = [];

  for (const [tableName, candidates] of DIRECT_BACKFILL_TABLES) {
    if (!(await hasTable(tableName)) || !(await hasColumn(tableName, 'fiscal_year_id'))) {
      continue;
    }
    let dateColumn = null;
    for (const candidate of candidates) {
      if (await hasColumn(tableName, candidate)) {
        dateColumn = candidate;
        break;
      }
    }
    if (!dateColumn) continue;

    const result = await query(
      `UPDATE ${tableName} AS target
       JOIN fiscal_years AS fy
         ON DATE(target.${dateColumn}) BETWEEN fy.ad_start_date AND fy.ad_end_date
       SET target.fiscal_year_id = fy.id
       WHERE target.fiscal_year_id IS NULL`
    );
    summary.push({ table: tableName, updated: Number(result.affectedRows || 0) });
  }

  const inheritedTables = [
    ['order_items', 'orders', 'order_id'],
    ['production_items', 'production', 'production_id'],
  ];
  for (const [child, parent, foreignKey] of inheritedTables) {
    if (!(await hasTable(child)) || !(await hasColumn(child, 'fiscal_year_id'))) continue;
    const result = await query(
      `UPDATE ${child} AS child_row
       JOIN ${parent} AS parent_row ON parent_row.id = child_row.${foreignKey}
       SET child_row.fiscal_year_id = parent_row.fiscal_year_id
       WHERE child_row.fiscal_year_id IS NULL
         AND parent_row.fiscal_year_id IS NOT NULL`
    );
    summary.push({ table: child, updated: Number(result.affectedRows || 0) });
  }

  return summary;
};

module.exports = {
  FISCAL_YEAR_TABLE,
  backfillFiscalYears,
  createFiscalYear,
  getFiscalYearForDate,
  invalidateFiscalYearCache,
  listFiscalYears,
  normalizeSqlDate,
  setFiscalYearState,
  validateFiscalYearInput,
};
