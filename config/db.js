require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const normalizeResult = (result) => {
  if (Array.isArray(result)) {
    result.rows = result;
    return result;
  }

  result.rows = [];
  return result;
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
