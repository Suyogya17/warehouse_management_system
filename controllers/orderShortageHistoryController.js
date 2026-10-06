const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const text = (value) => String(value || '').trim();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const run = async (sql, params = []) => {
  const result = await query(sql, params);
  return result.rows || result;
};

const getOrderShortageHistory = async (req, res, next) => {
  try {
    const supportsAllocations = await hasTable('order_item_warehouse_allocations');
    const supportsVerification = supportsAllocations &&
      await hasColumn('order_item_warehouse_allocations', 'verification_status');

    if (!supportsAllocations || !supportsVerification) {
      return res.json({
        success: true,
        data: [],
        summary: { records: 0, orders: 0, out_of_stock_pairs: 0, not_found_pairs: 0 },
        filters: { warehouses: [] },
      });
    }

    const supportsNotes = await hasColumn('order_item_warehouse_allocations', 'verification_note');
    const supportsVerifiedBy = await hasColumn('order_item_warehouse_allocations', 'verified_by');
    const supportsVerifiedAt = await hasColumn('order_item_warehouse_allocations', 'verified_at');
    const supportsDeliveredAt = await hasColumn('order_item_warehouse_allocations', 'delivered_at');
    const supportsWarehouseNotes = await hasTable('order_warehouse_delivery_notes');
    const supportsMasterDn = await hasColumn('orders', 'delivery_note_number');
    const supportsWarehouseDeletedAt = await hasColumn('warehouses', 'deleted_at');

    const status = text(req.query.status).toUpperCase();
    const search = text(req.query.search);
    const dateFrom = datePattern.test(text(req.query.date_from)) ? text(req.query.date_from) : '';
    const dateTo = datePattern.test(text(req.query.date_to)) ? text(req.query.date_to) : '';
    const warehouseId = Number.parseInt(req.query.warehouse_id, 10);
    const finishedGoodId = Number.parseInt(req.query.finished_good_id, 10);
    const conditions = [
      `(allocation.allocation_status = 'OUT_OF_STOCK'
        OR allocation.verification_status IN ('NOT_FOUND', 'OUT_OF_STOCK'))`,
    ];
    const params = [];

    if (status === 'NOT_FOUND') {
      conditions.push("allocation.verification_status = 'NOT_FOUND'");
    } else if (status === 'OUT_OF_STOCK') {
      conditions.push("allocation.allocation_status = 'OUT_OF_STOCK'");
    }
    if (Number.isInteger(warehouseId) && warehouseId > 0) {
      conditions.push('allocation.warehouse_id = ?');
      params.push(warehouseId);
    }
    if (Number.isInteger(finishedGoodId) && finishedGoodId > 0) {
      conditions.push('allocation.finished_good_id = ?');
      params.push(finishedGoodId);
    }
    const eventDate = supportsVerifiedAt
      ? 'COALESCE(allocation.verified_at, allocation.created_at)'
      : 'allocation.created_at';
    if (dateFrom) {
      conditions.push(`${eventDate} >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`${eventDate} < DATE_ADD(?, INTERVAL 1 DAY)`);
      params.push(dateTo);
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(`(
        CAST(o.id AS CHAR) LIKE ? OR o.customer_name LIKE ? OR
        fg.name LIKE ? OR fg.article_code LIKE ? OR fg.color LIKE ? OR
        CAST(fg.id AS CHAR) LIKE ? OR warehouse.name LIKE ?
        ${supportsWarehouseNotes ? 'OR warehouse_notes.delivery_note_numbers LIKE ?' : ''}
      )`);
      params.push(like, like, like, like, like, like, like);
      if (supportsWarehouseNotes) params.push(like);
    }

    const rows = await run(
      `SELECT allocation.id AS allocation_id,
              o.id AS order_id, o.customer_name, o.customer_phone,
              o.status AS order_status, o.created_at AS order_placed_at,
              ${supportsMasterDn ? 'o.delivery_note_number' : 'NULL'} AS master_delivery_note_number,
              oi.id AS order_item_id, oi.qty_ordered,
              fg.id AS finished_good_id, fg.name AS product_name,
              fg.article_code, fg.sole_code, fg.color, fg.size,
              fg.inner_boxes_per_outer_box AS pairs_per_carton,
              allocation.quantity AS affected_pairs,
              allocation.allocation_status,
              allocation.verification_status,
              ${supportsNotes ? 'allocation.verification_note' : 'NULL'} AS verification_note,
              ${supportsVerifiedAt ? 'allocation.verified_at' : 'allocation.created_at'} AS verified_at,
              ${supportsDeliveredAt ? 'allocation.delivered_at' : 'NULL'} AS closed_at,
              warehouse.id AS warehouse_id, warehouse.name AS warehouse_name,
              ${supportsVerifiedBy ? 'verifier.name' : 'NULL'} AS verified_by_name,
              ${supportsVerifiedBy ? 'verifier.email' : 'NULL'} AS verified_by_email,
              ${supportsWarehouseNotes ? 'warehouse_notes.delivery_note_numbers' : 'NULL'} AS warehouse_delivery_notes
       FROM order_item_warehouse_allocations allocation
       JOIN order_items oi ON oi.id = allocation.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN finished_goods fg ON fg.id = allocation.finished_good_id
       LEFT JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
       ${supportsVerifiedBy ? 'LEFT JOIN users verifier ON verifier.id = allocation.verified_by' : ''}
       ${supportsWarehouseNotes ? `LEFT JOIN (
         SELECT order_id, warehouse_id,
                GROUP_CONCAT(DISTINCT CONCAT(delivery_note_number, ' [', status, ']')
                  ORDER BY delivery_note_number SEPARATOR ', ') AS delivery_note_numbers
         FROM order_warehouse_delivery_notes
         GROUP BY order_id, warehouse_id
       ) warehouse_notes
         ON warehouse_notes.order_id = o.id
        AND warehouse_notes.warehouse_id = allocation.warehouse_id` : ''}
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${eventDate} DESC, allocation.id DESC`,
      params
    );

    const data = rows.map((row) => {
      const pairsPerCarton = Number(row.pairs_per_carton || 0);
      const affectedPairs = Number(row.affected_pairs || 0);
      const shortageStatus = row.allocation_status === 'OUT_OF_STOCK'
        ? 'OUT_OF_STOCK'
        : 'NOT_FOUND';
      return {
        ...row,
        shortage_status: shortageStatus,
        affected_pairs: affectedPairs,
        affected_ctn: pairsPerCarton > 0 ? affectedPairs / pairsPerCarton : 0,
        delivery_note_numbers:
          row.warehouse_delivery_notes || row.master_delivery_note_number || '',
      };
    });

    const summary = data.reduce((result, row) => {
      result.orderIds.add(Number(row.order_id));
      result.records += 1;
      if (row.shortage_status === 'OUT_OF_STOCK') {
        result.out_of_stock_pairs += row.affected_pairs;
      } else {
        result.not_found_pairs += row.affected_pairs;
      }
      return result;
    }, { records: 0, orderIds: new Set(), out_of_stock_pairs: 0, not_found_pairs: 0 });

    const warehouses = await run(
      `SELECT id, name
       FROM warehouses
       ${supportsWarehouseDeletedAt ? 'WHERE deleted_at IS NULL' : ''}
       ORDER BY name`
    );

    return res.json({
      success: true,
      data,
      summary: {
        records: summary.records,
        orders: summary.orderIds.size,
        out_of_stock_pairs: summary.out_of_stock_pairs,
        not_found_pairs: summary.not_found_pairs,
      },
      filters: { warehouses },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOrderShortageHistory };
