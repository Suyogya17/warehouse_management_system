require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getClient, pool } = require("../config/db");

const MIGRATIONS_DIRECTORY = path.join(__dirname, "..", "migrations");
const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9][a-z0-9_-]*\.sql$/i;
const MIGRATION_LOCK_NAME = "nepcha_schema_migrations";

const checksum = (content) =>
  crypto.createHash("sha256").update(content).digest("hex");

const readMigrationFiles = async () => {
  const names = (await fs.promises.readdir(MIGRATIONS_DIRECTORY))
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort();

  return Promise.all(
    names.map(async (filename) => {
      const sql = await fs.promises.readFile(
        path.join(MIGRATIONS_DIRECTORY, filename),
        "utf8"
      );
      return {
        version: filename.slice(0, 4),
        filename,
        sql,
        checksum: checksum(sql),
      };
    })
  );
};

const splitStatements = (sql) =>
  sql
    .split(/^\s*--\s*migrate:split\s*$/gim)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^--[^\n]*$/s.test(statement));

const ensureMigrationTable = (client) =>
  client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

const getAppliedMigrations = async (client) => {
  const rows = await client.query(
    "SELECT version, filename, checksum, applied_at FROM schema_migrations ORDER BY version"
  );
  return new Map(rows.map((row) => [row.version, row]));
};

const assertLegacyBaselineExists = async (client, migrations, applied) => {
  if (applied.has("0001") || !migrations.some(({ version }) => version === "0001")) {
    return;
  }

  const rows = await client.query(
    `SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('users', 'finished_goods', 'orders')`
  );

  if (Number(rows[0]?.table_count) !== 3) {
    throw new Error(
      "Migration 0001 is a legacy baseline, but the expected existing schema was not found. Bootstrap the database before running migrations."
    );
  }
};

const printStatus = (migrations, applied) => {
  for (const migration of migrations) {
    const record = applied.get(migration.version);
    const state = !record
      ? "pending"
      : record.checksum === migration.checksum
        ? "applied"
        : "checksum-mismatch";
    console.log(`${migration.version} ${state.padEnd(17)} ${migration.filename}`);
  }
};

const run = async () => {
  const client = await getClient();
  let lockAcquired = false;

  try {
    const lockRows = await client.query("SELECT GET_LOCK(?, 15) AS acquired", [
      MIGRATION_LOCK_NAME,
    ]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      throw new Error("Could not acquire the database migration lock.");
    }

    await ensureMigrationTable(client);
    const migrations = await readMigrationFiles();
    const applied = await getAppliedMigrations(client);
    await assertLegacyBaselineExists(client, migrations, applied);

    for (const migration of migrations) {
      const duplicateVersion = migrations.filter(
        (candidate) => candidate.version === migration.version
      );
      if (duplicateVersion.length > 1) {
        throw new Error(`Duplicate migration version ${migration.version}.`);
      }

      const record = applied.get(migration.version);
      if (record && record.checksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.filename} was changed after it was applied.`
        );
      }
    }

    if (process.argv.includes("--status")) {
      printStatus(migrations, applied);
      return;
    }

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      console.log(`Applying ${migration.filename}`);
      await client.query("START TRANSACTION");
      try {
        for (const statement of splitStatements(migration.sql)) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO schema_migrations (version, filename, checksum)
           VALUES (?, ?, ?)`,
          [migration.version, migration.filename, migration.checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }

    console.log("Database migrations are up to date.");
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK_NAME])
        .catch(() => {});
    }
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { checksum, readMigrationFiles, run, splitStatements };
