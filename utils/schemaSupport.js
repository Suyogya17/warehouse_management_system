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
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );

  const exists = result.rows.length > 0;
  cache.set(key, exists);
  return exists;
};

module.exports = {
  hasColumn,
};
