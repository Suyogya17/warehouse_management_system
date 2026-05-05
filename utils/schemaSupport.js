const { query } = require("../config/db");

const cache = new Map();

const hasColumn = async (tableName, columnName) => {
  const key = `${tableName}.${columnName}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  const exists = result.length > 0;
  cache.set(key, exists);
  return exists;
};

module.exports = {
  hasColumn,
};
