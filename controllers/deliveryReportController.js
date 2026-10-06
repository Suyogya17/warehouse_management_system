const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getDeliveryReport = async (req, res, next) => {
  try {
    const date = DATE_PATTERN.test(String(req.query.date || ''))
      ? String(req.query.date)
      : new Date().toISOString().slice(0, 10);
    const [supportsAllocations, supportsDeliveredAt, supportsDeliveredBy, supportsWarehouseNotes] = await Promise.all([
      hasTable('order_item_warehouse_allocations'),
      hasColumn('order_item_warehouse_allocations', 'delivered_at'),
      hasColumn('order_item_warehouse_allocations', 'delivered_by'),
      hasTable('order_warehouse_delivery_notes'),
    ]);

    if (!supportsAllocations || !supportsDeliveredAt) {
      return res.json({
        success: true,
        date,
        summary: { delivered_pairs: 0, delivered_cartons: 0, order_count: 0, warehouse_count: 0 },
        data: [],
      });
    }

    const result = await query(
      `SELECT allocation.order_item_id, allocation.warehouse_id,
              allocation.quantity AS delivered_pairs, allocation.delivered_at,
              o.id AS order_id, o.customer_name, o.customer_phone,
              fg.id AS finished_good_id, fg.name AS product_name, fg.article_code,
              fg.color, fg.size, fg.unit, fg.inner_boxes_per_outer_box,
              w.name AS warehouse_name,
              ${supportsDeliveredBy ? 'delivered.name' : 'NULL'} AS delivered_by_name,
              ${supportsWarehouseNotes ? 'note.delivery_note_number' : 'NULL'} AS delivery_note_number
       FROM order_item_warehouse_allocations allocation
       JOIN order_items oi ON oi.id = allocation.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       JOIN warehouses w ON w.id = allocation.warehouse_id
       ${supportsDeliveredBy ? 'LEFT JOIN users delivered ON delivered.id = allocation.delivered_by' : ''}
       ${supportsWarehouseNotes ? `LEFT JOIN order_warehouse_delivery_notes note
         ON note.order_id = o.id AND note.warehouse_id = allocation.warehouse_id` : ''}
       WHERE allocation.allocation_status = 'DEDUCTED'
         AND allocation.delivered_at >= ?
         AND allocation.delivered_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY allocation.delivered_at DESC, o.id DESC, w.name, fg.article_code`,
      [date, date]
    );

    const data = result.rows.map((row) => {
      const pairs = Number(row.delivered_pairs || 0);
      const pairsPerCarton = Number(row.inner_boxes_per_outer_box || 0);
      return {
        ...row,
        delivered_pairs: pairs,
        delivered_cartons: pairsPerCarton > 0 ? Math.round((pairs / pairsPerCarton) * 100) / 100 : 0,
        pairs_per_carton: pairsPerCarton || null,
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
      date,
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
