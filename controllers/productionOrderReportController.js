const { query } = require('../config/db');
const { listFiscalYears } = require('../services/fiscalYearService');
const { hasColumn } = require('../utils/schemaSupport');

const LEVELS = new Set(['SERIES', 'ARTICLE', 'PRODUCT']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FISCAL_YEAR_PATTERN = /^\d{4}\/\d{2}$/;

const number = (value) => Number(value || 0);

const normalizeSeries = (value = '') =>
  String(value || 'Unassigned')
    .trim()
    .replace(/[-_\s]*sole$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Unassigned';

const productLabel = (product = {}) =>
  [product.article_code || product.name || `Product ${product.id}`, product.color, product.size]
    .filter(Boolean)
    .join(' / ');

const loadProducts = async () => {
  const [supportsSoftDelete, supportsPairsPerCarton] = await Promise.all([
    hasColumn('finished_goods', 'is_deleted'),
    hasColumn('finished_goods', 'inner_boxes_per_outer_box'),
  ]);
  const products = await query(
    `SELECT id, name, article_code, sole_code, color, size, unit,
            ${supportsPairsPerCarton ? 'inner_boxes_per_outer_box' : '0'} AS pairs_per_carton
     FROM finished_goods
     WHERE ${supportsSoftDelete ? 'is_deleted = 0' : '1 = 1'}
     ORDER BY article_code, name, color, size`
  );
  return { products, supportsPairsPerCarton };
};

const buildOptions = (products) => {
  const series = [...new Set(products.map((product) => normalizeSeries(product.sole_code)))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
    .map((value) => ({ value, label: value }));

  const articleMap = new Map();
  products.forEach((product) => {
    const code = String(product.article_code || '').trim();
    if (!code || articleMap.has(code.toLowerCase())) return;
    articleMap.set(code.toLowerCase(), { value: code, label: code });
  });

  return {
    series,
    articles: [...articleMap.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
    ),
    products: products.map((product) => ({
      value: String(product.id),
      label: productLabel(product),
      article_code: product.article_code || null,
      series: normalizeSeries(product.sole_code),
    })),
  };
};

const selectProducts = (products, level, selection) => {
  if (level === 'SERIES') {
    const expected = String(selection).trim().toLowerCase();
    return products.filter(
      (product) => normalizeSeries(product.sole_code).toLowerCase() === expected
    );
  }
  if (level === 'ARTICLE') {
    const expected = String(selection).trim().toLowerCase();
    return products.filter(
      (product) => String(product.article_code || '').trim().toLowerCase() === expected
    );
  }
  const productId = Number(selection);
  return products.filter((product) => Number(product.id) === productId);
};

const getPeriod = (input, fiscalYears) => {
  const fiscalYearCode = String(input.fiscal_year || '').trim();
  if (fiscalYearCode) {
    if (!FISCAL_YEAR_PATTERN.test(fiscalYearCode)) {
      throw Object.assign(new Error('Fiscal year must look like 2083/84.'), { statusCode: 400 });
    }
    const fiscalYear = fiscalYears.find((year) => year.code === fiscalYearCode);
    if (!fiscalYear) {
      throw Object.assign(new Error(`Fiscal year ${fiscalYearCode} is not configured.`), {
        statusCode: 404,
      });
    }
    return {
      fiscal_year: fiscalYear.code,
      date_from: fiscalYear.ad_start_date,
      date_to: fiscalYear.ad_end_date,
      label: `Fiscal year ${fiscalYear.code}`,
    };
  }

  const dateFrom = String(input.date_from || '').trim();
  const dateTo = String(input.date_to || '').trim();
  if ((dateFrom && !DATE_PATTERN.test(dateFrom)) || (dateTo && !DATE_PATTERN.test(dateTo))) {
    throw Object.assign(new Error('Report dates must use YYYY-MM-DD.'), { statusCode: 400 });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw Object.assign(new Error('From date must be before the to date.'), { statusCode: 400 });
  }
  return {
    fiscal_year: null,
    date_from: dateFrom || null,
    date_to: dateTo || null,
    label: dateFrom || dateTo ? `${dateFrom || 'Beginning'} to ${dateTo || 'Today'}` : 'All time',
  };
};

const periodSql = (alias, period) => {
  const clauses = [];
  const params = [];
  if (period.date_from) {
    clauses.push(`${alias}.created_at >= ?`);
    params.push(`${period.date_from} 00:00:00`);
  }
  if (period.date_to) {
    clauses.push(`${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(period.date_to);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  };
};

const getProductionOrderReport = async (req, res, next) => {
  try {
    const [productContext, fiscalYears] = await Promise.all([
      loadProducts(),
      listFiscalYears().catch(() => []),
    ]);
    const { products, supportsPairsPerCarton } = productContext;
    const pairsPerCartonSql = supportsPairsPerCarton
      ? 'fg.inner_boxes_per_outer_box'
      : '0';
    const options = buildOptions(products);
    const defaultFiscalYear =
      fiscalYears.find((year) => String(year.status).toUpperCase() === 'ACTIVE')?.code ||
      fiscalYears[0]?.code ||
      null;

    const level = String(req.query.level || '').trim().toUpperCase();
    const selection = String(req.query.selection || '').trim();
    if (!level && !selection) {
      return res.json({
        success: true,
        data: {
          options,
          fiscal_years: fiscalYears,
          default_fiscal_year: defaultFiscalYear,
          report: null,
        },
      });
    }
    if (!LEVELS.has(level)) {
      return res.status(400).json({
        success: false,
        message: 'Report level must be series, article, or product.',
      });
    }
    if (!selection) {
      return res.status(400).json({ success: false, message: 'Select a product group or article.' });
    }

    const selectedProducts = selectProducts(products, level, selection);
    if (!selectedProducts.length) {
      return res.status(404).json({ success: false, message: 'No matching finished goods were found.' });
    }

    const period = getPeriod(req.query, fiscalYears);
    const productIds = selectedProducts.map((product) => Number(product.id));
    const placeholders = productIds.map(() => '?').join(',');
    const productionPeriod = periodSql('p', period);
    const orderPeriod = periodSql('o', period);

    const [
      productionSummaryRows,
      userOrderRows,
      productionProductRows,
      orderProductRows,
      productionRunRows,
      orderDetailRows,
    ] =
      await Promise.all([
        query(
          `SELECT COALESCE(SUM(p.qty_produced), 0) AS produced_pairs,
                  ROUND(COALESCE(SUM(CASE
                    WHEN COALESCE(${pairsPerCartonSql}, 0) > 0
                    THEN p.qty_produced / ${pairsPerCartonSql} ELSE 0 END), 0), 3) AS produced_cartons,
                  COUNT(p.id) AS production_runs,
                  COUNT(DISTINCT p.finished_good_id) AS produced_product_count,
                  MIN(p.created_at) AS first_production_at,
                  MAX(p.created_at) AS last_production_at
           FROM production p
           JOIN finished_goods fg ON fg.id = p.finished_good_id
           WHERE p.finished_good_id IN (${placeholders})${productionPeriod.sql}`,
          [...productIds, ...productionPeriod.params]
        ),
        query(
          `SELECT o.created_by AS user_id,
                  COALESCE(u.name, 'Unknown user') AS user_name,
                  u.email AS user_email,
                  COALESCE(u.role, 'UNKNOWN') AS user_role,
                  COUNT(DISTINCT CASE WHEN o.status <> 'CANCELLED' THEN o.id END) AS order_count,
                  COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED' THEN oi.qty_ordered ELSE 0 END), 0) AS ordered_pairs,
                  ROUND(COALESCE(SUM(CASE
                    WHEN o.status <> 'CANCELLED' AND COALESCE(${pairsPerCartonSql}, 0) > 0
                    THEN oi.qty_ordered / ${pairsPerCartonSql} ELSE 0 END), 0), 3) AS ordered_cartons,
                  COALESCE(SUM(CASE WHEN o.status = 'PENDING' THEN oi.qty_ordered ELSE 0 END), 0) AS pending_pairs,
                  COALESCE(SUM(CASE WHEN o.status = 'CONFIRMED' THEN oi.qty_ordered ELSE 0 END), 0) AS confirmed_pairs,
                  COALESCE(SUM(CASE WHEN o.status = 'PACKED' THEN oi.qty_ordered ELSE 0 END), 0) AS packed_pairs,
                  COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN oi.qty_ordered ELSE 0 END), 0) AS delivered_pairs,
                  COALESCE(SUM(CASE WHEN o.status = 'CANCELLED' THEN oi.qty_ordered ELSE 0 END), 0) AS cancelled_pairs,
                  MAX(CASE WHEN o.status <> 'CANCELLED' THEN o.created_at END) AS last_order_at
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN finished_goods fg ON fg.id = oi.finished_good_id
           LEFT JOIN users u ON u.id = o.created_by
           WHERE oi.finished_good_id IN (${placeholders})${orderPeriod.sql}
           GROUP BY o.created_by, u.name, u.email, u.role
           HAVING ordered_pairs > 0 OR cancelled_pairs > 0
           ORDER BY ordered_pairs DESC, user_name`,
          [...productIds, ...orderPeriod.params]
        ),
        query(
          `SELECT p.finished_good_id,
                  COALESCE(SUM(p.qty_produced), 0) AS produced_pairs,
                  COUNT(p.id) AS production_runs
           FROM production p
           WHERE p.finished_good_id IN (${placeholders})${productionPeriod.sql}
           GROUP BY p.finished_good_id`,
          [...productIds, ...productionPeriod.params]
        ),
        query(
          `SELECT oi.finished_good_id,
                  COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED' THEN oi.qty_ordered ELSE 0 END), 0) AS ordered_pairs,
                  COALESCE(SUM(CASE WHEN o.status = 'CANCELLED' THEN oi.qty_ordered ELSE 0 END), 0) AS cancelled_pairs,
                  COUNT(DISTINCT CASE WHEN o.status <> 'CANCELLED' THEN o.id END) AS order_count,
                  COUNT(DISTINCT CASE WHEN o.status <> 'CANCELLED' THEN o.created_by END) AS user_count
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.finished_good_id IN (${placeholders})${orderPeriod.sql}
           GROUP BY oi.finished_good_id`,
          [...productIds, ...orderPeriod.params]
        ),
        query(
          `SELECT p.id AS production_id,
                  p.created_at AS produced_at,
                  p.finished_good_id,
                  fg.name AS product_name,
                  fg.article_code,
                  fg.sole_code,
                  fg.color,
                  fg.size,
                  fg.unit,
                  p.qty_produced AS produced_pairs,
                  ROUND(CASE
                    WHEN COALESCE(${pairsPerCartonSql}, 0) > 0
                    THEN p.qty_produced / ${pairsPerCartonSql} ELSE 0 END, 3) AS produced_cartons,
                  COALESCE(u.name, 'Unknown user') AS produced_by_name,
                  u.email AS produced_by_email,
                  p.notes
           FROM production p
           JOIN finished_goods fg ON fg.id = p.finished_good_id
           LEFT JOIN users u ON u.id = p.produced_by
           WHERE p.finished_good_id IN (${placeholders})${productionPeriod.sql}
           ORDER BY p.created_at, p.id`,
          [...productIds, ...productionPeriod.params]
        ),
        query(
          `SELECT o.id AS order_id,
                  o.created_at AS ordered_at,
                  o.created_by AS user_id,
                  COALESCE(u.name, 'Unknown user') AS user_name,
                  u.email AS user_email,
                  COALESCE(u.role, 'UNKNOWN') AS user_role,
                  o.customer_name,
                  o.customer_phone,
                  o.customer_address,
                  o.transport_name,
                  o.delivery_note_number,
                  o.status,
                  oi.finished_good_id,
                  fg.name AS product_name,
                  fg.article_code,
                  fg.sole_code,
                  fg.color,
                  fg.size,
                  fg.unit,
                  oi.qty_ordered AS ordered_pairs,
                  ROUND(CASE
                    WHEN COALESCE(${pairsPerCartonSql}, 0) > 0
                    THEN oi.qty_ordered / ${pairsPerCartonSql} ELSE 0 END, 3) AS ordered_cartons,
                  CASE WHEN o.status <> 'CANCELLED' THEN oi.qty_ordered ELSE 0 END AS included_ordered_pairs,
                  CASE WHEN o.status = 'CANCELLED' THEN oi.qty_ordered ELSE 0 END AS cancelled_pairs
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN finished_goods fg ON fg.id = oi.finished_good_id
           LEFT JOIN users u ON u.id = o.created_by
           WHERE oi.finished_good_id IN (${placeholders})${orderPeriod.sql}
           ORDER BY o.created_at, o.id, fg.article_code, fg.color, fg.size`,
          [...productIds, ...orderPeriod.params]
        ),
      ]);

    const productionSummary = productionSummaryRows[0] || {};
    const userOrders = userOrderRows.map((row) => ({
      ...row,
      user_id: row.user_id === null ? null : number(row.user_id),
      order_count: number(row.order_count),
      ordered_pairs: number(row.ordered_pairs),
      ordered_cartons: number(row.ordered_cartons),
      pending_pairs: number(row.pending_pairs),
      confirmed_pairs: number(row.confirmed_pairs),
      packed_pairs: number(row.packed_pairs),
      delivered_pairs: number(row.delivered_pairs),
      cancelled_pairs: number(row.cancelled_pairs),
    }));
    const orderTotals = userOrders.reduce(
      (totals, row) => ({
        order_count: totals.order_count + row.order_count,
        ordered_pairs: totals.ordered_pairs + row.ordered_pairs,
        ordered_cartons: totals.ordered_cartons + row.ordered_cartons,
        pending_pairs: totals.pending_pairs + row.pending_pairs,
        confirmed_pairs: totals.confirmed_pairs + row.confirmed_pairs,
        packed_pairs: totals.packed_pairs + row.packed_pairs,
        delivered_pairs: totals.delivered_pairs + row.delivered_pairs,
        cancelled_pairs: totals.cancelled_pairs + row.cancelled_pairs,
      }),
      {
        order_count: 0,
        ordered_pairs: 0,
        ordered_cartons: 0,
        pending_pairs: 0,
        confirmed_pairs: 0,
        packed_pairs: 0,
        delivered_pairs: 0,
        cancelled_pairs: 0,
      }
    );

    const productionByProduct = new Map(
      productionProductRows.map((row) => [Number(row.finished_good_id), row])
    );
    const ordersByProduct = new Map(
      orderProductRows.map((row) => [Number(row.finished_good_id), row])
    );
    const productBreakdown = selectedProducts.map((product) => {
      const production = productionByProduct.get(Number(product.id)) || {};
      const orders = ordersByProduct.get(Number(product.id)) || {};
      const producedPairs = number(production.produced_pairs);
      const orderedPairs = number(orders.ordered_pairs);
      return {
        id: Number(product.id),
        name: product.name,
        article_code: product.article_code,
        series: normalizeSeries(product.sole_code),
        color: product.color,
        size: product.size,
        pairs_per_carton: number(product.pairs_per_carton),
        produced_pairs: producedPairs,
        ordered_pairs: orderedPairs,
        cancelled_pairs: number(orders.cancelled_pairs),
        production_runs: number(production.production_runs),
        order_count: number(orders.order_count),
        user_count: number(orders.user_count),
        production_minus_orders_pairs: producedPairs - orderedPairs,
      };
    });

    const productionRuns = productionRunRows.map((row) => ({
      ...row,
      production_id: number(row.production_id),
      finished_good_id: number(row.finished_good_id),
      series: normalizeSeries(row.sole_code),
      produced_pairs: number(row.produced_pairs),
      produced_cartons: number(row.produced_cartons),
    }));
    const orderDetails = orderDetailRows.map((row) => ({
      ...row,
      order_id: number(row.order_id),
      user_id: row.user_id === null ? null : number(row.user_id),
      finished_good_id: number(row.finished_good_id),
      series: normalizeSeries(row.sole_code),
      ordered_pairs: number(row.ordered_pairs),
      ordered_cartons: number(row.ordered_cartons),
      included_ordered_pairs: number(row.included_ordered_pairs),
      cancelled_pairs: number(row.cancelled_pairs),
    }));

    const producedPairs = number(productionSummary.produced_pairs);
    return res.json({
      success: true,
      data: {
        options,
        fiscal_years: fiscalYears,
        default_fiscal_year: defaultFiscalYear,
        report: {
          selection: {
            level,
            value: selection,
            label:
              level === 'SERIES'
                ? selection
                : level === 'ARTICLE'
                  ? selection
                  : productLabel(selectedProducts[0]),
            product_count: selectedProducts.length,
          },
          period,
          summary: {
            produced_pairs: producedPairs,
            produced_cartons: number(productionSummary.produced_cartons),
            production_runs: number(productionSummary.production_runs),
            produced_product_count: number(productionSummary.produced_product_count),
            first_production_at: productionSummary.first_production_at || null,
            last_production_at: productionSummary.last_production_at || null,
            user_count: userOrders.filter((row) => row.ordered_pairs > 0).length,
            ...orderTotals,
            production_minus_orders_pairs: producedPairs - orderTotals.ordered_pairs,
          },
          user_orders: userOrders,
          product_breakdown: productBreakdown,
          order_details: orderDetails,
          production_runs: productionRuns,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProductionOrderReport,
  normalizeSeries,
  selectProducts,
};
