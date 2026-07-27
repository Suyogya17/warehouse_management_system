const { query } = require("../config/db");

const cache = new Map();

const hasColumn = async (tableName, columnName) => {
  const key = `${tableName}.${columnName}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const pendingCheck = query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  )
    .then((result) => result.length > 0)
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  // Cache the in-flight promise as well as its result. Pages such as Gallery
  // request normal and offer availability together; without this, both
  // requests repeat every information_schema lookup.
  cache.set(key, pendingCheck);
  return pendingCheck;
};

const hasTable = async (tableName) => {
  const key = `table.${tableName}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const pendingCheck = query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [tableName]
  )
    .then((result) => result.length > 0)
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, pendingCheck);
  return pendingCheck;
};

module.exports = {
  hasColumn,
  hasTable,
};
