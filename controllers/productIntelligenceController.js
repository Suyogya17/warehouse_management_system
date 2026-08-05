const { query } = require("../config/db");
const { hasColumn, hasTable } = require("../utils/schemaSupport");
const paginationUtils = require("../utils/pagination");

const getPagePagination =
  paginationUtils.getPagePagination ||
  ((params = {}, { defaultPageSize = 50, maxPageSize = 100 } = {}) => {
    const page = Math.max(1, Number.parseInt(params.page, 10) || 1);
    const pageSize = Math.min(
      maxPageSize,
      Math.max(1, Number.parseInt(params.per_page, 10) || defaultPageSize)
    );
    return {
      enabled: true,
      page,
      pageSize,
      offset: (page - 1) * pageSize,
    };
  });

const getPaginationMeta =
  paginationUtils.getPaginationMeta ||
  (({ page, pageSize }, total) => ({
    page,
    per_page: pageSize,
    total: Number(total || 0),
    total_pages: Math.max(1, Math.ceil(Number(total || 0) / pageSize)),
  }));

const ALLOWED_PERIODS = new Set([30, 60, 90, 180, 365]);
const ALLOWED_STATUSES = new Set([
  "ALL",
  "FAST",
  "HEALTHY",
  "SLOW",
  "DEAD_STOCK_RISK",
  "OUT_OF_STOCK",
]);
const ALLOWED_MODES = new Set(["ALL", "NORMAL", "OFFERS"]);
const ALLOWED_PRODUCT_TYPES = new Set(["ALL", "REGULAR", "OFFER"]);
const ALLOWED_STOCK_FILTERS = new Set(["ALL", "AVAILABLE", "OUT_OF_STOCK"]);
const ALLOWED_VISIBILITY_FILTERS = new Set(["ALL", "NP", "IN", "BOTH"]);
const ALLOWED_ACTIVITY = new Set([
  "ALL",
  "SOLD_IN_PERIOD",
  "NO_SALES_IN_PERIOD",
  "NEVER_ORDERED",
]);
const ALLOWED_SORTS = new Set([
  "VELOCITY_DESC",
  "SALES_DESC",
  "STOCK_AGE_DESC",
  "PRODUCTION_DESC",
  "ARTICLE_ASC",
]);

const run = async (sql, params = []) => {
  const result = await query(sql, params);
  return result.rows || result;
};

const number = (value) => Number(value || 0);

const cartonsForPairs = (pairs, pairsPerCarton) => {
  const cartonSize = number(pairsPerCarton);
  return cartonSize > 0 ? number(pairs) / cartonSize : 0;
};

const roundCartons = (value) => Math.round(number(value) * 100) / 100;

const quantile = (sortedValues, percentile) => {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return (
    sortedValues[lower] +
    (sortedValues[upper] - sortedValues[lower]) * (index - lower)
  );
};

const daysSince = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000))
  );
};

const getProducts = async (req, res, next) => {
  try {
    const requestedPeriod = Number.parseInt(req.query.days, 10);
    const days = ALLOWED_PERIODS.has(requestedPeriod) ? requestedPeriod : 90;
    const status = ALLOWED_STATUSES.has(
      String(req.query.status || "ALL").toUpperCase()
    )
      ? String(req.query.status || "ALL").toUpperCase()
      : "ALL";
    const mode = ALLOWED_MODES.has(
      String(req.query.mode || "ALL").toUpperCase()
    )
      ? String(req.query.mode || "ALL").toUpperCase()
      : "ALL";
    const activity = ALLOWED_ACTIVITY.has(
      String(req.query.activity || "ALL").toUpperCase()
    )
      ? String(req.query.activity || "ALL").toUpperCase()
      : "ALL";
    const productType = ALLOWED_PRODUCT_TYPES.has(
      String(req.query.product_type || "ALL").toUpperCase()
    )
      ? String(req.query.product_type || "ALL").toUpperCase()
      : "ALL";
    const stockFilter = ALLOWED_STOCK_FILTERS.has(
      String(req.query.stock || "ALL").toUpperCase()
    )
      ? String(req.query.stock || "ALL").toUpperCase()
      : "ALL";
    const visibilityFilter = ALLOWED_VISIBILITY_FILTERS.has(
      String(req.query.visibility || "ALL").toUpperCase()
    )
      ? String(req.query.visibility || "ALL").toUpperCase()
      : "ALL";
    const exportAll = String(req.query.export || "") === "1";
    const sort = ALLOWED_SORTS.has(
      String(req.query.sort || "VELOCITY_DESC").toUpperCase()
    )
      ? String(req.query.sort || "VELOCITY_DESC").toUpperCase()
      : "VELOCITY_DESC";
    const search = String(req.query.search || "").trim().toLowerCase();
    const series = String(req.query.series || "ALL").trim();
    const pagination = getPagePagination(req.query, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });

    const [
      supportsCancellationCode,
      supportsOfferSnapshots,
      supportsInterest,
      supportsSoftDelete,
      supportsVisibility,
      supportsCountryCode,
      supportsPermissions,
    ] = await Promise.all([
      hasColumn("orders", "cancellation_code"),
      hasColumn("order_items", "ordered_from_offer"),
      hasTable("product_interest_events"),
      hasColumn("finished_goods", "is_deleted"),
      hasColumn("finished_goods", "is_visible"),
      hasColumn("users", "country_code"),
      hasTable("user_product_permissions"),
    ]);

    if (mode !== "ALL" && !supportsOfferSnapshots) {
      return res.status(409).json({
        success: false,
        message:
          "Offer product intelligence requires the offer-order snapshot migration.",
      });
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const itemModeCondition =
      mode === "OFFERS"
        ? "AND COALESCE(oi.ordered_from_offer, 0) = 1"
        : mode === "NORMAL" && supportsOfferSnapshots
          ? "AND COALESCE(oi.ordered_from_offer, 0) = 0"
          : "";
    const genuineCancellationCondition = supportsCancellationCode
      ? "o.status = 'CANCELLED' AND COALESCE(o.cancellation_code, 'OTHER') <> 'DUPLICATE_ORDER'"
      : "o.status = 'CANCELLED'";
    const duplicateCancellationCondition = supportsCancellationCode
      ? "o.status = 'CANCELLED' AND o.cancellation_code = 'DUPLICATE_ORDER'"
      : "FALSE";
    const interestJoin = supportsInterest
      ? `LEFT JOIN (
           SELECT finished_good_id,
                  COUNT(*) AS interest_count,
                  COUNT(DISTINCT user_id) AS interested_user_count,
                  MAX(created_at) AS last_interested_at
           FROM product_interest_events
           WHERE event_type = 'PRODUCT_INTEREST'
             AND created_at >= ?
           GROUP BY finished_good_id
         ) interest ON interest.finished_good_id = fg.id`
      : "";
    const interestColumns = supportsInterest
      ? `COALESCE(interest.interest_count, 0) AS interest_count,
         COALESCE(interest.interested_user_count, 0) AS interested_user_count,
         interest.last_interested_at,`
      : `0 AS interest_count,
         0 AS interested_user_count,
         NULL AS last_interested_at,`;
    const visibilityJoin =
      supportsVisibility && supportsCountryCode && supportsPermissions
        ? `LEFT JOIN (
             SELECT country_permission.finished_good_id,
                    MAX(CASE WHEN UPPER(COALESCE(country_user.country_code, 'NP')) = 'NP' THEN 1 ELSE 0 END) AS open_nepal,
                    MAX(CASE WHEN UPPER(COALESCE(country_user.country_code, 'NP')) = 'IN' THEN 1 ELSE 0 END) AS open_india
             FROM user_product_permissions country_permission
             JOIN users country_user ON country_user.id = country_permission.user_id
             WHERE country_permission.can_view = 1
               AND UPPER(country_user.role) IN ('USER', 'MEMBER', 'ELDER')
               AND NOT EXISTS (
                 SELECT 1
                 FROM user_product_permissions country_deny
                 WHERE country_deny.finished_good_id = country_permission.finished_good_id
                   AND country_deny.user_id = country_permission.user_id
                   AND country_deny.can_view = 0
               )
             GROUP BY country_permission.finished_good_id
           ) product_visibility ON product_visibility.finished_good_id = fg.id`
        : "";
    const visibilityColumns =
      supportsVisibility && supportsCountryCode && supportsPermissions
        ? `CASE WHEN fg.is_visible = 1 THEN COALESCE(product_visibility.open_nepal, 0) ELSE 0 END AS open_nepal,
           CASE WHEN fg.is_visible = 1 THEN COALESCE(product_visibility.open_india, 0) ELSE 0 END AS open_india,`
        : `0 AS open_nepal,
           0 AS open_india,`;

    const rows = await run(
      `SELECT fg.id, fg.name, fg.article_code, fg.sole_code, fg.color, fg.size,
              fg.unit, fg.quantity AS physical_stock,
              fg.inner_boxes_per_outer_box AS pairs_per_carton,
              COALESCE(reserved.reserved_quantity, 0) AS reserved_quantity,
              COALESCE(period_sales.total_quantity, 0) AS total_quantity,
              COALESCE(period_sales.delivered_quantity, 0) AS delivered_quantity,
              COALESCE(period_sales.active_quantity, 0) AS active_quantity,
              COALESCE(period_sales.genuine_cancelled_quantity, 0) AS genuine_cancelled_quantity,
              COALESCE(period_sales.duplicate_cancelled_quantity, 0) AS duplicate_cancelled_quantity,
              COALESCE(period_sales.order_count, 0) AS order_count,
              COALESCE(period_sales.dealer_count, 0) AS dealer_count,
              last_sale.last_order_at,
              last_production.last_production_at,
              last_production.last_produced_quantity,
              ${interestColumns}
              ${visibilityColumns}
              CASE
                WHEN fg.offer_enabled = 1
                 AND (fg.offer_ends_at IS NULL OR fg.offer_ends_at >= CURRENT_TIMESTAMP)
                THEN 1 ELSE 0
              END AS active_offer
       FROM finished_goods fg
       LEFT JOIN (
         SELECT oi.finished_good_id,
                COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED' THEN oi.qty_ordered ELSE 0 END), 0) AS total_quantity,
                COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN oi.qty_ordered ELSE 0 END), 0) AS delivered_quantity,
                COALESCE(SUM(CASE WHEN o.status IN ('PENDING', 'CONFIRMED', 'PACKED') THEN oi.qty_ordered ELSE 0 END), 0) AS active_quantity,
                COALESCE(SUM(CASE WHEN ${genuineCancellationCondition} THEN oi.qty_ordered ELSE 0 END), 0) AS genuine_cancelled_quantity,
                COALESCE(SUM(CASE WHEN ${duplicateCancellationCondition} THEN oi.qty_ordered ELSE 0 END), 0) AS duplicate_cancelled_quantity,
                COUNT(DISTINCT CASE WHEN o.status <> 'CANCELLED' THEN o.id END) AS order_count,
                COUNT(DISTINCT CASE WHEN o.status <> 'CANCELLED' THEN o.created_by END) AS dealer_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.created_at >= ?
           ${itemModeCondition}
         GROUP BY oi.finished_good_id
       ) period_sales ON period_sales.finished_good_id = fg.id
       LEFT JOIN (
         SELECT oi.finished_good_id, MAX(o.created_at) AS last_order_at
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'CANCELLED'
           ${itemModeCondition}
         GROUP BY oi.finished_good_id
       ) last_sale ON last_sale.finished_good_id = fg.id
       LEFT JOIN (
         SELECT finished_good_id,
                SUM(qty_ordered) AS reserved_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN ('PENDING', 'CONFIRMED', 'PACKED')
         GROUP BY finished_good_id
       ) reserved ON reserved.finished_good_id = fg.id
       LEFT JOIN (
         SELECT p.finished_good_id,
                MAX(p.created_at) AS last_production_at,
                SUBSTRING_INDEX(
                  GROUP_CONCAT(p.qty_produced ORDER BY p.created_at DESC, p.id DESC),
                  ',',
                  1
                ) AS last_produced_quantity
         FROM production p
         GROUP BY p.finished_good_id
       ) last_production ON last_production.finished_good_id = fg.id
       ${visibilityJoin}
       ${interestJoin}
       WHERE ${supportsSoftDelete ? "fg.is_deleted = 0" : "1 = 1"}
       ORDER BY fg.article_code, fg.color`,
      supportsInterest ? [cutoff, cutoff] : [cutoff]
    );

    const baseProducts = rows
      .map((row) => {
        const physicalStock = number(row.physical_stock);
        const reservedQuantity = number(row.reserved_quantity);
        const availableStock = Math.max(0, physicalStock - reservedQuantity);
        const totalQuantity = number(row.total_quantity);
        const velocity = totalQuantity / days;
        const pairsPerCarton = number(row.pairs_per_carton);
        const projectedSevenDays = velocity * 7;
        const safetyStock = velocity * 7;
        const rawProductionNeed = Math.max(
          0,
          projectedSevenDays + safetyStock - availableStock
        );
        const recommendedCartons =
          pairsPerCarton > 0
            ? Math.ceil(rawProductionNeed / pairsPerCarton)
            : 0;

        return {
          ...row,
          physical_stock: physicalStock,
          reserved_quantity: reservedQuantity,
          available_stock: availableStock,
          total_quantity: totalQuantity,
          delivered_quantity: number(row.delivered_quantity),
          active_quantity: number(row.active_quantity),
          genuine_cancelled_quantity: number(
            row.genuine_cancelled_quantity
          ),
          duplicate_cancelled_quantity: number(
            row.duplicate_cancelled_quantity
          ),
          order_count: number(row.order_count),
          dealer_count: number(row.dealer_count),
          interest_count: number(row.interest_count),
          interested_user_count: number(row.interested_user_count),
          active_offer: number(row.active_offer),
          open_nepal: number(row.open_nepal),
          open_india: number(row.open_india),
          pairs_per_carton: pairsPerCarton,
          sales_velocity: velocity,
          projected_7_day_demand: Math.ceil(projectedSevenDays),
          safety_stock: Math.ceil(safetyStock),
          recommended_production_cartons: recommendedCartons,
          recommended_production_pairs:
            pairsPerCarton > 0
              ? recommendedCartons * pairsPerCarton
              : Math.ceil(rawProductionNeed),
          days_since_last_order: daysSince(row.last_order_at),
          days_since_last_production: daysSince(row.last_production_at),
        };
      })
      .filter((row) => {
        const matchesSeries =
          series === "ALL" || String(row.sole_code || "") === series;
        const matchesSearch =
          !search ||
          [row.name, row.article_code, row.sole_code, row.color, row.size]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(search));
        const matchesProductType =
          productType === "ALL" ||
          (productType === "OFFER" && Number(row.active_offer) === 1) ||
          (productType === "REGULAR" && Number(row.active_offer) !== 1);
        const matchesStock =
          stockFilter === "ALL" ||
          (stockFilter === "AVAILABLE" && row.available_stock > 0) ||
          (stockFilter === "OUT_OF_STOCK" && row.available_stock <= 0);
        const matchesVisibility =
          visibilityFilter === "ALL" ||
          (visibilityFilter === "NP" && row.open_nepal === 1) ||
          (visibilityFilter === "IN" && row.open_india === 1) ||
          (visibilityFilter === "BOTH" &&
            row.open_nepal === 1 &&
            row.open_india === 1);
        return (
          matchesSeries &&
          matchesSearch &&
          matchesProductType &&
          matchesStock &&
          matchesVisibility
        );
      });

    const positiveVelocities = baseProducts
      .map((row) => row.sales_velocity)
      .filter((value) => value > 0)
      .sort((left, right) => left - right);
    const slowThreshold = quantile(positiveVelocities, 0.25);
    const fastThreshold = quantile(positiveVelocities, 0.75);

    const classified = baseProducts.map((row) => {
      let productStatus = "HEALTHY";
      let reason = "Sales velocity and available stock are within the normal range.";

      if (row.available_stock <= 0) {
        productStatus = "OUT_OF_STOCK";
        reason = "No unreserved stock is currently available.";
      } else if (
        row.total_quantity <= 0 &&
        (row.days_since_last_order === null ||
          row.days_since_last_order >= 90) &&
        (row.days_since_last_production === null ||
          row.days_since_last_production >= 90)
      ) {
        productStatus = "DEAD_STOCK_RISK";
        reason =
          "Stock is available, but no recent demand or recent production activity was found.";
      } else if (
        row.sales_velocity > 0 &&
        row.sales_velocity >= fastThreshold
      ) {
        productStatus = "FAST";
        reason = `Sales velocity is in the fastest 25% of matching products during the selected ${days}-day period.`;
      } else if (
        row.total_quantity <= 0 ||
        (row.sales_velocity > 0 && row.sales_velocity <= slowThreshold)
      ) {
        productStatus = "SLOW";
        reason = `Sales velocity is in the slowest 25% of matching products during the selected ${days}-day period.`;
      }

      return { ...row, status: productStatus, reason };
    });

    const statusCounts = classified.reduce((counts, row) => {
      counts[row.status] = number(counts[row.status]) + 1;
      return counts;
    }, {});
    const statusFiltered =
      status === "ALL"
        ? classified
        : classified.filter((row) => row.status === status);
    const activityMatchers = {
      SOLD_IN_PERIOD: (row) => row.total_quantity > 0,
      NO_SALES_IN_PERIOD: (row) => row.total_quantity <= 0,
      NEVER_ORDERED: (row) => !row.last_order_at,
    };
    const filtered =
      activity === "ALL"
        ? statusFiltered
        : statusFiltered.filter(activityMatchers[activity]);
    const activityCounts = classified.reduce(
      (counts, row) => {
        if (row.total_quantity > 0) counts.sold_in_period += 1;
        else counts.no_sales_in_period += 1;
        if (!row.last_order_at) counts.never_ordered += 1;
        if (row.available_stock <= 0) counts.out_of_stock += 1;
        return counts;
      },
      {
        sold_in_period: 0,
        no_sales_in_period: 0,
        never_ordered: 0,
        out_of_stock: 0,
      }
    );
    const sorters = {
      VELOCITY_DESC: (left, right) =>
        right.sales_velocity - left.sales_velocity,
      SALES_DESC: (left, right) => right.total_quantity - left.total_quantity,
      STOCK_AGE_DESC: (left, right) =>
        number(right.days_since_last_production) -
        number(left.days_since_last_production),
      PRODUCTION_DESC: (left, right) =>
        right.recommended_production_pairs -
        left.recommended_production_pairs,
      ARTICLE_ASC: (left, right) =>
        String(left.article_code || left.name || "").localeCompare(
          String(right.article_code || right.name || "")
        ),
    };
    filtered.sort(sorters[sort]);

    const pageRows = exportAll
      ? filtered
      : filtered.slice(
          pagination.offset,
          pagination.offset + pagination.pageSize
        );
    const summary = filtered.reduce(
      (totals, row) => ({
        product_count: totals.product_count + 1,
        available_stock: totals.available_stock + row.available_stock,
        available_stock_cartons:
          totals.available_stock_cartons +
          cartonsForPairs(row.available_stock, row.pairs_per_carton),
        ordered_quantity: totals.ordered_quantity + row.total_quantity,
        ordered_quantity_cartons:
          totals.ordered_quantity_cartons +
          cartonsForPairs(row.total_quantity, row.pairs_per_carton),
        delivered_quantity:
          totals.delivered_quantity + row.delivered_quantity,
        delivered_quantity_cartons:
          totals.delivered_quantity_cartons +
          cartonsForPairs(row.delivered_quantity, row.pairs_per_carton),
        recommended_production_pairs:
          totals.recommended_production_pairs +
          row.recommended_production_pairs,
        recommended_production_cartons:
          totals.recommended_production_cartons +
          row.recommended_production_cartons,
        genuine_cancelled_quantity:
          totals.genuine_cancelled_quantity +
          row.genuine_cancelled_quantity,
        genuine_cancelled_cartons:
          totals.genuine_cancelled_cartons +
          cartonsForPairs(
            row.genuine_cancelled_quantity,
            row.pairs_per_carton
          ),
        duplicate_cancelled_quantity:
          totals.duplicate_cancelled_quantity +
          row.duplicate_cancelled_quantity,
        duplicate_cancelled_cartons:
          totals.duplicate_cancelled_cartons +
          cartonsForPairs(
            row.duplicate_cancelled_quantity,
            row.pairs_per_carton
          ),
      }),
      {
        product_count: 0,
        available_stock: 0,
        available_stock_cartons: 0,
        ordered_quantity: 0,
        ordered_quantity_cartons: 0,
        delivered_quantity: 0,
        delivered_quantity_cartons: 0,
        recommended_production_pairs: 0,
        recommended_production_cartons: 0,
        genuine_cancelled_quantity: 0,
        genuine_cancelled_cartons: 0,
        duplicate_cancelled_quantity: 0,
        duplicate_cancelled_cartons: 0,
      }
    );
    [
      "available_stock_cartons",
      "ordered_quantity_cartons",
      "delivered_quantity_cartons",
      "recommended_production_cartons",
      "genuine_cancelled_cartons",
      "duplicate_cancelled_cartons",
    ].forEach((key) => {
      summary[key] = roundCartons(summary[key]);
    });

    return res.json({
      success: true,
      data: {
        period_days: days,
        mode,
        activity,
        product_type: productType,
        stock: stockFilter,
        visibility: visibilityFilter,
        velocity_note:
          "Velocity is non-cancelled ordered pairs divided by calendar days. Availability-aware velocity will use daily stock snapshots in the next phase.",
        summary,
        status_counts: statusCounts,
        activity_counts: activityCounts,
        thresholds: {
          slow_velocity: slowThreshold,
          fast_velocity: fastThreshold,
        },
        series_options: [
          ...new Set(
            rows
              .map((row) => String(row.sole_code || "").trim())
              .filter(Boolean)
          ),
        ].sort((left, right) => left.localeCompare(right)),
        products: pageRows,
        pagination: getPaginationMeta(pagination, filtered.length),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProducts };
