require("dotenv").config();

const { query, pool } = require("../config/db");
const { getNepaliFiscalMeta } = require("../utils/nepaliFiscalYear");
const { hasColumn } = require("../utils/schemaSupport");

const main = async () => {
  const requiredColumns = ["bs_date", "bs_year", "bs_month", "bs_fiscal_year"];
  const supported = await Promise.all(
    requiredColumns.map((column) => hasColumn("orders", column))
  );
  if (!supported.every(Boolean)) {
    throw new Error(
      "Run sql/add-order-date-search-fields.sql before backfilling order fiscal dates."
    );
  }

  const rows = await query(
    `SELECT id, created_at
     FROM orders
     WHERE created_at IS NOT NULL
       AND (bs_date IS NULL OR bs_date = '' OR bs_fiscal_year IS NULL OR bs_fiscal_year = '')
     ORDER BY id`
  );

  for (const row of rows) {
    const meta = getNepaliFiscalMeta(row.created_at);
    await query(
      `UPDATE orders
       SET bs_date = ?, bs_year = ?, bs_month = ?, bs_fiscal_year = ?
       WHERE id = ?`,
      [meta.bs_date, meta.bs_year, meta.bs_month, meta.bs_fiscal_year, row.id]
    );
  }

  console.log(`Backfilled Nepali fiscal dates for ${rows.length} orders.`);
};

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
