const clampInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const getPagination = (query = {}, defaults = {}) => {
  const defaultLimit = defaults.defaultLimit ?? 100;
  const maxLimit = defaults.maxLimit ?? 500;
  const limit = clampInteger(query.limit, defaultLimit, 1, maxLimit);
  const offset = clampInteger(
    query.offset,
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );

  return { limit, offset };
};

const getPagePagination = (
  query = {},
  { defaultPageSize = 50, maxPageSize = 200 } = {}
) => {
  const enabled =
    query.page !== undefined ||
    query.per_page !== undefined ||
    query.page_size !== undefined;
  const page = clampInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInteger(
    query.per_page ?? query.page_size,
    defaultPageSize,
    1,
    maxPageSize
  );

  return {
    enabled,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
};

const getPaginationMeta = ({ page, pageSize }, total) => ({
  page,
  per_page: pageSize,
  total: Number(total || 0),
  total_pages: Math.max(1, Math.ceil(Number(total || 0) / pageSize)),
});

const shouldIncludeTotal = (query = {}) => query.include_total !== "0";

module.exports = {
  getPagination,
  getPagePagination,
  getPaginationMeta,
  shouldIncludeTotal,
};
