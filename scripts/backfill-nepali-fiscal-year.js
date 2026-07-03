require("dotenv").config();

const { query, pool } = require("../config/db");
const { getNepaliFiscalMeta } = require("../utils/nepaliFiscalYear");
const { hasColumn } = require("../utils/schemaSupport");

const directTables = [
  { table: "users", dateColumn: "created_at" },
  { table: "notifications", dateColumn: "created_at" },
  { table: "raw_materials", dateColumn: "created_at" },
  { table: "finished_goods", dateColumn: "created_at" },
  { table: "stock", dateColumn: "purchased_at" },
  { table: "formulas", dateColumn: "created_at" },
  { table: "production", dateColumn: "created_at" },
  { table: "consumption_logs", dateColumn: "created_at" },
  { table: "audit_logs", dateColumn: "created_at" },
  { table: "user_product_permissions", dateColumn: "created_at" },
  { table: "orders", dateColumn: "created_at" },
  { table: "order_item_warehouse_allocations", dateColumn: "created_at" },
  { table: "warehouses", dateColumn: "created_at" },
  { table: "finished_good_warehouse_stock", dateColumn: "created_at" },
  { table: "finished_good_warehouse_movements", dateColumn: "created_at" },
  { table: "stock_adjustments", dateColumn: "created_at" },
  { table: "advertisements", dateColumn: "created_at" },
];

const joinedTables = [
  {
    table: "order_items",
    rowAlias: "oi",
    selectSql: `SELECT oi.id, o.created_at AS source_date
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id`,
  },
  {
    table: "production_items",
    rowAlias: "pi",
    selectSql: `SELECT pi.id, p.created_at AS source_date
                FROM production_items pi
                JOIN production p ON p.id = pi.production_id`,
  },
];

const tableExists = async (tableName) => {
  const result = await query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [tableName]
  );

  return result.rows.length > 0;
};

const supportsFiscalColumns = async (tableName) => {
  const checks = await Promise.all(
    ["bs_date", "bs_year", "bs_month", "bs_fiscal_year"].map((column) =>
      hasColumn(tableName, column)
    )
  );
  return checks.every(Boolean);
};

const updateRow = async (tableName, id, sourceDate) => {
  const meta = getNepaliFiscalMeta(sourceDate);
  await query(
    `UPDATE ${tableName}
     SET bs_date = ?, bs_year = ?, bs_month = ?, bs_fiscal_year = ?
     WHERE id = ?`,
    [meta.bs_date, meta.bs_year, meta.bs_month, meta.bs_fiscal_year, id]
  );
};

const backfillDirectTable = async ({ table, dateColumn }) => {
  if (!(await tableExists(table)) || !(await hasColumn(table, dateColumn)) || !(await supportsFiscalColumns(table))) {
    return { table, updated: 0, skipped: true };
  }

  const result = await query(
    `SELECT id, ${dateColumn} AS source_date
     FROM ${table}
     WHERE ${dateColumn} IS NOT NULL
       AND (bs_fiscal_year IS NULL OR bs_fiscal_year = '')`
  );

  for (const row of result.rows) {
    await updateRow(table, row.id, row.source_date);
  }

  return { table, updated: result.rows.length, skipped: false };
};

const backfillJoinedTable = async ({ table, rowAlias, selectSql }) => {
  if (!(await tableExists(table)) || !(await supportsFiscalColumns(table))) {
    return { table, updated: 0, skipped: true };
  }

  const result = await query(
    `${selectSql}
     WHERE ${rowAlias}.bs_fiscal_year IS NULL OR ${rowAlias}.bs_fiscal_year = ''`
  );

  for (const row of result.rows) {
    await updateRow(table, row.id, row.source_date);
  }

  return { table, updated: result.rows.length, skipped: false };
};

const main = async () => {
  const summaries = [];

  for (const table of directTables) {
    summaries.push(await backfillDirectTable(table));
  }

  for (const table of joinedTables) {
    summaries.push(await backfillJoinedTable(table));
  }

  console.table(summaries);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
