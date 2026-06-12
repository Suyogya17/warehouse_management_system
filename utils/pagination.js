const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getPagination = (query = {}, defaults = {}) => {
  const defaultLimit = defaults.defaultLimit ?? 100;
  const maxLimit = defaults.maxLimit ?? 500;
  const requestedLimit = parsePositiveInt(query.limit, defaultLimit);
  const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
  const offset = parsePositiveInt(query.offset, 0);

  return { limit, offset };
};

const shouldIncludeTotal = (query = {}) => query.include_total !== "0";

module.exports = {
  getPagination,
  shouldIncludeTotal,
};
