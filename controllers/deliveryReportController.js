const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getDeliveryReport = async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = DATE_PATTERN.test(String(req.query.from_date || req.query.date || ''))
      ? String(req.query.from_date || req.query.date)
      : today;
    const toDate = DATE_PATTERN.test(String(req.query.to_date || req.query.date || ''))
      ? String(req.query.to_date || req.query.date)
      : fromDate;
    const [supportsAllocations, supportsDeliveredAt, supportsDeliveredBy, supportsWarehouseNotes, supportsUnitPriceSnapshot, supportsCommissionFlag] = await Promise.all([
      hasTable('order_item_warehouse_allocations'),
      hasColumn('order_item_warehouse_allocations', 'delivered_at'),
      hasColumn('order_item_warehouse_allocations', 'delivered_by'),
      hasTable('order_warehouse_delivery_notes'),
      hasColumn('order_items', 'unit_price_snapshot'),
      hasColumn('finished_goods', 'is_commission'),
    ]);

    if (!supportsAllocations || !supportsDeliveredAt) {
      return res.json({
        success: true,
        from_date: fromDate,
        to_date: toDate,
        summary: { delivered_pairs: 0, delivered_cartons: 0, order_count: 0, warehouse_count: 0 },
        data: [],
      });
    }

    const result = await query(
      `SELECT allocation.order_item_id, allocation.warehouse_id,
              allocation.quantity AS delivered_pairs, allocation.delivered_at,
              o.id AS order_id, o.customer_name, o.customer_phone, o.created_by,
              creator.name AS created_by_name,
              ${supportsUnitPriceSnapshot ? 'oi.unit_price_snapshot' : 'fg.price AS unit_price_snapshot'},
              fg.id AS finished_good_id, fg.name AS product_name, fg.article_code,
              fg.color, fg.size, fg.unit, fg.inner_boxes_per_outer_box,
              ${supportsCommissionFlag ? 'fg.is_commission' : '0 AS is_commission'},
              w.name AS warehouse_name,
              ${supportsDeliveredBy ? 'delivered.name' : 'NULL'} AS delivered_by_name,
              ${supportsWarehouseNotes ? 'note.delivery_note_number' : 'NULL'} AS delivery_note_number
       FROM order_item_warehouse_allocations allocation
       JOIN order_items oi ON oi.id = allocation.order_item_id
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN users creator ON creator.id = o.created_by
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       JOIN warehouses w ON w.id = allocation.warehouse_id
       ${supportsDeliveredBy ? 'LEFT JOIN users delivered ON delivered.id = allocation.delivered_by' : ''}
       ${supportsWarehouseNotes ? `LEFT JOIN order_warehouse_delivery_notes note
         ON note.order_id = o.id AND note.warehouse_id = allocation.warehouse_id` : ''}
       WHERE allocation.allocation_status = 'DEDUCTED'
         AND allocation.delivered_at >= ?
         AND allocation.delivered_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY allocation.delivered_at DESC, o.id DESC, w.name, fg.article_code`,
      [fromDate, toDate]
    );

    const data = result.rows.map((row) => {
      const pairs = Number(row.delivered_pairs || 0);
      const pairsPerCarton = Number(row.inner_boxes_per_outer_box || 0);
      return {
        ...row,
        delivered_pairs: pairs,
        delivered_cartons: pairsPerCarton > 0 ? Math.round((pairs / pairsPerCarton) * 100) / 100 : 0,
        pairs_per_carton: pairsPerCarton || null,
        unit_price_snapshot: Number(row.unit_price_snapshot || 0),
        is_commission: Number(row.is_commission || 0) === 1,
      };
    });
    const orderIds = new Set(data.map((row) => row.order_id));
    const warehouseIds = new Set(data.map((row) => row.warehouse_id));
    const summary = data.reduce(
      (total, row) => ({
        ...total,
        delivered_pairs: total.delivered_pairs + row.delivered_pairs,
        delivered_cartons: total.delivered_cartons + row.delivered_cartons,
      }),
      { delivered_pairs: 0, delivered_cartons: 0 }
    );

    return res.json({
      success: true,
      from_date: fromDate,
      to_date: toDate,
      summary: {
        ...summary,
        delivered_cartons: Math.round(summary.delivered_cartons * 100) / 100,
        order_count: orderIds.size,
        warehouse_count: warehouseIds.size,
      },
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDeliveryReport };
