const test = require("node:test");
const assert = require("node:assert/strict");

const integrationEnabled =
  String(process.env.RUN_DB_INTEGRATION || "").toLowerCase() === "true";

if (!integrationEnabled) {
  test("stock adjustment database integration tests", { skip: true }, () => {});
} else {
  const databaseName = String(process.env.DB_NAME || "");
  if (!/(^|[_-])(test|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      "Refusing to run destructive integration setup unless DB_NAME clearly identifies a test or CI database."
    );
  }

  const { pool, query } = require("../config/db");
  const {
    createAdjustment,
    deleteAdjustment,
  } = require("../controllers/stockAdjustmentController");

  const invoke = async (controller, request) => {
    const result = { body: null, statusCode: 200 };
    let nextError;
    const response = {
      status(statusCode) {
        result.statusCode = statusCode;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    };

    await controller(request, response, (error) => {
      nextError = error;
    });
    if (nextError) throw nextError;
    return result;
  };

  test.before(async () => {
    await query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of [
      "audit_logs",
      "stock_adjustments",
      "finished_goods",
      "users",
    ]) {
      await query(`DROP TABLE IF EXISTS ${table}`);
    }
    await query("SET FOREIGN_KEY_CHECKS = 1");

    await query(`
      CREATE TABLE users (
        id INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL
      ) ENGINE=InnoDB
    `);
    await query(`
      CREATE TABLE finished_goods (
        id INT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        quantity DECIMAL(12,2) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB
    `);
    await query(`
      CREATE TABLE stock_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finished_good_id INT NOT NULL,
        qty DECIMAL(12,2) NOT NULL,
        reason VARCHAR(500),
        adjusted_by INT,
        adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_test_adjustment_product
          FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
      ) ENGINE=InnoDB
    `);
    await query(`
      CREATE TABLE audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255) NOT NULL,
        table_name VARCHAR(100),
        record_id INT,
        detail TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
  });

  test.beforeEach(async () => {
    await query("DELETE FROM audit_logs");
    await query("DELETE FROM stock_adjustments");
    await query("DELETE FROM finished_goods");
    await query("DELETE FROM users");
    await query("INSERT INTO users (id, name, role) VALUES (1, 'CI Admin', 'ADMIN')");
  });

  test.after(async () => {
    await pool.end();
  });

  test("simultaneous removals cannot drive finished stock below zero", async () => {
    await query(
      "INSERT INTO finished_goods (id, name, quantity) VALUES (1, 'Concurrent product', 10)"
    );
    const request = () => ({
      body: { finished_good_id: 1, qty: -7, reason: "concurrency test" },
      user: { id: 1, role: "ADMIN" },
    });

    const results = await Promise.all([
      invoke(createAdjustment, request()),
      invoke(createAdjustment, request()),
    ]);

    assert.deepEqual(
      results.map(({ statusCode }) => statusCode).sort(),
      [201, 422]
    );
    const products = await query(
      "SELECT quantity FROM finished_goods WHERE id = 1"
    );
    const adjustments = await query(
      "SELECT COUNT(*) AS count FROM stock_adjustments WHERE finished_good_id = 1"
    );
    assert.equal(Number(products[0].quantity), 3);
    assert.equal(Number(adjustments[0].count), 1);
  });

  test("reversal is rejected when added stock has already been consumed", async () => {
    await query(
      "INSERT INTO finished_goods (id, name, quantity) VALUES (1, 'Consumed product', 5)"
    );
    const adjustment = await query(
      `INSERT INTO stock_adjustments
         (finished_good_id, qty, reason, adjusted_by)
       VALUES (1, 10, 'original addition', 1)`
    );

    const response = await invoke(deleteAdjustment, {
      params: { id: adjustment.insertId },
      user: { id: 1, role: "ADMIN" },
    });

    assert.equal(response.statusCode, 409);
    const products = await query(
      "SELECT quantity FROM finished_goods WHERE id = 1"
    );
    const adjustments = await query(
      "SELECT COUNT(*) AS count FROM stock_adjustments WHERE id = ?",
      [adjustment.insertId]
    );
    assert.equal(Number(products[0].quantity), 5);
    assert.equal(Number(adjustments[0].count), 1);
  });
}
