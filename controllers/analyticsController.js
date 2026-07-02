const { query } = require("../config/db");
const { hasColumn } = require("../utils/schemaSupport");

const ACTIVE_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PACKED"];

const activeStatusPlaceholders = ACTIVE_ORDER_STATUSES.map(() => "?").join(",");

const numeric = (value) => Number(value || 0);

const emptyUserWorkflowSummary = () => ({
  active_users: 0,
  confirmed_orders: 0,
  packed_orders: 0,
  delivered_orders: 0,
  confirmed_quantity: 0,
  packed_quantity: 0,
  delivered_quantity: 0,
});

const mapNumeric = (rows, fields) =>
  rows.map((row) =>
    fields.reduce(
      (acc, field) => ({
        ...acc,
        [field]: numeric(row[field]),
      }),
      { ...row }
    )
  );

const run = async (sql, params = []) => {
  const result = await query(sql, params);
  return result.rows || result;
};

const productLabel = (row) =>
  [row.article_code || row.name, row.color, row.size].filter(Boolean).join(" / ");

const getSupport = async (req, res, next) => {
  try {
    const [productSignals, materialRisks] = await Promise.all([
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit,
                fg.quantity AS current_stock,
                fg.min_quantity,
                COALESCE(active_orders.reserved_quantity, 0) AS reserved_quantity,
                COALESCE(order_30.ordered_last_30_days, 0) AS ordered_last_30_days,
                COALESCE(order_90.ordered_last_90_days, 0) AS ordered_last_90_days,
                COALESCE(produced_30.produced_last_30_days, 0) AS produced_last_30_days,
                last_order.last_order_at
         FROM finished_goods fg
         LEFT JOIN (
           SELECT oi.finished_good_id, SUM(oi.qty_ordered) AS reserved_quantity
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.status IN (${activeStatusPlaceholders})
           GROUP BY oi.finished_good_id
         ) active_orders ON active_orders.finished_good_id = fg.id
         LEFT JOIN (
           SELECT oi.finished_good_id, SUM(oi.qty_ordered) AS ordered_last_30_days
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.status <> 'CANCELLED'
             AND o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
           GROUP BY oi.finished_good_id
         ) order_30 ON order_30.finished_good_id = fg.id
         LEFT JOIN (
           SELECT oi.finished_good_id, SUM(oi.qty_ordered) AS ordered_last_90_days
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.status <> 'CANCELLED'
             AND o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
           GROUP BY oi.finished_good_id
         ) order_90 ON order_90.finished_good_id = fg.id
         LEFT JOIN (
           SELECT finished_good_id, SUM(qty_produced) AS produced_last_30_days
           FROM production
           WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
           GROUP BY finished_good_id
         ) produced_30 ON produced_30.finished_good_id = fg.id
         LEFT JOIN (
           SELECT oi.finished_good_id, MAX(o.created_at) AS last_order_at
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.status <> 'CANCELLED'
           GROUP BY oi.finished_good_id
         ) last_order ON last_order.finished_good_id = fg.id
         ORDER BY fg.article_code, fg.color, fg.size`,
        ACTIVE_ORDER_STATUSES
      ),
      run(
        `SELECT id, name, article_code, category, color, unit, quantity, min_quantity
         FROM raw_materials
         WHERE quantity <= min_quantity
         ORDER BY quantity ASC, name ASC
         LIMIT 20`
      ),
    ]);

    const signals = mapNumeric(productSignals, [
      "current_stock",
      "min_quantity",
      "reserved_quantity",
      "ordered_last_30_days",
      "ordered_last_90_days",
      "produced_last_30_days",
    ]);

    const makeRecommendations = signals
      .map((row) => {
        const activeShortage = Math.max(row.reserved_quantity - row.current_stock, 0);
        const recentShortage = Math.max(row.ordered_last_30_days - row.current_stock, 0);
        const safetyShortage = row.current_stock <= row.min_quantity ? row.min_quantity - row.current_stock : 0;
        const suggested_quantity = Math.ceil(Math.max(activeShortage, recentShortage, safetyShortage));
        const priority_score =
          activeShortage * 3 +
          recentShortage * 2 +
          Math.max(row.ordered_last_90_days - row.current_stock, 0) +
          (row.current_stock <= row.min_quantity ? 25 : 0);

        const reasons = [];
        if (activeShortage > 0) reasons.push("active orders are above current stock");
        if (recentShortage > 0) reasons.push("last 30 days demand is above stock");
        if (row.current_stock <= row.min_quantity) reasons.push("stock is at or below minimum");

        return {
          ...row,
          product_name: productLabel(row),
          suggested_quantity,
          priority_score,
          reason: reasons.join(", "),
        };
      })
      .filter((row) => row.suggested_quantity > 0)
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, 20);

    const holdRecommendations = signals
      .map((row) => {
        const monthsOfStock = row.ordered_last_90_days > 0
          ? row.current_stock / Math.max(row.ordered_last_90_days / 3, 1)
          : row.current_stock;
        const priority_score =
          (row.ordered_last_90_days === 0 ? 100 : 0) +
          Math.max(row.current_stock - row.ordered_last_90_days, 0) +
          Math.max(monthsOfStock - 3, 0);

        const reasons = [];
        if (row.ordered_last_90_days === 0 && row.current_stock > 0) reasons.push("no orders in the last 90 days");
        if (row.current_stock > row.ordered_last_90_days && row.ordered_last_90_days > 0) {
          reasons.push("stock is higher than recent 90 day demand");
        }
        if (row.produced_last_30_days > 0 && row.ordered_last_30_days === 0) {
          reasons.push("recently produced with no 30 day sales");
        }

        return {
          ...row,
          product_name: productLabel(row),
          months_of_stock: Number(monthsOfStock.toFixed(1)),
          priority_score,
          reason: reasons.join(", "),
        };
      })
      .filter((row) => row.current_stock > 0 && row.reason)
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, 20);

    const urgentCount = makeRecommendations.filter((row) => row.reserved_quantity > row.current_stock).length;

    return res.json({
      success: true,
      data: {
        summary: {
          make_now_count: makeRecommendations.length,
          hold_count: holdRecommendations.length,
          raw_material_risk_count: materialRisks.length,
          urgent_order_shortage_count: urgentCount,
        },
        make_recommendations: makeRecommendations,
        hold_recommendations: holdRecommendations,
        raw_material_risks: mapNumeric(materialRisks, ["quantity", "min_quantity"]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const [
      rawMaterialTotal,
      finishedGoodsTotal,
      productionThisMonth,
      ordersThisMonth,
      reservedStock,
      lowStockRawMaterials,
      topSellingProducts,
      topDealers,
    ] = await Promise.all([
      run("SELECT COALESCE(SUM(quantity), 0) AS total_quantity FROM raw_materials"),
      run("SELECT COALESCE(SUM(quantity), 0) AS total_quantity FROM finished_goods"),
      run(
        `SELECT COALESCE(SUM(qty_produced), 0) AS total_quantity
         FROM production
         WHERE created_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')`
      ),
      run(
        `SELECT COUNT(*) AS total_orders
         FROM orders
         WHERE created_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')`
      ),
      run(
        `SELECT COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN (${activeStatusPlaceholders})`,
        ACTIVE_ORDER_STATUSES
      ),
      run(
        `SELECT id, name, article_code, category, color, unit, quantity, min_quantity
         FROM raw_materials
         WHERE quantity <= min_quantity
         ORDER BY quantity ASC, name ASC
         LIMIT 10`
      ),
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity,
                COUNT(DISTINCT oi.order_id) AS order_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE o.status <> 'CANCELLED'
         GROUP BY fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit
         ORDER BY total_quantity DESC
         LIMIT 10`
      ),
      run(
        `SELECT COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                u.email AS dealer_email,
                COUNT(DISTINCT o.customer_name) AS customer_count,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.status <> 'CANCELLED'
         GROUP BY o.created_by, u.name, u.email
         ORDER BY total_quantity DESC
         LIMIT 10`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        totals: {
          raw_material_quantity: numeric(rawMaterialTotal[0]?.total_quantity),
          finished_goods_quantity: numeric(finishedGoodsTotal[0]?.total_quantity),
          production_this_month: numeric(productionThisMonth[0]?.total_quantity),
          orders_this_month: numeric(ordersThisMonth[0]?.total_orders),
          reserved_stock: numeric(reservedStock[0]?.total_quantity),
        },
        low_stock_raw_materials: mapNumeric(lowStockRawMaterials, ["quantity", "min_quantity"]),
        top_selling_products: mapNumeric(topSellingProducts, ["total_quantity", "order_count"]),
        top_dealers: mapNumeric(topDealers, ["total_quantity", "order_count", "customer_count"]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getInventory = async (req, res, next) => {
  try {
    const [
      rawMaterialStockSummary,
      finishedGoodsStockSummary,
      lowStockMaterials,
      deadStockFinishedGoods,
      reservedStock,
    ] = await Promise.all([
      run(
        `SELECT category, unit,
                COUNT(*) AS material_count,
                COALESCE(SUM(quantity), 0) AS total_quantity,
                COALESCE(SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END), 0) AS low_stock_count
         FROM raw_materials
         GROUP BY category, unit
         ORDER BY category, unit`
      ),
      run(
        `SELECT unit,
                COUNT(*) AS product_count,
                COALESCE(SUM(quantity), 0) AS total_quantity,
                COALESCE(SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END), 0) AS low_stock_count
         FROM finished_goods
         GROUP BY unit
         ORDER BY unit`
      ),
      run(
        `SELECT id, name, article_code, category, color, unit, quantity, min_quantity
         FROM raw_materials
         WHERE quantity <= min_quantity
         ORDER BY quantity ASC, name ASC`
      ),
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit, fg.quantity,
                MAX(o.created_at) AS last_order_at,
                COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
                                  AND o.status <> 'CANCELLED'
                                  THEN oi.qty_ordered ELSE 0 END), 0) AS ordered_last_90_days
         FROM finished_goods fg
         LEFT JOIN order_items oi ON oi.finished_good_id = fg.id
         LEFT JOIN orders o ON o.id = oi.order_id
         GROUP BY fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit, fg.quantity
         HAVING fg.quantity > 0 AND ordered_last_90_days = 0
         ORDER BY fg.quantity DESC, fg.name ASC`
      ),
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit,
                COALESCE(SUM(oi.qty_ordered), 0) AS reserved_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE o.status IN (${activeStatusPlaceholders})
         GROUP BY fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit
         ORDER BY reserved_quantity DESC`,
        ACTIVE_ORDER_STATUSES
      ),
    ]);

    return res.json({
      success: true,
      data: {
        raw_material_stock_summary: mapNumeric(rawMaterialStockSummary, [
          "material_count",
          "total_quantity",
          "low_stock_count",
        ]),
        finished_goods_stock_summary: mapNumeric(finishedGoodsStockSummary, [
          "product_count",
          "total_quantity",
          "low_stock_count",
        ]),
        low_stock_materials: mapNumeric(lowStockMaterials, ["quantity", "min_quantity"]),
        dead_stock_finished_goods: mapNumeric(deadStockFinishedGoods, [
          "quantity",
          "ordered_last_90_days",
        ]),
        reserved_stock: mapNumeric(reservedStock, ["reserved_quantity"]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getProduction = async (req, res, next) => {
  try {
    const [
      monthlyProductionTrend,
      topProducedProducts,
      rawMaterialConsumption,
      productionByUser,
    ] = await Promise.all([
      run(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                COALESCE(SUM(qty_produced), 0) AS total_quantity,
                COUNT(*) AS production_runs
         FROM production
         WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month`
      ),
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit,
                COALESCE(SUM(p.qty_produced), 0) AS total_quantity,
                COUNT(p.id) AS production_runs
         FROM production p
         JOIN finished_goods fg ON fg.id = p.finished_good_id
         GROUP BY fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit
         ORDER BY total_quantity DESC
         LIMIT 10`
      ),
      run(
        `SELECT rm.id, rm.name, rm.article_code, rm.category, rm.color, rm.unit,
                COALESCE(SUM(pi.qty_consumed), 0) AS total_consumed
         FROM production_items pi
         JOIN raw_materials rm ON rm.id = pi.raw_material_id
         JOIN production p ON p.id = pi.production_id
         WHERE p.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
         GROUP BY rm.id, rm.name, rm.article_code, rm.category, rm.color, rm.unit
         ORDER BY total_consumed DESC
         LIMIT 20`
      ),
      run(
        `SELECT COALESCE(u.name, 'Unknown user') AS user_name,
                COUNT(p.id) AS production_runs,
                COALESCE(SUM(p.qty_produced), 0) AS total_quantity
         FROM production p
         LEFT JOIN users u ON u.id = p.produced_by
         GROUP BY user_name
         ORDER BY total_quantity DESC`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        monthly_production_trend: mapNumeric(monthlyProductionTrend, [
          "total_quantity",
          "production_runs",
        ]),
        top_produced_products: mapNumeric(topProducedProducts, [
          "total_quantity",
          "production_runs",
        ]),
        raw_material_consumption: mapNumeric(rawMaterialConsumption, ["total_consumed"]),
        production_by_user: mapNumeric(productionByUser, ["production_runs", "total_quantity"]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getSales = async (req, res, next) => {
  try {
    const [
      monthlyOrderTrend,
      topSellingProducts,
      orderStatusSummary,
      fulfilledDeliveredOrders,
    ] = await Promise.all([
      run(
        `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
         ORDER BY month`
      ),
      run(
        `SELECT fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity,
                COUNT(DISTINCT oi.order_id) AS order_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE o.status <> 'CANCELLED'
         GROUP BY fg.id, fg.name, fg.article_code, fg.color, fg.size, fg.unit
         ORDER BY total_quantity DESC
         LIMIT 20`
      ),
      run(
        `SELECT status,
                COUNT(*) AS order_count
         FROM orders
         GROUP BY status
         ORDER BY order_count DESC`
      ),
      run(
        `SELECT o.id, o.customer_name, o.customer_phone, o.status, o.created_at, o.delivered_at,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status IN ('FULFILLED', 'DELIVERED')
         GROUP BY o.id, o.customer_name, o.customer_phone, o.status, o.created_at, o.delivered_at
         ORDER BY COALESCE(o.delivered_at, o.created_at) DESC
         LIMIT 50`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        monthly_order_trend: mapNumeric(monthlyOrderTrend, ["order_count", "total_quantity"]),
        top_selling_products: mapNumeric(topSellingProducts, ["total_quantity", "order_count"]),
        order_status_summary: mapNumeric(orderStatusSummary, ["order_count"]),
        fulfilled_delivered_orders: mapNumeric(fulfilledDeliveredOrders, ["total_quantity"]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getDealers = async (req, res, next) => {
  try {
    const [
      topDealersByQuantity,
      topDealersByOrderCount,
      dealerOrderStatusSummary,
      dealerMonthlyOrderTrend,
      dealerCustomerSummary,
    ] = await Promise.all([
      run(
        `SELECT COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                u.email AS dealer_email,
                COUNT(DISTINCT o.customer_name) AS customer_count,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.status <> 'CANCELLED'
         GROUP BY o.created_by, u.name, u.email
         ORDER BY total_quantity DESC
         LIMIT 20`
      ),
      run(
        `SELECT COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                u.email AS dealer_email,
                COUNT(DISTINCT o.customer_name) AS customer_count,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         GROUP BY o.created_by, u.name, u.email
         ORDER BY order_count DESC, total_quantity DESC
         LIMIT 20`
      ),
      run(
        `SELECT COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                o.status,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         GROUP BY o.created_by, u.name, o.status
         ORDER BY dealer_name, order_count DESC`
      ),
      run(
        `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month,
                COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m'), o.created_by, u.name
         ORDER BY month, total_quantity DESC`
      ),
      run(
        `SELECT COALESCE(u.name, 'Unknown dealer') AS dealer_name,
                o.customer_name,
                o.customer_phone,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.status <> 'CANCELLED'
         GROUP BY o.created_by, u.name, o.customer_name, o.customer_phone
         ORDER BY dealer_name, total_quantity DESC
         LIMIT 50`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        top_dealers_by_quantity: mapNumeric(topDealersByQuantity, [
          "order_count",
          "total_quantity",
          "customer_count",
        ]),
        top_dealers_by_order_count: mapNumeric(topDealersByOrderCount, [
          "order_count",
          "total_quantity",
          "customer_count",
        ]),
        dealer_order_status_summary: mapNumeric(dealerOrderStatusSummary, [
          "order_count",
          "total_quantity",
        ]),
        dealer_monthly_order_trend: mapNumeric(dealerMonthlyOrderTrend, [
          "order_count",
          "total_quantity",
        ]),
        dealer_customer_summary: mapNumeric(dealerCustomerSummary, [
          "order_count",
          "total_quantity",
        ]),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const requiredWorkflowColumns = [
      "confirmed_by",
      "confirmed_at",
      "packed_by",
      "packed_at",
      "delivered_by",
      "delivered_at",
    ];
    const columnSupport = await Promise.all(
      requiredWorkflowColumns.map(async (column) => ({
        column,
        supported: await hasColumn("orders", column),
      }))
    );
    const missingWorkflowColumns = columnSupport
      .filter((item) => !item.supported)
      .map((item) => item.column);

    if (missingWorkflowColumns.length) {
      return res.json({
        success: true,
        data: {
          summary: emptyUserWorkflowSummary(),
          user_workflow_report: [],
          missing_workflow_columns: missingWorkflowColumns,
        },
      });
    }

    const userWorkflowReport = await run(
      `SELECT u.id,
              COALESCE(u.name, 'Unknown user') AS user_name,
              u.email,
              u.role,
              COALESCE(confirmed.confirmed_orders, 0) AS confirmed_orders,
              COALESCE(confirmed.confirmed_quantity, 0) AS confirmed_quantity,
              confirmed.last_confirmed_at,
              COALESCE(packed.packed_orders, 0) AS packed_orders,
              COALESCE(packed.packed_quantity, 0) AS packed_quantity,
              packed.last_packed_at,
              COALESCE(delivered.delivered_orders, 0) AS delivered_orders,
              COALESCE(delivered.delivered_quantity, 0) AS delivered_quantity,
              delivered.last_delivered_at
       FROM users u
       LEFT JOIN (
         SELECT o.confirmed_by AS user_id,
                COUNT(DISTINCT o.id) AS confirmed_orders,
                COALESCE(SUM(order_qty.total_quantity), 0) AS confirmed_quantity,
                MAX(o.confirmed_at) AS last_confirmed_at
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(qty_ordered) AS total_quantity
           FROM order_items
           GROUP BY order_id
         ) order_qty ON order_qty.order_id = o.id
         WHERE o.confirmed_by IS NOT NULL
         GROUP BY o.confirmed_by
       ) confirmed ON confirmed.user_id = u.id
       LEFT JOIN (
         SELECT o.packed_by AS user_id,
                COUNT(DISTINCT o.id) AS packed_orders,
                COALESCE(SUM(order_qty.total_quantity), 0) AS packed_quantity,
                MAX(o.packed_at) AS last_packed_at
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(qty_ordered) AS total_quantity
           FROM order_items
           GROUP BY order_id
         ) order_qty ON order_qty.order_id = o.id
         WHERE o.packed_by IS NOT NULL
         GROUP BY o.packed_by
       ) packed ON packed.user_id = u.id
       LEFT JOIN (
         SELECT o.delivered_by AS user_id,
                COUNT(DISTINCT o.id) AS delivered_orders,
                COALESCE(SUM(order_qty.total_quantity), 0) AS delivered_quantity,
                MAX(o.delivered_at) AS last_delivered_at
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(qty_ordered) AS total_quantity
           FROM order_items
           GROUP BY order_id
         ) order_qty ON order_qty.order_id = o.id
         WHERE o.delivered_by IS NOT NULL
         GROUP BY o.delivered_by
       ) delivered ON delivered.user_id = u.id
       WHERE confirmed.user_id IS NOT NULL
          OR packed.user_id IS NOT NULL
          OR delivered.user_id IS NOT NULL
       ORDER BY (
          COALESCE(confirmed.confirmed_orders, 0) +
          COALESCE(packed.packed_orders, 0) +
          COALESCE(delivered.delivered_orders, 0)
       ) DESC, user_name`
    );

    const rows = mapNumeric(userWorkflowReport, [
      "confirmed_orders",
      "confirmed_quantity",
      "packed_orders",
      "packed_quantity",
      "delivered_orders",
      "delivered_quantity",
    ]).map((row) => ({
      ...row,
      total_actions: row.confirmed_orders + row.packed_orders + row.delivered_orders,
      total_quantity_handled:
        row.confirmed_quantity + row.packed_quantity + row.delivered_quantity,
    }));

    const summary = rows.reduce(
      (acc, row) => ({
        active_users: acc.active_users + 1,
        confirmed_orders: acc.confirmed_orders + row.confirmed_orders,
        packed_orders: acc.packed_orders + row.packed_orders,
        delivered_orders: acc.delivered_orders + row.delivered_orders,
        confirmed_quantity: acc.confirmed_quantity + row.confirmed_quantity,
        packed_quantity: acc.packed_quantity + row.packed_quantity,
        delivered_quantity: acc.delivered_quantity + row.delivered_quantity,
      }),
      emptyUserWorkflowSummary()
    );

    return res.json({
      success: true,
      data: {
        summary,
        user_workflow_report: rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getInventory,
  getProduction,
  getSales,
  getDealers,
  getUsers,
  getSupport,
};
