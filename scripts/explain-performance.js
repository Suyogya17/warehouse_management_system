require("dotenv").config();
const { query, pool } = require("../config/db");

const checks = [
  {
    name: "Recent orders",
    sql: `EXPLAIN SELECT id, status, created_at
          FROM orders
          ORDER BY created_at DESC, id DESC
          LIMIT 50`,
  },
  {
    name: "Recent orders for one dealer",
    sql: `EXPLAIN SELECT id, status, created_at
          FROM orders
          WHERE created_by = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 50`,
    params: [1],
  },
  {
    name: "Active reserved stock",
    sql: `EXPLAIN SELECT oi.finished_good_id, SUM(oi.qty_ordered)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN ('PENDING', 'CONFIRMED', 'PACKED')
          GROUP BY oi.finished_good_id`,
  },
  {
    name: "Latest production by product",
    sql: `EXPLAIN SELECT id, finished_good_id, created_at
          FROM production
          WHERE finished_good_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
    params: [1],
  },
];

const main = async () => {
  for (const check of checks) {
    try {
      const rows = await query(check.sql, check.params || []);
      console.log(`\n${check.name}`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
      console.error(`\n${check.name}: ${error.code || error.message}`);
    }
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
