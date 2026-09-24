const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const ACTIVE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PACKED']);
const number = (value) => Number(value || 0);
const text = (value) => String(value || '').trim();
const partyKey = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const run = async (sql, params = []) => {
  const result = await query(sql, params);
  return result.rows || result;
};

const round = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

const getPartyOrderReport = async (req, res, next) => {
  try {
    const supportsAllocations =
      (await hasTable('order_item_warehouse_allocations')) &&
      (await hasColumn('order_item_warehouse_allocations', 'allocation_status'));
    const supportsWarehouseNotes = await hasTable('order_warehouse_delivery_notes');
    const supportsProductAllocations =
      (await hasTable('user_product_permissions')) &&
      (await hasColumn('user_product_permissions', 'allocation_quantity'));
    const supportsAllocationScope = supportsProductAllocations
      ? await hasColumn('user_product_permissions', 'allocation_scope')
      : false;
    const supportsOfferSnapshots = await hasColumn('order_items', 'ordered_from_offer');
    const supportsControlledUsage = await hasColumn('order_items', 'controlled_personal_quantity');
    const [
      supportsCustomerAddress,
      supportsAddress,
      supportsPanNumber,
      supportsTransportName,
      supportsCancelReason,
      supportsMasterDeliveryNote,
    ] = await Promise.all([
      hasColumn('orders', 'customer_address'),
      hasColumn('orders', 'address'),
      hasColumn('orders', 'pan_number'),
      hasColumn('orders', 'transport_name'),
      hasColumn('orders', 'cancel_reason'),
      hasColumn('orders', 'delivery_note_number'),
    ]);
    const customerAddressExpression = supportsCustomerAddress
      ? 'o.customer_address'
      : supportsAddress
        ? 'o.address'
        : 'NULL';

    const conditions = [];
    const params = [];
    const dateFrom = datePattern.test(text(req.query.date_from)) ? text(req.query.date_from) : '';
    const dateTo = datePattern.test(text(req.query.date_to)) ? text(req.query.date_to) : '';
    const dealerId = Number.parseInt(req.query.dealer_user_id, 10);
    const status = text(req.query.status).toUpperCase();
    const party = text(req.query.party);
    const search = text(req.query.search);
    const series = text(req.query.series)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (dateFrom) {
      conditions.push('o.created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push("o.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(dateTo);
    }
    if (Number.isInteger(dealerId) && dealerId > 0) {
      conditions.push('o.created_by = ?');
      params.push(dealerId);
    }
    if (status && status !== 'ALL') {
      conditions.push('UPPER(o.status) = ?');
      params.push(status);
    }
    if (party) {
      conditions.push("LOWER(REPLACE(REPLACE(REPLACE(TRIM(o.customer_name), ' ', ''), '-', ''), '.', '')) = ?");
      params.push(partyKey(party));
    }
    if (series.length) {
      conditions.push(`fg.sole_code IN (${series.map(() => '?').join(',')})`);
      params.push(...series);
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(`(
        o.customer_name LIKE ? OR o.customer_phone LIKE ? OR
        fg.name LIKE ? OR fg.article_code LIKE ? OR fg.color LIKE ? OR
        CAST(fg.id AS CHAR) LIKE ? OR CAST(o.id AS CHAR) LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like);
    }

    const rows = await run(
      `SELECT o.id AS order_id,
              o.customer_name, o.customer_phone,
              ${customerAddressExpression} AS customer_address,
              ${supportsPanNumber ? 'o.pan_number' : 'NULL'} AS pan_number,
              ${supportsTransportName ? 'o.transport_name' : 'NULL'} AS transport_name,
              o.status AS order_status,
              ${supportsCancelReason ? 'o.cancel_reason' : 'NULL'} AS cancel_reason,
              o.created_at AS order_placed_at,
              ${supportsMasterDeliveryNote ? 'o.delivery_note_number' : 'NULL'} AS master_delivery_note_number,
              o.created_by AS dealer_user_id,
              dealer.name AS dealer_name, dealer.email AS dealer_email,
              oi.id AS order_item_id, oi.finished_good_id, oi.qty_ordered,
              fg.name AS product_name, fg.article_code, fg.sole_code,
              fg.color, fg.size, fg.quantity AS physical_stock,
              fg.inner_boxes_per_outer_box AS pairs_per_carton,
              COALESCE(allocation.delivered_pairs, 0) AS delivered_pairs,
              COALESCE(allocation.planned_pairs, 0) AS warehouse_planned_pairs,
              COALESCE(allocation.out_of_stock_pairs, 0) AS out_of_stock_pairs,
              ${supportsWarehouseNotes ? 'warehouse_notes.delivery_note_numbers' : 'NULL'} AS delivery_note_numbers
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       LEFT JOIN users dealer ON dealer.id = o.created_by
       ${supportsAllocations ? `LEFT JOIN (
         SELECT order_item_id,
                SUM(CASE WHEN allocation_status = 'DEDUCTED' THEN quantity ELSE 0 END) AS delivered_pairs,
                SUM(CASE WHEN allocation_status = 'PLANNED' THEN quantity ELSE 0 END) AS planned_pairs,
                SUM(CASE WHEN allocation_status = 'OUT_OF_STOCK' THEN quantity ELSE 0 END) AS out_of_stock_pairs
         FROM order_item_warehouse_allocations
         GROUP BY order_item_id
       ) allocation ON allocation.order_item_id = oi.id` : `LEFT JOIN (
         SELECT NULL AS order_item_id, 0 AS delivered_pairs,
                0 AS planned_pairs, 0 AS out_of_stock_pairs
       ) allocation ON 1 = 0`}
       ${supportsWarehouseNotes ? `LEFT JOIN (
         SELECT order_id,
                GROUP_CONCAT(DISTINCT CONCAT(delivery_note_number, ' [', status, ']')
                  ORDER BY delivery_note_number SEPARATOR ', ') AS delivery_note_numbers
         FROM order_warehouse_delivery_notes
         GROUP BY order_id
       ) warehouse_notes ON warehouse_notes.order_id = o.id` : ''}
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY o.created_at DESC, o.id DESC, fg.article_code, fg.color, oi.id`,
      params
    );

    const productIds = [...new Set(rows.map((row) => Number(row.finished_good_id)).filter(Boolean))];
    const dealerIds = [...new Set(rows.map((row) => Number(row.dealer_user_id)).filter(Boolean))];
    let allocationByDealerProduct = new Map();
    if (supportsProductAllocations && productIds.length && dealerIds.length) {
      const productPlaceholders = productIds.map(() => '?').join(',');
      const dealerPlaceholders = dealerIds.map(() => '?').join(',');
      const allocationRows = await run(
        `SELECT upp.user_id, upp.finished_good_id,
                upp.allocation_quantity, upp.allocation_percentage,
                upp.allocation_started_at,
                ${supportsAllocationScope ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE')" : "'EXCLUSIVE'"} AS allocation_scope,
                COALESCE(SUM(${
                  supportsAllocationScope && supportsControlledUsage
                    ? `CASE WHEN COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED'
                         THEN COALESCE(oi.controlled_personal_quantity, 0)
                         ELSE COALESCE(oi.qty_ordered, 0) END`
                    : 'COALESCE(oi.qty_ordered, 0)'
                }), 0) AS allocation_used_quantity
         FROM user_product_permissions upp
         LEFT JOIN orders allocation_order
           ON allocation_order.created_by = upp.user_id
          AND allocation_order.status <> 'CANCELLED'
          AND allocation_order.created_at >= COALESCE(upp.allocation_started_at, '1970-01-01')
         LEFT JOIN order_items oi
           ON oi.order_id = allocation_order.id
          AND oi.finished_good_id = upp.finished_good_id
          ${supportsOfferSnapshots ? `AND (${
            supportsAllocationScope
              ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED' OR "
              : ''
          }COALESCE(oi.ordered_from_offer, 0) = 0)` : ''}
         WHERE upp.allocation_quantity IS NOT NULL
           AND upp.finished_good_id IN (${productPlaceholders})
           AND upp.user_id IN (${dealerPlaceholders})
         GROUP BY upp.user_id, upp.finished_good_id, upp.allocation_quantity,
                  upp.allocation_percentage, upp.allocation_started_at${supportsAllocationScope ? ', upp.allocation_scope' : ''}`,
        [...productIds, ...dealerIds]
      );
      allocationByDealerProduct = new Map(allocationRows.map((row) => [
        `${Number(row.user_id)}:${Number(row.finished_good_id)}`,
        {
          user_id: Number(row.user_id),
          allocation_quantity: number(row.allocation_quantity),
          allocation_percentage: row.allocation_percentage === null ? null : number(row.allocation_percentage),
          allocation_started_at: row.allocation_started_at,
          allocation_scope: text(row.allocation_scope).toUpperCase(),
          used_quantity: number(row.allocation_used_quantity),
          available_quantity: Math.max(0, number(row.allocation_quantity) - number(row.allocation_used_quantity)),
        },
      ]));
    }

    const groups = new Map();
    const aliases = new Map();
    rows.forEach((row) => {
      const normalizedParty = partyKey(row.customer_name) || `order${row.order_id}`;
      // Product allocation belongs to the dealer account, not the customer
      // name. Keep identical party names under different dealers separate.
      const key = `${Number(row.dealer_user_id) || 0}:${normalizedParty}:${Number(row.finished_good_id)}`;
      const orderedPairs = number(row.qty_ordered);
      const cancelled = text(row.order_status).toUpperCase() === 'CANCELLED';
      const deliveredPairs = cancelled ? 0 : Math.min(orderedPairs, number(row.delivered_pairs));
      const remainingPairs = cancelled ? 0 : Math.max(0, orderedPairs - deliveredPairs);
      const reservedPairs = cancelled || !ACTIVE_STATUSES.has(text(row.order_status).toUpperCase())
        ? 0
        : remainingPairs;
      const warehousePlannedPairs = cancelled ? 0 : Math.min(remainingPairs, number(row.warehouse_planned_pairs));
      const cancelledPairs = cancelled ? orderedPairs : 0;

      if (!aliases.has(normalizedParty)) aliases.set(normalizedParty, new Map());
      const aliasMap = aliases.get(normalizedParty);
      aliasMap.set(row.customer_name, number(aliasMap.get(row.customer_name)) + 1);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          party_key: normalizedParty,
          party_name: row.customer_name || 'Unknown party',
          party_aliases: [],
          dealer_user_id: Number(row.dealer_user_id) || null,
          customer_phone: row.customer_phone || '',
          customer_address: row.customer_address || '',
          pan_number: row.pan_number || '',
          transport_names: new Set(),
          finished_good_id: Number(row.finished_good_id),
          product_name: row.product_name || '',
          article_code: row.article_code || '',
          series: row.sole_code || '',
          color: row.color || '',
          size: row.size || '',
          pairs_per_carton: number(row.pairs_per_carton) || 30,
          physical_stock_pairs: number(row.physical_stock),
          dealer_names: new Set(),
          dealer_emails: new Set(),
          dealer_allocations: new Map(),
          placed_pairs: 0,
          ordered_pairs: 0,
          delivered_pairs: 0,
          remaining_pairs: 0,
          reserved_pairs: 0,
          warehouse_planned_pairs: 0,
          cancelled_pairs: 0,
          out_of_stock_pairs: 0,
          order_ids: new Set(),
          orders: [],
        });
      }

      const group = groups.get(key);
      if (text(row.transport_name)) group.transport_names.add(row.transport_name);
      if (text(row.dealer_name)) group.dealer_names.add(row.dealer_name);
      if (text(row.dealer_email)) group.dealer_emails.add(row.dealer_email);
      const dealerAllocation = allocationByDealerProduct.get(
        `${Number(row.dealer_user_id)}:${Number(row.finished_good_id)}`
      );
      if (dealerAllocation && !group.dealer_allocations.has(Number(row.dealer_user_id))) {
        group.dealer_allocations.set(Number(row.dealer_user_id), {
          ...dealerAllocation,
          dealer_name: row.dealer_name || 'Unknown',
          dealer_email: row.dealer_email || '',
        });
      }
      group.placed_pairs += orderedPairs;
      group.ordered_pairs += cancelled ? 0 : orderedPairs;
      group.delivered_pairs += deliveredPairs;
      group.remaining_pairs += remainingPairs;
      group.reserved_pairs += reservedPairs;
      group.warehouse_planned_pairs += warehousePlannedPairs;
      group.cancelled_pairs += cancelledPairs;
      group.out_of_stock_pairs += number(row.out_of_stock_pairs);
      group.order_ids.add(Number(row.order_id));
      group.orders.push({
        order_id: Number(row.order_id),
        order_item_id: Number(row.order_item_id),
        status: text(row.order_status).toUpperCase(),
        placed_at: row.order_placed_at,
        dealer_name: row.dealer_name || 'Unknown',
        dealer_email: row.dealer_email || '',
        ordered_pairs: orderedPairs,
        delivered_pairs: deliveredPairs,
        remaining_pairs: remainingPairs,
        reserved_pairs: reservedPairs,
        warehouse_planned_pairs: warehousePlannedPairs,
        cancelled_pairs: cancelledPairs,
        out_of_stock_pairs: number(row.out_of_stock_pairs),
        delivery_note_numbers: row.delivery_note_numbers || row.master_delivery_note_number || '',
        cancel_reason: row.cancel_reason || '',
      });
    });

    const toQuantityFields = (record) => {
      const pairsPerCarton = number(record.pairs_per_carton) || 30;
      [
        'placed', 'ordered', 'delivered', 'remaining', 'reserved',
        'warehouse_planned', 'cancelled', 'out_of_stock', 'physical_stock',
        'allocated', 'allocation_used', 'allocation_available',
      ].forEach((field) => {
        record[`${field}_pairs`] = round(record[`${field}_pairs`]);
        record[`${field}_ctn`] = round(record[`${field}_pairs`] / pairsPerCarton);
      });
      return record;
    };

    const data = [...groups.values()].map((group) => {
      const aliasEntries = [...(aliases.get(group.party_key) || new Map()).entries()]
        .sort((a, b) => b[1] - a[1]);
      group.party_name = aliasEntries[0]?.[0] || group.party_name;
      group.party_aliases = aliasEntries.map(([name]) => name);
      group.transport_names = [...group.transport_names];
      group.dealer_names = [...group.dealer_names];
      group.dealer_emails = [...group.dealer_emails];
      group.dealer_allocations = [...group.dealer_allocations.values()];
      group.allocated_pairs = group.dealer_allocations.reduce(
        (sum, allocation) => sum + number(allocation.allocation_quantity), 0
      );
      group.allocation_used_pairs = group.dealer_allocations.reduce(
        (sum, allocation) => sum + number(allocation.used_quantity), 0
      );
      group.allocation_available_pairs = group.dealer_allocations.reduce(
        (sum, allocation) => sum + number(allocation.available_quantity), 0
      );
      group.order_count = group.order_ids.size;
      delete group.order_ids;
      group.orders = group.orders.map(toQuantityFields);
      return toQuantityFields(group);
    });

    const summary = data.reduce((total, row) => {
      total.parties.add(row.party_key);
      total.products.add(row.finished_good_id);
      total.orders += row.order_count;
      ['placed_pairs', 'ordered_pairs', 'delivered_pairs', 'remaining_pairs', 'reserved_pairs', 'warehouse_planned_pairs', 'cancelled_pairs', 'out_of_stock_pairs']
        .forEach((field) => { total[field] += number(row[field]); });
      return total;
    }, {
      parties: new Set(), products: new Set(), orders: 0,
      placed_pairs: 0, ordered_pairs: 0, delivered_pairs: 0,
      remaining_pairs: 0, reserved_pairs: 0, warehouse_planned_pairs: 0,
      cancelled_pairs: 0, out_of_stock_pairs: 0,
    });

    const filterRows = await run(
      `SELECT DISTINCT o.created_by AS dealer_user_id, dealer.name AS dealer_name,
              dealer.email AS dealer_email, o.customer_name,
              fg.sole_code AS series
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       LEFT JOIN users dealer ON dealer.id = o.created_by
       ORDER BY dealer.name, o.customer_name, fg.sole_code`
    );
    const dealerMap = new Map();
    const partyMap = new Map();
    const seriesSet = new Set();
    filterRows.forEach((row) => {
      const id = Number(row.dealer_user_id);
      if (id && !dealerMap.has(id)) dealerMap.set(id, {
        id, name: row.dealer_name || 'Unknown', email: row.dealer_email || '',
      });
      const key = partyKey(row.customer_name);
      if (key && !partyMap.has(key)) partyMap.set(key, row.customer_name);
      if (text(row.series)) seriesSet.add(row.series);
    });

    return res.json({
      success: true,
      data,
      summary: {
        ...summary,
        party_count: summary.parties.size,
        product_count: summary.products.size,
        parties: undefined,
        products: undefined,
      },
      filters: {
        dealers: [...dealerMap.values()],
        parties: [...partyMap.entries()].map(([key, name]) => ({ key, name })),
        series: [...seriesSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      },
      definitions: {
        ordered: 'Quantity on non-cancelled orders.',
        delivered: 'Quantity already deducted through warehouse delivery.',
        remaining: 'Ordered quantity that has not yet been delivered.',
        reserved: 'Undelivered quantity held by active Pending, Confirmed, or Packed orders.',
        warehouse_planned: 'Reserved quantity currently assigned to an active warehouse DN.',
        cancelled: 'Quantity from cancelled orders; excluded from ordered and reserved totals.',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPartyOrderReport };
