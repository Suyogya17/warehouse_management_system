require("dotenv").config();
const mysql = require("mysql2/promise");

const QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 30000);
const SLOW_QUERY_MS = Math.max(1, Number(process.env.DB_SLOW_QUERY_MS || 500));
const LOG_ALL_QUERIES =
  String(process.env.DB_LOG_ALL_QUERIES || "false").toLowerCase() === "true";
const DB_SOCKET_PATH = String(process.env.DB_SOCKET_PATH || "").trim();

const pool = mysql.createPool({
  ...(DB_SOCKET_PATH
    ? { socketPath: DB_SOCKET_PATH }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
      }),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 20),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const normalizeResult = (result) => {
  // SELECT queries return an array of rows
  if (Array.isArray(result)) {
    const out = result;
    out.rows = result;
    out.insertId = null;
    return out;
  }

  // INSERT / UPDATE / DELETE return a ResultSetHeader
  const out = result;
  out.rows = [];
  out.insertId = result.insertId ?? null;
  return out;
};

const summarizeSql = (sql = "") =>
  String(sql)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

const executeTimedQuery = async (executor, sql, params = []) => {
  const startedAt = process.hrtime.bigint();

  try {
    const [result] = await executor(
      { sql, timeout: QUERY_TIMEOUT_MS },
      params
    );
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    
    if (LOG_ALL_QUERIES || durationMs >= SLOW_QUERY_MS) {
      const log = {
        type: durationMs >= SLOW_QUERY_MS ? "slow_query" : "query",
        duration_ms: Number(durationMs.toFixed(1)),
        operation: summarizeSql(sql).split(" ", 1)[0]?.toUpperCase() || "SQL",
        sql: summarizeSql(sql),
        parameter_count: Array.isArray(params) ? params.length : 0,
        row_count: Array.isArray(result)
          ? result.length
          : Number(result?.affectedRows || 0),
      };
      const output = JSON.stringify(log);
      if (durationMs >= SLOW_QUERY_MS) console.warn(output);
      else console.info(output);
    }

    return normalizeResult(result);
  } catch (error) {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.error(
      JSON.stringify({
        type: "query_error",
        duration_ms: Number(durationMs.toFixed(1)),
        operation: summarizeSql(sql).split(" ", 1)[0]?.toUpperCase() || "SQL",
        sql: summarizeSql(sql),
        parameter_count: Array.isArray(params) ? params.length : 0,
        code: error.code || null,
        message: error.message,
      })
    );
    throw error;
  }
};

const query = async (sql, params = []) => {
  return executeTimedQuery(pool.query.bind(pool), sql, params);
};

const getClient = async () => {
  const connection = await pool.getConnection();
  return {
    query: async (sql, params = []) =>
      executeTimedQuery(connection.query.bind(connection), sql, params),
    release: () => connection.release(),
  };
};

module.exports = { query, getClient, pool };
