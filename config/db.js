require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 2),
  queueLimit: 0,
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

const query = async (sql, params = []) => {
  const [result] = await pool.query(sql, params);
  return normalizeResult(result);
};

const getClient = async () => {
  const connection = await pool.getConnection();
  return {
    query: async (sql, params = []) => {
      const [result] = await connection.query(sql, params);
      return normalizeResult(result);
    },
    release: () => connection.release(),
  };
};

module.exports = { query, getClient, pool };
