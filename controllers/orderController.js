const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn, hasTable } = require('../utils/schemaSupport');
const { appendFiscalInsertFields, getNepaliFiscalMeta } = require('../utils/nepaliFiscalYear');
const { clearCache } = require('../middleware/cacheMiddleware');
const paginationUtils = require('../utils/pagination');
const getPagePagination =
  paginationUtils.getPagePagination ||
  ((query = {}, { defaultPageSize = 50, maxPageSize = 200 } = {}) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(
      maxPageSize,
      Math.max(
        1,
        Number.parseInt(query.per_page ?? query.page_size, 10) ||
          defaultPageSize
      )
    );
    return {
      enabled:
        query.page !== undefined ||
        query.per_page !== undefined ||
        query.page_size !== undefined,
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
const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const {
  hasOfferCampaignSchema,
  getOfferCampaignUsage,
} = require('../utils/offerCampaigns');
const {
  getEffectiveOfferPrice,
  loadUserSeriesOfferAdjustments,
} = require('../utils/offerPricing');
const { getIndiaPriceFromNepalPrice } = require('../utils/priceConversion');
const {
  loadWarehousePrintGroupMap,
  resolveWarehousePrintGroup,
} = require('../utils/warehousePrintGroups');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];
const CANCELLATION_CODES = new Set([
  'DUPLICATE_ORDER',
  'CUSTOMER_CHANGED_MIND',
  'INCORRECT_PRODUCT_OR_QUANTITY',
  'INSUFFICIENT_STOCK',
  'PRICING_ISSUE',
  'DELIVERY_ISSUE',
  'OTHER',
]);
const WAREHOUSE_REMAINDER_ACTIONS = new Set([
  'DELIVER_LATER',
  'NOT_FOUND',
  'OUT_OF_STOCK',
  'FOUND_OTHER_WAREHOUSE',
]);
const DUPLICATE_ORDER_WINDOW_HOURS = Math.max(
  1,
  Math.min(168, Number.parseInt(process.env.DUPLICATE_ORDER_WINDOW_HOURS, 10) || 72)
);
const DEFAULT_DISPLAY_QUANTITY = 450;
const FISCAL_DELIVERY_NOTE_START_YEAR = 2083;
const ORDER_CORRECTION_CO_ADMINS = new Set([
  'suyogya shrestha',
  'suyogya shresth',
  'hirdaya shrestha',
]);
const ORDER_CORRECTION_CO_ADMIN_EMAILS = new Set([
  'kingarna@nepcha.com',
]);

const canCorrectOrders = (user = {}) =>
  String(user.role || '').toUpperCase() === 'CO_ADMIN' &&
  (ORDER_CORRECTION_CO_ADMINS.has(
    String(user.name || '').trim().replace(/\s+/g, ' ').toLowerCase()
  ) ||
    ORDER_CORRECTION_CO_ADMIN_EMAILS.has(
      String(user.email || '').trim().toLowerCase()
    ));

const canCorrectWarehouseSource = (user = {}) =>
  String(user.role || '').toUpperCase() === 'ADMIN' || canCorrectOrders(user);

const getWarehouseSlipNumber = (
  deliveryNoteNumber,
  printGroupCode,
  warehouseId
) => {
  const warehouseNumber = String(printGroupCode || '').match(
    /^WAREHOUSE_(\d+)$/
  )?.[1];
  const suffix = warehouseNumber || Number(warehouseId) || 'UNASSIGNED';

  return `${deliveryNoteNumber || 'DN-PENDING'}-W${suffix}`;
};

const getProductDisplayQuantity = (product) => {
  const value = Number(product?.display_quantity);

  if (!Number.isFinite(value) || value < 0) return DEFAULT_DISPLAY_QUANTITY;

  return Math.min(value, DEFAULT_DISPLAY_QUANTITY);
};

const getActor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const getOrderEntityName = (order = {}) =>
  order.delivery_note_number
    ? `${order.delivery_note_number} / ${order.customer_name || `Order #${order.id}`}`
    : `Order #${order.id}${order.customer_name ? ` / ${order.customer_name}` : ''}`;

// ─── BUILD IN CLAUSE (safe placeholder expansion) ──
const buildInClause = (values = []) => {
  if (!values.length) return { clause: '(-1)', params: [] };
  const placeholders = values.map(() => '?').join(',');
  return { clause: `(${placeholders})`, params: values };
};

// ─── NORMALIZE ITEMS ───────────────────────────────
const normalizeItems = (items = []) =>
  items
    .map((item) => ({
      finished_good_id: Number(item.finished_good_id),
      qty_ordered: Number(item.qty_ordered),
    }))
    .filter((item) => item.finished_good_id > 0 && item.qty_ordered > 0);

const normalizeCustomerName = (value) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizeCustomerKey = (value) =>
  normalizeCustomerName(value).replace(/[\s._-]+/g, '');

const customerKeySql = (column = 'o.customer_name') =>
  `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${column}), ' ', ''), '-', ''), '_', ''), '.', ''))`;

const normalizeCustomerPhone = (value) =>
  String(value || '').replace(/\D/g, '');

const isMeaningfulPhone = (value) => {
  const phone = normalizeCustomerPhone(value);
  return phone.length >= 7 && !/^0+$/.test(phone);
};

const getOrderItemSignature = (items = []) => {
  const totals = new Map();
  items.forEach((item) => {
    const productId = Number(item.finished_good_id);
    const quantity = Number(item.qty_ordered);
    if (productId > 0 && quantity > 0) {
      totals.set(productId, (totals.get(productId) || 0) + quantity);
    }
  });

  return [...totals.entries()]
    .sort(([left], [right]) => left - right)
    .map(([productId, quantity]) => `${productId}:${quantity}`)
    .join('|');
};

const findRecentExactDuplicateOrders = async (
  client,
  { createdBy, customerName, customerPhone, items }
) => {
  const cutoff = new Date(
    Date.now() - DUPLICATE_ORDER_WINDOW_HOURS * 60 * 60 * 1000
  );
  const candidateResult = await client.query(
    `SELECT o.id, o.customer_name, o.customer_phone, o.status, o.created_at,
            u.name AS created_by_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.status <> 'CANCELLED'
       AND o.created_at >= ?
       AND (
         o.created_by = ?
         OR LOWER(TRIM(o.customer_name)) = ?
       )
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [cutoff, createdBy, normalizeCustomerName(customerName)]
  );

  const normalizedName = normalizeCustomerName(customerName);
  const normalizedPhone = normalizeCustomerPhone(customerPhone);
  const matchingCustomers = candidateResult.rows.filter((candidate) => {
    const sameName =
      normalizeCustomerName(candidate.customer_name) === normalizedName;
    const samePhone =
      isMeaningfulPhone(normalizedPhone) &&
      normalizeCustomerPhone(candidate.customer_phone) === normalizedPhone;
    return sameName || samePhone;
  });

  if (!matchingCustomers.length) return [];

  const { clause, params } = buildInClause(
    matchingCustomers.map((candidate) => candidate.id)
  );
  const itemResult = await client.query(
    `SELECT order_id, finished_good_id, qty_ordered
     FROM order_items
     WHERE order_id IN ${clause}
     ORDER BY order_id, finished_good_id`,
    params
  );
  const itemsByOrder = new Map();
  itemResult.rows.forEach((item) => {
    const orderId = Number(item.order_id);
    const rows = itemsByOrder.get(orderId) || [];
    rows.push(item);
    itemsByOrder.set(orderId, rows);
  });

  const requestedSignature = getOrderItemSignature(items);
  return matchingCustomers
    .filter(
      (candidate) =>
        getOrderItemSignature(itemsByOrder.get(Number(candidate.id)) || []) ===
        requestedSignature
    )
    .slice(0, 3)
    .map((candidate) => ({
      id: Number(candidate.id),
      customer_name: candidate.customer_name,
      status: candidate.status,
      created_at: candidate.created_at,
      created_by_name: candidate.created_by_name || null,
    }));
};

const isActiveOfferProduct = (product = {}) =>
  Number(product.offer_enabled) === 1 &&
  (!product.offer_ends_at || new Date(product.offer_ends_at).getTime() >= Date.now());

const shouldUseFiscalDeliveryNotes = (date = new Date()) => {
  const fiscalStartYear = Number(getNepaliFiscalMeta(date).bs_fiscal_year.split('/')[0]);
  return fiscalStartYear >= FISCAL_DELIVERY_NOTE_START_YEAR;
};

const getNextLegacyDeliveryNoteNumber = async (client) => {
  const lastDnRes = await client.query(
    `SELECT delivery_note_number
     FROM orders
     WHERE delivery_note_number REGEXP '^DN-[0-9]+$'
     ORDER BY CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED) DESC
     LIMIT 1
     FOR UPDATE`
  );
  const lastDnNumber = Number(
    String(lastDnRes.rows[0]?.delivery_note_number || '').replace('DN-', '')
  );

  return `DN-${(lastDnNumber || 1940) + 1}`;
};

const getNextFiscalDeliveryNoteNumber = async (client, date = new Date()) => {
  const fiscalYear = getNepaliFiscalMeta(date).bs_fiscal_year;
  const supportsFiscalYear = await hasColumn('orders', 'bs_fiscal_year');

  if (!supportsFiscalYear) {
    return getNextLegacyDeliveryNoteNumber(client);
  }

  const lastDnRes = await client.query(
    `SELECT delivery_note_number
     FROM orders
     WHERE bs_fiscal_year = ?
       AND delivery_note_number REGEXP '^DN-[0-9]+$'
     ORDER BY CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED) DESC
     LIMIT 1
     FOR UPDATE`,
    [fiscalYear]
  );
  const lastNumber = Number(
    String(lastDnRes.rows[0]?.delivery_note_number || '').replace('DN-', '')
  );
  const nextNumber = String((Number.isFinite(lastNumber) ? lastNumber : 0) + 1).padStart(4, '0');

  return `DN-${nextNumber}`;
};

const getNextSequencedDeliveryNoteNumber = async (client, date = new Date()) => {
  const fiscalYear = getNepaliFiscalMeta(date).bs_fiscal_year;
  const supportsOrderFiscalYear = await hasColumn('orders', 'bs_fiscal_year');
  const sequenceKey = supportsOrderFiscalYear
    ? `FY:${fiscalYear}`
    : 'GLOBAL';
  const orderResult = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED)), 0) AS last_number
     FROM orders
     WHERE delivery_note_number REGEXP '^DN-[0-9]+$'
       ${supportsOrderFiscalYear ? 'AND bs_fiscal_year = ?' : ''}`,
    supportsOrderFiscalYear ? [fiscalYear] : []
  );
  const warehouseResult = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED)), 0) AS last_number
     FROM order_warehouse_delivery_notes
     WHERE delivery_note_number REGEXP '^DN-[0-9]+$'
       ${supportsOrderFiscalYear ? 'AND bs_fiscal_year = ?' : ''}`,
    supportsOrderFiscalYear ? [fiscalYear] : []
  );
  const existingMaximum = Math.max(
    Number(orderResult.rows[0]?.last_number || 0),
    Number(warehouseResult.rows[0]?.last_number || 0)
  );

  await client.query(
    `INSERT INTO delivery_note_sequences (sequence_key, last_number)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       last_number = GREATEST(last_number, VALUES(last_number))`,
    [sequenceKey, existingMaximum]
  );
  const sequenceResult = await client.query(
    `SELECT last_number
     FROM delivery_note_sequences
     WHERE sequence_key = ?
     FOR UPDATE`,
    [sequenceKey]
  );
  const nextNumber = Number(sequenceResult.rows[0]?.last_number || 0) + 1;
  await client.query(
    `UPDATE delivery_note_sequences
     SET last_number = ?
     WHERE sequence_key = ?`,
    [nextNumber, sequenceKey]
  );

  return `DN-${String(nextNumber).padStart(4, '0')}`;
};

const getNextDeliveryNoteNumber = async (client, date = new Date()) =>
  (await hasTable('delivery_note_sequences')) &&
  (await hasTable('order_warehouse_delivery_notes'))
    ? getNextSequencedDeliveryNoteNumber(client, date)
    : shouldUseFiscalDeliveryNotes(date)
      ? getNextFiscalDeliveryNoteNumber(client, date)
      : getNextLegacyDeliveryNoteNumber(client);

const getDeliveryNoteReclaimDecision = async (client, order) => {
  const deliveryNoteNumber = String(order.delivery_note_number || '').trim();
  if (!/^DN-\d+$/.test(deliveryNoteNumber)) {
    return {
      reclaim: false,
      reason: deliveryNoteNumber
        ? 'The delivery-note format is not eligible for automatic reuse.'
        : 'This order has no delivery-note number to reclaim.',
    };
  }

  const supportsPermanentPrintState =
    Object.prototype.hasOwnProperty.call(order, 'delivery_note_printed_at') &&
    Object.prototype.hasOwnProperty.call(order, 'delivery_note_print_count');
  if (!supportsPermanentPrintState) {
    return {
      reclaim: false,
      reason:
        'Safe DN reuse requires sql/add-delivery-note-print-state.sql.',
    };
  }

  if (
    Number(order.delivery_note_print_count || 0) > 0 ||
    order.delivery_note_printed_at
  ) {
    return {
      reclaim: false,
      reason: 'The delivery note has already been printed.',
    };
  }

  const historyResult = await client.query(
    `SELECT action
     FROM audit_logs
     WHERE record_id = ?
       AND table_name IN ('order', 'orders')
       AND UPPER(action) IN ('PREPARED', 'PRINTED', 'PACKED', 'DELIVERED')
     LIMIT 1`,
    [order.id]
  );
  if (historyResult.rows.length) {
    const action = String(historyResult.rows[0].action || '').toUpperCase();
    return {
      reclaim: false,
      reason:
        action === 'PRINTED'
          ? 'The delivery note has already been printed.'
          : action === 'PREPARED'
            ? 'Warehouse delivery slips have already been prepared.'
            : `The order has previously reached ${action.toLowerCase()} status.`,
    };
  }

  const orderDate = order.created_at ? new Date(order.created_at) : new Date();
  const supportsFiscalYear = Object.prototype.hasOwnProperty.call(
    order,
    'bs_fiscal_year'
  );
  const fiscalYear =
    shouldUseFiscalDeliveryNotes(orderDate) && supportsFiscalYear
      ? order.bs_fiscal_year || getNepaliFiscalMeta(orderDate).bs_fiscal_year
      : null;
  const latestResult = await client.query(
    `SELECT id, delivery_note_number
     FROM orders
     WHERE delivery_note_number REGEXP '^DN-[0-9]+$'
       ${fiscalYear ? 'AND bs_fiscal_year = ?' : ''}
     ORDER BY CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED) DESC
     LIMIT 1
     FOR UPDATE`,
    fiscalYear ? [fiscalYear] : []
  );
  const latest = latestResult.rows[0];
  if (
    !latest ||
    Number(latest.id) !== Number(order.id) ||
    String(latest.delivery_note_number) !== deliveryNoteNumber
  ) {
    return {
      reclaim: false,
      reason: 'A newer delivery-note number already exists.',
    };
  }

  return { reclaim: true, reason: 'Latest unused delivery note reclaimed.' };
};

// ─── RESERVED STOCK ───────────────────────────────
const getReservedByProduct = async (executor, productIds = []) => {
  if (!productIds.length) return new Map();

  const supportsWarehouseDelivery = await hasColumn(
    'order_item_warehouse_allocations',
    'allocation_status'
  );

  const { clause: statusClause, params: statusParams } =
    buildInClause(ACTIVE_RESERVATION_STATUSES);
  const { clause: productClause, params: productParams } =
    buildInClause(productIds);

  const result = await executor(
    `SELECT oi.finished_good_id,
            COALESCE(SUM(${
              supportsWarehouseDelivery
                ? `GREATEST(
                    0,
                    oi.qty_ordered - COALESCE((
                      SELECT SUM(delivered_allocation.quantity)
                      FROM order_item_warehouse_allocations delivered_allocation
                      WHERE delivered_allocation.order_item_id = oi.id
                        AND delivered_allocation.allocation_status = 'DEDUCTED'
                    ), 0)
                  )`
                : 'oi.qty_ordered'
            }), 0) AS reserved_qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ${statusClause}
       AND oi.finished_good_id IN ${productClause}
     GROUP BY oi.finished_good_id`,
    [...statusParams, ...productParams]
  );

  return new Map(
    result.rows.map((r) => [Number(r.finished_good_id), Number(r.reserved_qty)])
  );
};

const getWarehouseAllocationCapabilities = async () => {
  const [
    supportsPlanning,
    supportsPackedQuantity,
    supportsGroupCode,
    supportsGroupName,
    supportsConfiguredGroups,
    supportsDeliveredBy,
    supportsDeliveredAt,
    supportsVerificationStatus,
    supportsVerifiedQuantity,
    supportsVerificationNote,
    supportsVerifiedBy,
    supportsVerifiedAt,
  ] = await Promise.all([
    hasColumn('order_item_warehouse_allocations', 'allocation_status'),
    hasColumn('order_item_warehouse_allocations', 'packed_quantity'),
    hasColumn(
      'order_item_warehouse_allocations',
      'print_group_code_snapshot'
    ),
    hasColumn(
      'order_item_warehouse_allocations',
      'print_group_name_snapshot'
    ),
    Promise.all([
      hasTable('warehouse_print_groups'),
      hasTable('warehouse_print_group_members'),
    ]).then((values) => values.every(Boolean)),
    hasColumn('order_item_warehouse_allocations', 'delivered_by'),
    hasColumn('order_item_warehouse_allocations', 'delivered_at'),
    hasColumn('order_item_warehouse_allocations', 'verification_status'),
    hasColumn('order_item_warehouse_allocations', 'verified_quantity'),
    hasColumn('order_item_warehouse_allocations', 'verification_note'),
    hasColumn('order_item_warehouse_allocations', 'verified_by'),
    hasColumn('order_item_warehouse_allocations', 'verified_at'),
  ]);

  return {
    supportsPlanning,
    supportsPackedQuantity,
    supportsGroupCode,
    supportsGroupName,
    supportsConfiguredGroups,
    supportsDeliveredBy,
    supportsDeliveredAt,
    supportsVerification:
      supportsVerificationStatus &&
      supportsVerifiedQuantity &&
      supportsVerificationNote &&
      supportsVerifiedBy &&
      supportsVerifiedAt,
  };
};

const buildWarehouseFulfillments = (
  order,
  items = [],
  configuredGroups = new Map(),
  warehouseDeliveryNotes = []
) => {
  const groups = new Map();

  warehouseDeliveryNotes.forEach((note) => {
    const warehouseId = Number(note.warehouse_id);
    const printGroup = resolveWarehousePrintGroup(
      warehouseId,
      note.warehouse_name,
      configuredGroups
    );
    groups.set(`warehouse:${warehouseId}`, {
      code: printGroup.code,
      name: note.warehouse_name || printGroup.name,
      display_order: Number(printGroup.display_order || 999),
      warehouse_id: warehouseId,
      delivery_note_number: note.delivery_note_number,
      delivery_note_status: String(note.status || 'ACTIVE').toUpperCase(),
      reassigned_to_delivery_note_numbers: String(
        note.reassigned_to_delivery_note_numbers || ''
      )
        .split(',')
        .map((number) => number.trim())
        .filter(Boolean),
      pairs: 0,
      cartons: 0,
      delivered_pairs: 0,
      pending_pairs: 0,
      out_of_stock_pairs: 0,
      items: [],
      allocation_statuses: [],
      fully_packed: true,
      delivered_by_name: null,
      delivered_at: null,
    });
  });

  items.forEach((item) => {
    (item.warehouse_allocations || []).forEach((allocation) => {
      const printGroup = resolveWarehousePrintGroup(
        allocation.warehouse_id,
        allocation.warehouse_name,
        configuredGroups
      );
      const groupKey = `warehouse:${Number(allocation.warehouse_id)}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          code: printGroup.code,
          name: printGroup.name,
          display_order: Number(printGroup.display_order || 999),
          warehouse_id: Number(allocation.warehouse_id) || null,
          delivery_note_number: null,
          delivery_note_status: 'ACTIVE',
          reassigned_to_delivery_note_numbers: [],
          pairs: 0,
          cartons: 0,
          delivered_pairs: 0,
          pending_pairs: 0,
          out_of_stock_pairs: 0,
          items: [],
          allocation_statuses: [],
          fully_packed: true,
          delivered_by_name: allocation.delivered_by_name || null,
          delivered_at: allocation.delivered_at || null,
        });
      }

      const group = groups.get(groupKey);
      const quantity = Number(allocation.quantity || 0);
      const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);
      const allocationStatus = String(
        allocation.allocation_status || 'DEDUCTED'
      ).toUpperCase();

      // The printable/deliverable quantity is made up only of planned and
      // delivered allocations. OUT_OF_STOCK rows are retained below for the
      // audit trail and shortage status, but must not inflate a warehouse DN.
      const countsTowardDeliveryNote = ['PLANNED', 'DEDUCTED'].includes(
        allocationStatus
      );
      if (countsTowardDeliveryNote) {
        group.pairs += quantity;
        group.cartons += pairsPerCarton > 0 ? quantity / pairsPerCarton : 0;
      }
      if (allocationStatus === 'DEDUCTED') {
        group.delivered_pairs += quantity;
      } else if (allocationStatus === 'PLANNED') {
        group.pending_pairs += quantity;
      } else if (allocationStatus === 'OUT_OF_STOCK') {
        group.out_of_stock_pairs += quantity;
      }
      group.items.push({
        allocation_id: Number(allocation.id),
        order_item_id: Number(item.id),
        finished_good_id: Number(item.finished_good_id),
        product_name: item.product_name,
        article_code: item.article_code || null,
        color: item.color || null,
        size: item.size || null,
        unit: item.unit || 'pairs',
        pairs_per_carton: pairsPerCarton,
        quantity,
        allocation_status: allocationStatus,
        verification_status: allocation.verification_status || null,
        verified_quantity:
          allocation.verified_quantity === null ||
          allocation.verified_quantity === undefined
            ? null
            : Number(allocation.verified_quantity),
        verification_note: allocation.verification_note || null,
        verified_at: allocation.verified_at || null,
      });
      group.allocation_statuses.push(allocationStatus);
      if (countsTowardDeliveryNote) {
        group.fully_packed =
          group.fully_packed &&
          (allocationStatus === 'DEDUCTED' ||
            Number(allocation.packed_quantity || 0) + 0.001 >= quantity);
      }
      if (allocation.delivered_by_name) {
        group.delivered_by_name = allocation.delivered_by_name;
      }
      if (
        allocation.delivered_at &&
        (!group.delivered_at ||
          new Date(allocation.delivered_at) > new Date(group.delivered_at))
      ) {
        group.delivered_at = allocation.delivered_at;
      }
    });
  });

  const fulfillments = [...groups.values()]
    .sort((left, right) => left.display_order - right.display_order)
    .map((group) => {
      const inactive = ['VOID', 'REASSIGNED'].includes(
        group.delivery_note_status
      );
      const delivered = !inactive && group.allocation_statuses.length > 0 && group.allocation_statuses.every(
        (status) => status === 'DEDUCTED'
      );
      const hasOutOfStock = group.allocation_statuses.some(
        (status) => status === 'OUT_OF_STOCK'
      );
      const allOutOfStock =
        group.allocation_statuses.length > 0 &&
        group.allocation_statuses.every((status) => status === 'OUT_OF_STOCK');
      const deliveredWithShortage =
        !inactive &&
        hasOutOfStock &&
        group.allocation_statuses.some((status) => status === 'DEDUCTED') &&
        !group.allocation_statuses.some((status) => status === 'PLANNED');
      const partiallyDelivered =
        !delivered &&
        !deliveredWithShortage &&
        group.allocation_statuses.some((status) => status === 'DEDUCTED');

      return {
        code: group.code,
        name: group.name,
        display_order: group.display_order,
        warehouse_id: group.warehouse_id,
        delivery_note_number: group.delivery_note_number || null,
        warehouse_slip_number:
          group.delivery_note_number ||
          getWarehouseSlipNumber(
            order.delivery_note_number,
            group.code,
            group.warehouse_id
          ),
        status: inactive
          ? group.delivery_note_status
          : allOutOfStock
            ? 'OUT OF STOCK'
          : deliveredWithShortage
            ? 'DELIVERED WITH SHORTAGE'
          : delivered
          ? 'DELIVERED'
          : partiallyDelivered
            ? 'PARTIALLY DELIVERED'
          : group.allocation_statuses.length === 0
            ? 'PLANNED'
          : group.fully_packed
            ? 'PACKED'
            : 'PLANNED',
        pairs: group.pairs,
        cartons: group.cartons,
        delivered_pairs: group.delivered_pairs,
        pending_pairs: group.pending_pairs,
        out_of_stock_pairs: group.out_of_stock_pairs,
        reassigned_to_delivery_note_numbers:
          group.reassigned_to_delivery_note_numbers || [],
        items: group.items,
        delivered_by_name:
          delivered || deliveredWithShortage ? group.delivered_by_name : null,
        delivered_at:
          delivered || deliveredWithShortage ? group.delivered_at : null,
      };
    });

  const completedCount = fulfillments.filter(
    (fulfillment) =>
      ['DELIVERED', 'DELIVERED WITH SHORTAGE', 'OUT OF STOCK'].includes(
        fulfillment.status
      )
  ).length;
  const activeFulfillments = fulfillments.filter(
    (fulfillment) => !['VOID', 'REASSIGNED'].includes(fulfillment.status)
  );
  const hasPartialDelivery = fulfillments.some(
    (fulfillment) =>
      fulfillment.status === 'PARTIALLY DELIVERED' ||
      Number(fulfillment.delivered_pairs || 0) > 0
  );
  const fulfillmentStatus =
    activeFulfillments.length > 0 && completedCount === activeFulfillments.length
      ? 'DELIVERED'
      : completedCount > 0 || hasPartialDelivery
        ? 'PARTIALLY DELIVERED'
        : String(order.status || '').toUpperCase();

  return {
    fulfillments,
    fulfillmentStatus,
    deliveredCount: completedCount,
    totalCount: activeFulfillments.length,
  };
};

const insertWarehouseAllocation = async (
  client,
  {
    item,
    warehouse,
    quantity,
    userId,
    status,
    packedQuantity = 0,
    printGroup,
    capabilities,
  }
) => {
  const columns = [
    'order_item_id',
    'finished_good_id',
    'warehouse_id',
    'quantity',
    'created_by',
  ];
  const values = [
    item.id,
    item.finished_good_id,
    warehouse.warehouse_id ?? warehouse.id,
    quantity,
    userId,
  ];

  if (capabilities.supportsPlanning) {
    columns.push('allocation_status');
    values.push(status);
  }
  if (capabilities.supportsPackedQuantity) {
    columns.push('packed_quantity');
    values.push(packedQuantity);
  }
  if (capabilities.supportsGroupCode) {
    columns.push('print_group_code_snapshot');
    values.push(printGroup.code);
  }
  if (capabilities.supportsGroupName) {
    columns.push('print_group_name_snapshot');
    values.push(printGroup.name);
  }

  const allocationInsert = await appendFiscalInsertFields(
    'order_item_warehouse_allocations',
    columns,
    values
  );
  await client.query(
    `INSERT INTO order_item_warehouse_allocations (${allocationInsert.columns.join(', ')})
     VALUES (${allocationInsert.columns.map(() => '?').join(', ')})`,
    allocationInsert.values
  );
};

const recordWarehouseMovement = async (
  client,
  {
    finishedGoodId,
    warehouseId,
    quantity,
    movementType,
    referenceType,
    referenceId,
    notes,
    userId,
  }
) => {
  const movementInsert = await appendFiscalInsertFields(
    'finished_good_warehouse_movements',
    [
      'finished_good_id',
      'warehouse_id',
      'quantity',
      'movement_type',
      'reference_type',
      'reference_id',
      'notes',
      'created_by',
    ],
    [
      finishedGoodId,
      warehouseId,
      quantity,
      movementType,
      referenceType,
      referenceId,
      notes,
      userId,
    ]
  );

  await client.query(
    `INSERT INTO finished_good_warehouse_movements (${movementInsert.columns.join(', ')})
     VALUES (${movementInsert.columns.map(() => '?').join(', ')})`,
    movementInsert.values
  );
};

const recordWarehouseOrderMovement = async (
  client,
  { item, warehouseId, quantity, userId, notes }
) =>
  recordWarehouseMovement(client, {
    finishedGoodId: item.finished_good_id,
    warehouseId,
    quantity,
    movementType: 'ORDER_OUT',
    referenceType: 'order',
    referenceId: item.order_id,
    notes: notes || `Delivered order #${item.order_id}`,
    userId,
  });

const releasePlannedWarehouseAllocations = async (client, orderId, remove = false) => {
  const capabilities = await getWarehouseAllocationCapabilities();
  if (!capabilities.supportsPlanning) return;

  if (remove) {
    await client.query(
      `DELETE allocation
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       WHERE item.order_id = ?
         AND allocation.allocation_status IN ('PLANNED', 'RELEASED')`,
      [orderId]
    );
    return;
  }

  await client.query(
    `UPDATE order_item_warehouse_allocations allocation
     JOIN order_items item ON item.id = allocation.order_item_id
     SET allocation.allocation_status = 'RELEASED'
     WHERE item.order_id = ?
       AND allocation.allocation_status = 'PLANNED'`,
    [orderId]
  );
};

const buildCartonSafeWarehousePlan = ({
  stocks = [],
  quantity = 0,
  pairsPerCarton = 0,
  productName = 'product',
}) => {
  const requestedQuantity = Math.max(0, Number(quantity || 0));
  const cartonSize = Math.max(0, Number(pairsPerCarton || 0));
  const candidates = stocks.map((stock, index) => ({
    stock,
    index,
    available: Math.max(
      0,
      Number(stock.available_quantity ?? stock.quantity ?? 0)
    ),
    allocated: 0,
  }));
  const totalAvailable = candidates.reduce(
    (sum, candidate) => sum + candidate.available,
    0
  );

  if (totalAvailable + 0.001 < requestedQuantity) {
    const error = new Error(
      `Not enough unallocated warehouse stock for ${productName}.`
    );
    error.statusCode = 422;
    error.shortage = {
      product_name: productName,
      ordered_qty: requestedQuantity,
      warehouse_stock: totalAvailable,
    };
    throw error;
  }

  const allocateFromCandidates = (orderedCandidates, targetQuantity) => {
    let remainingQuantity = targetQuantity;
    for (const candidate of orderedCandidates) {
      if (remainingQuantity <= 0.001) break;
      const unusedQuantity = Math.max(
        0,
        candidate.available - candidate.allocated
      );
      const allocatedQuantity = Math.min(unusedQuantity, remainingQuantity);
      if (allocatedQuantity <= 0.001) continue;
      candidate.allocated += allocatedQuantity;
      remainingQuantity -= allocatedQuantity;
    }
    return remainingQuantity;
  };

  if (cartonSize <= 0.001) {
    allocateFromCandidates(candidates, requestedQuantity);
    return candidates
      .filter((candidate) => candidate.allocated > 0.001)
      .map((candidate) => ({
        stock: candidate.stock,
        quantity: candidate.allocated,
      }));
  }

  const completeCartons = Math.floor(
    (requestedQuantity + 0.001) / cartonSize
  );
  const completeCartonQuantity = completeCartons * cartonSize;
  const looseQuantity = Math.max(
    0,
    requestedQuantity - completeCartonQuantity
  );
  const completeCartonCapacity = candidates.reduce(
    (sum, candidate) =>
      sum + Math.floor((candidate.available + 0.001) / cartonSize) * cartonSize,
    0
  );

  if (completeCartonCapacity + 0.001 < completeCartonQuantity) {
    const error = new Error(
      `Stock fragmented across warehouses for ${productName}. A complete carton contains ${cartonSize} pairs. Transfer stock to one warehouse or correct the warehouse stock before preparing the DN.`
    );
    error.statusCode = 422;
    error.shortage = {
      reason: 'FRAGMENTED_WAREHOUSE_STOCK',
      product_name: productName,
      ordered_qty: requestedQuantity,
      warehouse_stock: totalAvailable,
      pairs_per_carton: cartonSize,
      complete_cartons_required: completeCartons,
      complete_cartons_available: Math.floor(
        completeCartonCapacity / cartonSize
      ),
    };
    throw error;
  }

  if (completeCartonQuantity > 0.001) {
    const singleWarehouse = candidates.find(
      (candidate) =>
        Math.floor((candidate.available + 0.001) / cartonSize) * cartonSize +
          0.001 >=
        completeCartonQuantity
    );

    if (singleWarehouse) {
      singleWarehouse.allocated += completeCartonQuantity;
    } else {
      let remainingCompleteQuantity = completeCartonQuantity;
      const cartonCandidates = [...candidates].sort((left, right) => {
        const leftCapacity =
          Math.floor((left.available + 0.001) / cartonSize) * cartonSize;
        const rightCapacity =
          Math.floor((right.available + 0.001) / cartonSize) * cartonSize;
        return rightCapacity - leftCapacity || left.index - right.index;
      });
      for (const candidate of cartonCandidates) {
        if (remainingCompleteQuantity <= 0.001) break;
        const cartonCapacity =
          Math.floor((candidate.available + 0.001) / cartonSize) * cartonSize;
        const allocatedQuantity = Math.min(
          cartonCapacity,
          remainingCompleteQuantity
        );
        if (allocatedQuantity <= 0.001) continue;
        candidate.allocated += allocatedQuantity;
        remainingCompleteQuantity -= allocatedQuantity;
      }
    }
  }

  if (looseQuantity > 0.001) {
    const looseCandidates = [...candidates].sort((left, right) => {
      const leftUsed = left.allocated > 0.001 ? 0 : 1;
      const rightUsed = right.allocated > 0.001 ? 0 : 1;
      return leftUsed - rightUsed || left.index - right.index;
    });
    const looseRemaining = allocateFromCandidates(
      looseCandidates,
      looseQuantity
    );
    if (looseRemaining > 0.001) {
      const error = new Error(
        `Not enough warehouse stock to allocate the loose pairs for ${productName}.`
      );
      error.statusCode = 422;
      error.shortage = {
        product_name: productName,
        ordered_qty: requestedQuantity,
        warehouse_stock: totalAvailable,
      };
      throw error;
    }
  }

  return candidates
    .filter((candidate) => candidate.allocated > 0.001)
    .map((candidate) => ({
      stock: candidate.stock,
      quantity: candidate.allocated,
    }));
};

const ensurePlannedWarehouseAllocations = async (client, orderId, userId) => {
  const capabilities = await getWarehouseAllocationCapabilities();
  if (!capabilities.supportsPlanning) {
    const error = new Error(
      'Grouped warehouse delivery notes require sql/add-warehouse-delivery-note-groups.sql.'
    );
    error.statusCode = 409;
    throw error;
  }

  const itemsResult = await client.query(
    `SELECT item.id, item.order_id, item.finished_good_id, item.qty_ordered,
            product.name AS product_name,
            product.inner_boxes_per_outer_box
     FROM order_items item
     JOIN finished_goods product ON product.id = item.finished_good_id
     WHERE item.order_id = ?
     ORDER BY item.id`,
    [orderId]
  );

  if (!itemsResult.rows.length) {
    const error = new Error('This order has no items to allocate.');
    error.statusCode = 422;
    throw error;
  }

  const itemIds = itemsResult.rows.map((item) => Number(item.id));
  const { clause: itemClause, params: itemParams } = buildInClause(itemIds);
  const existingResult = await client.query(
    `SELECT order_item_id,
            COALESCE(SUM(CASE WHEN allocation_status = 'PLANNED' THEN quantity ELSE 0 END), 0) AS planned_quantity,
            COALESCE(SUM(CASE WHEN allocation_status = 'DEDUCTED' THEN quantity ELSE 0 END), 0) AS delivered_quantity
     FROM order_item_warehouse_allocations
     WHERE order_item_id IN ${itemClause}
       AND allocation_status IN ('PLANNED', 'DEDUCTED')
     GROUP BY order_item_id`,
    itemParams
  );
  const existingByItem = new Map(
    existingResult.rows.map((row) => [
      Number(row.order_item_id),
      {
        planned: Number(row.planned_quantity || 0),
        delivered: Number(row.delivered_quantity || 0),
      },
    ])
  );
  const hasCompletePlan = itemsResult.rows.every(
    (item) =>
      Math.abs(
        Number(item.qty_ordered || 0) -
          (Number(existingByItem.get(Number(item.id))?.planned || 0) +
            Number(existingByItem.get(Number(item.id))?.delivered || 0))
      ) < 0.001
  );

  if (hasCompletePlan) return;

  await releasePlannedWarehouseAllocations(client, orderId, true);

  const configuredGroups = await loadWarehousePrintGroupMap(
    client,
    capabilities.supportsConfiguredGroups
  );

  for (const item of itemsResult.rows) {
    const deliveredQuantity = Number(
      existingByItem.get(Number(item.id))?.delivered || 0
    );
    let remaining = Math.max(
      0,
      Number(item.qty_ordered || 0) - deliveredQuantity
    );
    if (remaining <= 0.001) continue;

    const stockResult = await client.query(
      `SELECT stock.id, stock.warehouse_id, stock.quantity,
              stock.updated_at, warehouse.name AS warehouse_name
       FROM finished_good_warehouse_stock stock
       JOIN warehouses warehouse ON warehouse.id = stock.warehouse_id
       WHERE stock.finished_good_id = ?
         AND stock.quantity > 0
       ORDER BY stock.updated_at ASC, stock.id ASC
       FOR UPDATE`,
      [item.finished_good_id]
    );

    const plannedResult = await client.query(
      `SELECT allocation.warehouse_id,
              COALESCE(SUM(allocation.quantity), 0) AS planned_quantity
       FROM order_item_warehouse_allocations allocation
       JOIN order_items other_item ON other_item.id = allocation.order_item_id
       JOIN orders other_order ON other_order.id = other_item.order_id
       WHERE allocation.finished_good_id = ?
         AND allocation.allocation_status = 'PLANNED'
         AND other_order.status IN ('PENDING', 'CONFIRMED', 'PACKED')
         AND other_order.id <> ?
       GROUP BY allocation.warehouse_id`,
      [item.finished_good_id, orderId]
    );
    const plannedByWarehouse = new Map(
      plannedResult.rows.map((row) => [
        Number(row.warehouse_id),
        Number(row.planned_quantity || 0),
      ])
    );

    const stockPlan = buildCartonSafeWarehousePlan({
      stocks: stockResult.rows.map((stock) => ({
        ...stock,
        available_quantity: Math.max(
          0,
          Number(stock.quantity || 0) -
            Number(plannedByWarehouse.get(Number(stock.warehouse_id)) || 0)
        ),
      })),
      quantity: remaining,
      pairsPerCarton: item.inner_boxes_per_outer_box,
      productName: item.product_name,
    });

    for (const plannedStock of stockPlan) {
      const stock = plannedStock.stock;
      const allocatedQuantity = plannedStock.quantity;
      const printGroup = resolveWarehousePrintGroup(
        stock.warehouse_id,
        stock.warehouse_name,
        configuredGroups
      );
      await insertWarehouseAllocation(client, {
        item,
        warehouse: stock,
        quantity: allocatedQuantity,
        userId,
        status: 'PLANNED',
        packedQuantity: 0,
        printGroup,
        capabilities,
      });
      remaining -= allocatedQuantity;
    }
  }
};

const loadWarehouseDeliveryNotes = async (client, orderIds = []) => {
  if (
    !orderIds.length ||
    !(await hasTable('order_warehouse_delivery_notes'))
  ) {
    return [];
  }
  const { clause, params } = buildInClause(orderIds.map(Number));
  const supportsReassignment = await hasTable(
    'order_warehouse_dn_reassignments'
  );
  const result = await client.query(
    `SELECT note.*, warehouse.name AS warehouse_name${
      supportsReassignment
        ? `, GROUP_CONCAT(DISTINCT destination.delivery_note_number
             ORDER BY destination.id SEPARATOR ', ') AS reassigned_to_delivery_note_numbers`
        : ''
    }
     FROM order_warehouse_delivery_notes note
     JOIN warehouses warehouse ON warehouse.id = note.warehouse_id
     ${
       supportsReassignment
         ? `LEFT JOIN order_warehouse_dn_reassignments reassignment
              ON reassignment.source_delivery_note_id = note.id
            LEFT JOIN order_warehouse_delivery_notes destination
              ON destination.id = reassignment.destination_delivery_note_id`
         : ''
     }
     WHERE note.order_id IN ${clause}
     ${supportsReassignment ? 'GROUP BY note.id, warehouse.name' : ''}
     ORDER BY note.assigned_at, note.id`,
    params
  );
  return result.rows;
};

const ensureWarehouseDeliveryNotes = async (client, order, userId) => {
  if (
    order.delivery_note_number ||
    !(await hasTable('order_warehouse_delivery_notes')) ||
    !(await hasTable('delivery_note_sequences'))
  ) {
    return [];
  }
  const supportsReassignment = await hasTable(
    'order_warehouse_dn_reassignments'
  );

  const allocationResult = await client.query(
    `SELECT allocation.warehouse_id,
            SUM(CASE WHEN allocation.allocation_status = 'PLANNED' THEN 1 ELSE 0 END) AS planned_count
     FROM order_item_warehouse_allocations allocation
     JOIN order_items item ON item.id = allocation.order_item_id
     WHERE item.order_id = ?
       AND allocation.allocation_status IN ('PLANNED', 'DEDUCTED')
     GROUP BY allocation.warehouse_id
     ORDER BY allocation.warehouse_id`,
    [order.id]
  );
  const activeWarehouses = new Map(
    allocationResult.rows.map((row) => [
      Number(row.warehouse_id),
      Number(row.planned_count || 0),
    ])
  );
  const existingResult = await client.query(
    `SELECT *
     FROM order_warehouse_delivery_notes
     WHERE order_id = ?
     ORDER BY id
     FOR UPDATE`,
    [order.id]
  );
  const existingByWarehouse = new Map(
    existingResult.rows.map((note) => [Number(note.warehouse_id), note])
  );
  const fiscalYear = shouldUseFiscalDeliveryNotes(
    order.created_at ? new Date(order.created_at) : new Date()
  )
    ? order.bs_fiscal_year ||
      getNepaliFiscalMeta(
        order.created_at ? new Date(order.created_at) : new Date()
      ).bs_fiscal_year
    : null;

  for (const [warehouseId, plannedCount] of activeWarehouses) {
    const existing = existingByWarehouse.get(warehouseId);
    if (existing) {
      const existingStatus = String(existing.status || '').toUpperCase();
      if (
        existingStatus === 'VOID' ||
        existingStatus === 'REASSIGNED' ||
        (existingStatus === 'DELIVERED' && plannedCount > 0)
      ) {
        await client.query(
          `UPDATE order_warehouse_delivery_notes
           SET status = 'ACTIVE', voided_at = NULL, void_reason = NULL
           WHERE id = ?`,
          [existing.id]
        );
        if (supportsReassignment && existingStatus === 'REASSIGNED') {
          await client.query(
            `DELETE FROM order_warehouse_dn_reassignments
             WHERE source_delivery_note_id = ?`,
            [existing.id]
          );
        }
      }
      continue;
    }
    const deliveryNoteNumber = await getNextDeliveryNoteNumber(
      client,
      order.created_at ? new Date(order.created_at) : new Date()
    );
    await client.query(
      `INSERT INTO order_warehouse_delivery_notes
        (order_id, warehouse_id, delivery_note_number, status,
         bs_fiscal_year, assigned_by, assigned_at)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, NOW())`,
      [order.id, warehouseId, deliveryNoteNumber, fiscalYear, userId]
    );
  }

  for (const existing of existingResult.rows) {
    if (
      !activeWarehouses.has(Number(existing.warehouse_id)) &&
      !['VOID', 'REASSIGNED'].includes(
        String(existing.status || '').toUpperCase()
      )
    ) {
      await client.query(
        `UPDATE order_warehouse_delivery_notes
         SET status = 'VOID',
             voided_at = NOW(),
             void_reason = 'All products moved to another warehouse'
         WHERE id = ?`,
        [existing.id]
      );
    }
  }

  return loadWarehouseDeliveryNotes(client, [order.id]);
};

const allocateWarehouseStockForDelivery = async (client, item, userId) => {
  const capabilities = await getWarehouseAllocationCapabilities();
  const configuredGroups = await loadWarehousePrintGroupMap(
    client,
    capabilities.supportsConfiguredGroups
  );
  let remaining = Number(item.qty_ordered || 0);
  const allocations = [];

  if (capabilities.supportsPlanning) {
    const plannedResult = await client.query(
      `SELECT allocation.*, warehouse.name AS warehouse_name,
              ${
                capabilities.supportsDeliveredBy
                  ? 'delivered_user.name'
                  : 'NULL'
              } AS delivered_by_name
       FROM order_item_warehouse_allocations allocation
       JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
       ${
         capabilities.supportsDeliveredBy
           ? 'LEFT JOIN users delivered_user ON delivered_user.id = allocation.delivered_by'
           : ''
       }
       WHERE allocation.order_item_id = ?
         AND allocation.allocation_status = 'PLANNED'
       ORDER BY allocation.id
       FOR UPDATE`,
      [item.id]
    );
    const plannedTotal = plannedResult.rows.reduce(
      (sum, allocation) => sum + Number(allocation.quantity || 0),
      0
    );

    if (Math.abs(plannedTotal - remaining) < 0.001) {
      for (const allocation of plannedResult.rows) {
        const stockResult = await client.query(
          `SELECT id, quantity
           FROM finished_good_warehouse_stock
           WHERE finished_good_id = ? AND warehouse_id = ?
           FOR UPDATE`,
          [item.finished_good_id, allocation.warehouse_id]
        );
        const stock = stockResult.rows[0];
        const quantity = Number(allocation.quantity || 0);
        if (!stock || Number(stock.quantity || 0) + 0.001 < quantity) {
          const error = new Error(
            `The planned stock for ${item.product_name} is no longer available in ${allocation.warehouse_name}. Reopen packing and prepare the DN again.`
          );
          error.statusCode = 422;
          error.shortage = {
            product_name: item.product_name,
            ordered_qty: quantity,
            warehouse_stock: Number(stock?.quantity || 0),
            warehouse_name: allocation.warehouse_name,
          };
          throw error;
        }

        await client.query(
          `UPDATE finished_good_warehouse_stock
           SET quantity = quantity - ?, updated_by = ?
           WHERE id = ?`,
          [quantity, userId, stock.id]
        );
        await client.query(
          `UPDATE order_item_warehouse_allocations
           SET allocation_status = 'DEDUCTED'${
             capabilities.supportsPackedQuantity
               ? ', packed_quantity = quantity'
               : ''
           }${capabilities.supportsDeliveredBy ? ', delivered_by = ?' : ''}${
             capabilities.supportsDeliveredAt ? ', delivered_at = NOW()' : ''
           }
           WHERE id = ?`,
          [
            ...(capabilities.supportsDeliveredBy ? [userId] : []),
            allocation.id,
          ]
        );
        await recordWarehouseOrderMovement(client, {
          item,
          warehouseId: allocation.warehouse_id,
          quantity,
          userId,
        });
        allocations.push({
          warehouse_id: allocation.warehouse_id,
          warehouse_name: allocation.warehouse_name,
          quantity,
          print_group_code_snapshot:
            allocation.print_group_code_snapshot || null,
          print_group_name_snapshot:
            allocation.print_group_name_snapshot || null,
        });
      }

      return allocations;
    }

    if (plannedResult.rows.length) {
      await client.query(
        `DELETE FROM order_item_warehouse_allocations
         WHERE order_item_id = ? AND allocation_status = 'PLANNED'`,
        [item.id]
      );
    }
  }

  const warehouseStock = await client.query(
    `SELECT fgws.*, w.name AS warehouse_name
     FROM finished_good_warehouse_stock fgws
     JOIN warehouses w ON w.id = fgws.warehouse_id
     WHERE fgws.finished_good_id = ?
       AND fgws.quantity > 0
     ORDER BY fgws.updated_at ASC, fgws.id ASC
     FOR UPDATE`,
    [item.finished_good_id]
  );

  const stockPlan = buildCartonSafeWarehousePlan({
    stocks: warehouseStock.rows,
    quantity: remaining,
    pairsPerCarton: item.inner_boxes_per_outer_box,
    productName: item.product_name,
  });

  for (const plannedStock of stockPlan) {
    const stock = plannedStock.stock;
    const deduct = plannedStock.quantity;

    await client.query(
      `UPDATE finished_good_warehouse_stock
       SET quantity = quantity - ?, updated_by = ?
       WHERE id = ?`,
      [deduct, userId, stock.id]
    );

    const printGroup = resolveWarehousePrintGroup(
      stock.warehouse_id,
      stock.warehouse_name,
      configuredGroups
    );
    await insertWarehouseAllocation(client, {
      item,
      warehouse: stock,
      quantity: deduct,
      userId,
      status: 'DEDUCTED',
      packedQuantity: deduct,
      printGroup,
      capabilities,
    });
    if (capabilities.supportsDeliveredBy || capabilities.supportsDeliveredAt) {
      await client.query(
        `UPDATE order_item_warehouse_allocations
         SET ${[
           capabilities.supportsDeliveredBy ? 'delivered_by = ?' : null,
           capabilities.supportsDeliveredAt ? 'delivered_at = NOW()' : null,
         ]
           .filter(Boolean)
           .join(', ')}
         WHERE order_item_id = ?
           AND warehouse_id = ?
           AND allocation_status = 'DEDUCTED'
           AND ${
             capabilities.supportsDeliveredAt
               ? 'delivered_at IS NULL'
               : 'delivered_by IS NULL'
           }`,
        [
          ...(capabilities.supportsDeliveredBy ? [userId] : []),
          item.id,
          stock.warehouse_id,
        ]
      );
    }
    await recordWarehouseOrderMovement(client, {
      item,
      warehouseId: stock.warehouse_id,
      quantity: deduct,
      userId,
    });

    allocations.push({
      warehouse_id: stock.warehouse_id,
      warehouse_name: stock.warehouse_name,
      quantity: deduct,
      print_group_code_snapshot: printGroup.code,
      print_group_name_snapshot: printGroup.name,
    });

    remaining -= deduct;
  }

  return allocations;
};

// ─── GET ALL ORDERS ───────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const [
      supportsCancellationCode,
      supportsDuplicateOrderLink,
      supportsUnitPriceSnapshot,
      supportsPriceCurrencySnapshot,
      supportsWarehouseAllocationStatus,
      supportsWarehouseDeliveredBy,
      supportsWarehouseDeliveredAt,
      supportsPerWarehouseDeliveryNotes,
      supportsOrderBsDate,
      supportsOrderFiscalYear,
      supportsParentDealer,
    ] =
      await Promise.all([
        hasColumn('orders', 'cancellation_code'),
        hasColumn('orders', 'duplicate_of_order_id'),
        hasColumn('order_items', 'unit_price_snapshot'),
        hasColumn('order_items', 'price_currency_snapshot'),
        hasColumn('order_item_warehouse_allocations', 'allocation_status'),
        hasColumn('order_item_warehouse_allocations', 'delivered_by'),
        hasColumn('order_item_warehouse_allocations', 'delivered_at'),
        hasTable('order_warehouse_delivery_notes'),
        hasColumn('orders', 'bs_date'),
        hasColumn('orders', 'bs_fiscal_year'),
        hasColumn('users', 'parent_dealer_id'),
      ]);
    const params = [];
    const conditions = [];
    const pagination = getPagePagination(req.query, {
      defaultPageSize: 50,
      maxPageSize: 200,
    });
    const legacyLimit = Math.min(
      Math.max(Number(req.query.limit || 0), 0),
      500
    );
    const includeItems = req.query.include_items !== '0';

    if (['USER', 'ELDER'].includes(req.user.role)) {
      conditions.push('o.created_by = ?');
      params.push(req.user.id);
    }

    const createdBy = Number(req.query.created_by || 0);
    if (createdBy > 0 && !['USER', 'ELDER'].includes(req.user.role)) {
      conditions.push('o.created_by = ?');
      params.push(createdBy);
    }

    const customerKey = normalizeCustomerKey(req.query.customer_key);
    if (customerKey) {
      conditions.push(`${customerKeySql()} = ?`);
      params.push(customerKey);
    } else {
      const customerName = String(req.query.customer_name || '').trim();
      if (customerName) {
        conditions.push('o.customer_name = ?');
        params.push(customerName);
      }
    }

    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    if (ALL_STATUSES.includes(requestedStatus)) {
      conditions.push('o.status = ?');
      params.push(requestedStatus);
    }

    const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();
    const bsDateFrom = String(req.query.bs_date_from || '').trim();
    const bsDateTo = String(req.query.bs_date_to || '').trim();
    const fiscalYear = String(req.query.fiscal_year || '')
      .trim()
      .replace('-', '/');

    if (dateFrom && !isIsoDate(dateFrom)) {
      return res.status(400).json({
        success: false,
        message: 'English from date must use YYYY-MM-DD.',
      });
    }
    if (dateTo && !isIsoDate(dateTo)) {
      return res.status(400).json({
        success: false,
        message: 'English to date must use YYYY-MM-DD.',
      });
    }
    if ((bsDateFrom || bsDateTo) && !supportsOrderBsDate) {
      return res.status(409).json({
        success: false,
        message: 'Nepali date filtering requires sql/add-nepali-fiscal-year-fields.sql.',
      });
    }
    if (bsDateFrom && !isIsoDate(bsDateFrom)) {
      return res.status(400).json({
        success: false,
        message: 'Nepali from date must use YYYY-MM-DD.',
      });
    }
    if (bsDateTo && !isIsoDate(bsDateTo)) {
      return res.status(400).json({
        success: false,
        message: 'Nepali to date must use YYYY-MM-DD.',
      });
    }
    if (fiscalYear && !/^\d{4}\/\d{2}$/.test(fiscalYear)) {
      return res.status(400).json({
        success: false,
        message: 'Fiscal year must use the format 2083/84.',
      });
    }
    if (fiscalYear && !supportsOrderFiscalYear) {
      return res.status(409).json({
        success: false,
        message: 'Fiscal-year filtering requires sql/add-nepali-fiscal-year-fields.sql.',
      });
    }
    if (dateFrom) {
      conditions.push('o.created_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(dateTo);
    }
    if (bsDateFrom) {
      conditions.push('o.bs_date >= ?');
      params.push(bsDateFrom);
    }
    if (bsDateTo) {
      conditions.push('o.bs_date <= ?');
      params.push(bsDateTo);
    }
    if (fiscalYear) {
      conditions.push('o.bs_fiscal_year = ?');
      params.push(fiscalYear);
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      const likeSearch = `%${search}%`;
      conditions.push(`(
        CAST(o.id AS CHAR) = ?
        OR o.customer_name LIKE ?
        OR o.customer_phone LIKE ?
        OR o.delivery_note_number LIKE ?
        ${
          supportsPerWarehouseDeliveryNotes
            ? `OR EXISTS (
                SELECT 1 FROM order_warehouse_delivery_notes search_dn
                WHERE search_dn.order_id = o.id
                  AND search_dn.delivery_note_number LIKE ?
              )`
            : ''
        }
        OR o.status LIKE ?
        OR EXISTS (
          SELECT 1
          FROM users search_user
          WHERE search_user.id = o.created_by
            AND search_user.name LIKE ?
        )
      )`);
      params.push(
        search,
        likeSearch,
        ...(supportsPerWarehouseDeliveryNotes ? [likeSearch] : []),
        likeSearch,
        likeSearch,
        likeSearch,
        likeSearch
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = pagination.enabled
      ? 'LIMIT ? OFFSET ?'
      : legacyLimit
        ? 'LIMIT ?'
        : '';
    const limitParams = pagination.enabled
      ? [pagination.pageSize, pagination.offset]
      : legacyLimit
        ? [legacyLimit]
        : [];

    const [orders, countResult] = await Promise.all([
      query(
      `SELECT o.id,
              o.customer_name,
              o.customer_phone,
              o.customer_address,
              o.pan_number,
              o.transport_name,
              o.status,
              o.notes,
              o.cancellation_reason,
              ${supportsCancellationCode ? 'o.cancellation_code' : 'NULL AS cancellation_code'},
              ${supportsDuplicateOrderLink ? 'o.duplicate_of_order_id' : 'NULL AS duplicate_of_order_id'},
              o.created_by,
              o.created_at,
              o.updated_at,
              ${supportsOrderBsDate ? 'o.bs_date' : 'NULL AS bs_date'},
              ${supportsOrderFiscalYear ? 'o.bs_fiscal_year' : 'NULL AS bs_fiscal_year'},
              o.stock_deducted,
              o.delivery_note_number,
              o.confirmed_by,
              o.confirmed_at,
              o.packed_by,
              o.packed_at,
              o.delivered_by,
              o.delivered_at,
              u_created.name AS created_by_name,
              ${
                supportsParentDealer
                  ? `u_created.parent_dealer_id,
                     u_parent.name AS parent_dealer_name,
                     u_parent.email AS parent_dealer_email,`
                  : `NULL AS parent_dealer_id,
                     NULL AS parent_dealer_name,
                     NULL AS parent_dealer_email,`
              }
              u_confirmed.name AS confirmed_by_name,
              u_packed.name AS packed_by_name,
              u_delivered.name AS delivered_by_name
       FROM orders o
       LEFT JOIN users u_created ON u_created.id = o.created_by
       ${
         supportsParentDealer
           ? 'LEFT JOIN users u_parent ON u_parent.id = u_created.parent_dealer_id'
           : ''
       }
       LEFT JOIN users u_confirmed ON u_confirmed.id = o.confirmed_by
       LEFT JOIN users u_packed ON u_packed.id = o.packed_by
       LEFT JOIN users u_delivered ON u_delivered.id = o.delivered_by
       ${where}
       ORDER BY o.created_at DESC
       ${limitClause}`,
        [...params, ...limitParams]
      ),
      pagination.enabled
        ? query(
            `SELECT COUNT(*) AS total
             FROM orders o
             ${where}`,
            params
          )
        : Promise.resolve(null),
    ]);

    const orderIds = orders.rows.map((o) => o.id);
    let items = [];

    if (includeItems && orderIds.length) {
      const { clause, params: orderParams } = buildInClause(orderIds);
      const itemResult = await query(
        `SELECT oi.id,
                oi.order_id,
                oi.finished_good_id,
                oi.qty_ordered,
                ${
                  supportsUnitPriceSnapshot
                    ? 'oi.unit_price_snapshot,'
                    : ''
                }
                ${
                  supportsPriceCurrencySnapshot
                    ? 'oi.price_currency_snapshot,'
                    : ''
                }
                fg.name AS product_name,
                fg.article_code, fg.color, fg.size,
                fg.unit, fg.quantity AS physical_stock,
                fg.display_quantity,
                fg.inner_boxes_per_outer_box
         FROM order_items oi
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE oi.order_id IN ${clause}
         ORDER BY oi.id`,
        orderParams
      );
      items = itemResult.rows;
    }

    if (includeItems && items.length) {
      const itemIds = items.map((item) => item.id);
      const { clause, params: itemParams } = buildInClause(itemIds);
      const allocationResult = await query(
        `SELECT oiwa.*,
                w.name AS warehouse_name,
                ${
                  supportsWarehouseDeliveredBy
                    ? 'delivered_user.name'
                    : 'NULL'
                } AS delivered_by_name
         FROM order_item_warehouse_allocations oiwa
         JOIN warehouses w ON w.id = oiwa.warehouse_id
         ${
           supportsWarehouseDeliveredBy
             ? 'LEFT JOIN users delivered_user ON delivered_user.id = oiwa.delivered_by'
             : ''
         }
         WHERE oiwa.order_item_id IN ${clause}
           ${
             supportsWarehouseAllocationStatus
               ? "AND oiwa.allocation_status <> 'RELEASED'"
               : ''
           }
         ORDER BY oiwa.id`,
        itemParams
      );

      const allocationsByItemId = allocationResult.rows.reduce((acc, allocation) => {
        acc[allocation.order_item_id] = acc[allocation.order_item_id] || [];
        acc[allocation.order_item_id].push(allocation);
        return acc;
      }, {});

      items = items.map((item) => ({
        ...item,
        warehouse_allocations: allocationsByItemId[item.id] || [],
      }));
    }

    const grouped = items.reduce((acc, item) => {
      acc[item.order_id] = acc[item.order_id] || [];
      acc[item.order_id].push(item);
      return acc;
    }, {});
    const warehouseDeliveryNotes = supportsPerWarehouseDeliveryNotes
      ? await loadWarehouseDeliveryNotes({ query }, orderIds)
      : [];
    const deliveryNotesByOrder = warehouseDeliveryNotes.reduce((acc, note) => {
      const orderNotes = acc.get(Number(note.order_id)) || [];
      orderNotes.push(note);
      acc.set(Number(note.order_id), orderNotes);
      return acc;
    }, new Map());

    const ordersWithFulfillments = orders.rows.map((order) => {
      const orderItems = grouped[order.id] || [];
      const orderDeliveryNotes =
        deliveryNotesByOrder.get(Number(order.id)) || [];
      const summary = buildWarehouseFulfillments(
        order,
        orderItems,
        new Map(),
        orderDeliveryNotes
      );
      return {
        ...order,
        items: orderItems,
        warehouse_delivery_note_numbers: orderDeliveryNotes.map(
          (note) => note.delivery_note_number
        ),
        warehouse_fulfillments: summary.fulfillments,
        fulfillment_status: summary.fulfillmentStatus,
        delivered_warehouse_count: summary.deliveredCount,
        warehouse_fulfillment_count: summary.totalCount,
      };
    });

    return res.json({
      success: true,
      data: ordersWithFulfillments,
      ...(pagination.enabled
        ? {
            pagination: getPaginationMeta(
              pagination,
              countResult?.rows?.[0]?.total
            ),
          }
        : {}),
    });
  } catch (err) {
    next(err);
  }
};

const getFilters = async (req, res, next) => {
  try {
    const ownOrdersOnly = ['USER', 'ELDER'].includes(req.user.role);
    const ownWhere = ownOrdersOnly ? 'WHERE o.created_by = ?' : '';
    const ownParams = ownOrdersOnly ? [req.user.id] : [];

    const [dealers, parties, partyDetails] = await Promise.all([
      query(
        `SELECT o.created_by AS id,
                COALESCE(u.name, 'Unknown user') AS name,
                COALESCE(u.email, '') AS email,
                COALESCE(u.role, '-') AS role,
                COUNT(*) AS order_count
         FROM orders o
         LEFT JOIN users u ON u.id = o.created_by
         ${ownWhere}
         GROUP BY o.created_by, u.name, u.email, u.role
         ORDER BY name`,
        ownParams
      ),
      query(
        `SELECT o.created_by AS dealer_id,
                COALESCE(u.name, 'Unknown user') AS dealer_name,
                o.customer_name AS name,
                COUNT(*) AS order_count,
                MAX(o.created_at) AS latest_order_at
         FROM orders o
         LEFT JOIN users u ON u.id = o.created_by
         ${ownWhere}
         WHERE_REPLACEMENT
         GROUP BY o.created_by, u.name, o.customer_name
         ORDER BY dealer_name, o.customer_name`
          .replace(
            'WHERE_REPLACEMENT',
            ownOrdersOnly
              ? "AND o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> ''"
              : "WHERE o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> ''"
          ),
        ownParams
      ),
      query(
        `SELECT o.created_by AS dealer_id,
                o.customer_name AS name,
                o.customer_phone,
                o.customer_address,
                o.pan_number,
                o.transport_name,
                o.created_at
         FROM orders o
         ${ownWhere}
         WHERE_REPLACEMENT
         ORDER BY o.created_at DESC, o.id DESC`
          .replace(
            'WHERE_REPLACEMENT',
            ownOrdersOnly
              ? "AND o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> ''"
              : "WHERE o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> ''"
          ),
        ownParams
      ),
    ]);

    const recentDetailsByParty = partyDetails.rows.reduce((details, row) => {
      const groupKey = `${Number(row.dealer_id)}:${normalizeCustomerKey(row.name)}`;
      const current = details.get(groupKey) || {
        customer_phone: null,
        customer_address: null,
        pan_number: null,
        transport_name: null,
      };
      if (!current.customer_phone && String(row.customer_phone || '').trim()) {
        current.customer_phone = row.customer_phone;
      }
      if (!current.customer_address && String(row.customer_address || '').trim()) {
        current.customer_address = row.customer_address;
      }
      if (!current.pan_number && String(row.pan_number || '').trim()) {
        current.pan_number = row.pan_number;
      }
      const transport = String(row.transport_name || '').trim();
      if (
        !current.transport_name &&
        transport &&
        !['N/A', 'NA', 'NONE', '-'].includes(transport.toUpperCase())
      ) {
        current.transport_name = transport;
      }
      details.set(groupKey, current);
      return details;
    }, new Map());

    return res.json({
      success: true,
      data: {
        dealers: dealers.rows.map((row) => ({
          ...row,
          id: Number(row.id),
          order_count: Number(row.order_count || 0),
        })),
        parties: [...parties.rows.reduce((groups, row) => {
          const dealerId = Number(row.dealer_id);
          const key = normalizeCustomerKey(row.name);
          if (!key) return groups;
          const groupKey = `${dealerId}:${key}`;
          const count = Number(row.order_count || 0);
          const existing = groups.get(groupKey);
          if (!existing) {
            groups.set(groupKey, {
              dealer_id: dealerId,
              dealer_name: row.dealer_name,
              key,
              name: row.name,
              order_count: count,
              aliases: [row.name],
              latest_order_at: row.latest_order_at,
              canonical_count: count,
            });
            return groups;
          }
          existing.order_count += count;
          existing.aliases.push(row.name);
          if (count > existing.canonical_count) {
            existing.name = row.name;
            existing.canonical_count = count;
          }
          if (
            row.latest_order_at &&
            (!existing.latest_order_at || new Date(row.latest_order_at) > new Date(existing.latest_order_at))
          ) {
            existing.latest_order_at = row.latest_order_at;
          }
          return groups;
        }, new Map()).values()].map(({ canonical_count, ...party }) => ({
          ...party,
          ...(recentDetailsByParty.get(`${party.dealer_id}:${party.key}`) || {}),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getOverview = async (req, res, next) => {
  try {
    const supportsWarehouseDelivery = await hasColumn(
      'order_item_warehouse_allocations',
      'allocation_status'
    );
    const deliveredQuantityExpr = supportsWarehouseDelivery
      ? 'COALESCE(delivered_allocation.delivered_quantity, 0)'
      : '0';
    const remainingQuantityExpr = `GREATEST(0, oi.qty_ordered - ${deliveredQuantityExpr})`;
    const statusRows = await query(
      `SELECT UPPER(o.status) AS status,
              COUNT(DISTINCT o.id) AS order_count,
              COALESCE(SUM(
                CASE
                  WHEN UPPER(o.status) IN ('PENDING', 'CONFIRMED', 'PACKED')
                    THEN ${remainingQuantityExpr}
                  ELSE oi.qty_ordered
                END
              ), 0) AS pairs,
              COALESCE(SUM(
                CASE
                  WHEN COALESCE(fg.inner_boxes_per_outer_box, 0) > 0
                    THEN (
                      CASE
                        WHEN UPPER(o.status) IN ('PENDING', 'CONFIRMED', 'PACKED')
                          THEN ${remainingQuantityExpr}
                        ELSE oi.qty_ordered
                      END
                    ) / fg.inner_boxes_per_outer_box
                  ELSE 0
                END
              ), 0) AS cartons,
              COALESCE(SUM(oi.qty_ordered), 0) AS ordered_pairs,
              COALESCE(SUM(
                CASE
                  WHEN COALESCE(fg.inner_boxes_per_outer_box, 0) > 0
                    THEN oi.qty_ordered / fg.inner_boxes_per_outer_box
                  ELSE 0
                END
              ), 0) AS ordered_cartons,
              COALESCE(SUM(${deliveredQuantityExpr}), 0) AS already_delivered_pairs,
              COALESCE(SUM(
                CASE
                  WHEN COALESCE(fg.inner_boxes_per_outer_box, 0) > 0
                    THEN ${deliveredQuantityExpr} / fg.inner_boxes_per_outer_box
                  ELSE 0
                END
              ), 0) AS already_delivered_cartons
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN finished_goods fg ON fg.id = oi.finished_good_id
       ${
         supportsWarehouseDelivery
           ? `LEFT JOIN (
                SELECT order_item_id, SUM(quantity) AS delivered_quantity
                FROM order_item_warehouse_allocations
                WHERE allocation_status = 'DEDUCTED'
                GROUP BY order_item_id
              ) delivered_allocation ON delivered_allocation.order_item_id = oi.id`
           : ''
       }
       GROUP BY UPPER(o.status)`
    );

    const [
      supportsActionType,
      supportsModule,
      supportsEntityId,
      supportsDescription,
      supportsMetadata,
      supportsUserName,
      supportsUserRole,
    ] = await Promise.all([
      hasColumn('audit_logs', 'action_type'),
      hasColumn('audit_logs', 'module'),
      hasColumn('audit_logs', 'entity_id'),
      hasColumn('audit_logs', 'description'),
      hasColumn('audit_logs', 'metadata'),
      hasColumn('audit_logs', 'user_name'),
      hasColumn('audit_logs', 'user_role'),
    ]);
    const actionExpr = supportsActionType ? 'al.action_type' : 'al.action';
    const moduleExpr = supportsModule ? 'al.module' : 'al.table_name';
    const entityIdExpr = supportsEntityId ? 'al.entity_id' : 'al.record_id';
    const descriptionExpr = supportsDescription
      ? 'al.description'
      : 'al.detail';
    const metadataExpr = supportsMetadata ? 'al.metadata' : 'NULL';
    const userNameExpr = supportsUserName ? 'al.user_name' : 'NULL';
    const userRoleExpr = supportsUserRole ? 'al.user_role' : 'NULL';

    const recentRows = await query(
      `SELECT al.id,
              ${actionExpr} AS action_type,
              ${entityIdExpr} AS order_id,
              ${descriptionExpr} AS description,
              ${metadataExpr} AS metadata,
              COALESCE(actor.name, ${userNameExpr}, 'Unknown user') AS user_name,
              COALESCE(actor.role, ${userRoleExpr}, '-') AS user_role,
              order_row.customer_name,
              al.created_at
       FROM audit_logs al
       LEFT JOIN users actor ON actor.id = al.user_id
       LEFT JOIN orders order_row ON order_row.id = ${entityIdExpr}
       WHERE LOWER(COALESCE(${moduleExpr}, '')) IN ('order', 'orders')
         AND UPPER(COALESCE(${actionExpr}, '')) IN (
           'CONFIRMED', 'PACKED', 'DELIVERED', 'CANCELLED', 'UPDATE'
         )
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT 100`
    );

    const fallbackTransitions = {
      CONFIRMED: ['PENDING', 'CONFIRMED'],
      PACKED: ['CONFIRMED', 'PACKED'],
      DELIVERED: ['PACKED', 'DELIVERED'],
      CANCELLED: [null, 'CANCELLED'],
    };
    const recentTransitions = recentRows.rows
      .map((row) => {
        let metadata = {};
        if (row.metadata && typeof row.metadata === 'object') {
          metadata = row.metadata;
        } else if (row.metadata) {
          try {
            metadata = JSON.parse(row.metadata);
          } catch {
            metadata = {};
          }
        }
        const action = String(row.action_type || '').toUpperCase();
        const fallback = fallbackTransitions[action] || [];
        const fromStatus = String(
          metadata.previous_status || fallback[0] || ''
        ).toUpperCase();
        const toStatus = String(
          metadata.status || fallback[1] || ''
        ).toUpperCase();
        if (!toStatus || fromStatus === toStatus) return null;
        return {
          id: Number(row.id),
          order_id: Number(row.order_id || metadata.order_number || 0) || null,
          customer_name:
            row.customer_name || metadata.customer_name || 'Customer',
          from_status: fromStatus || '—',
          to_status: toStatus,
          user_name: row.user_name,
          user_role: row.user_role,
          description: row.description,
          created_at: row.created_at,
        };
      })
      .filter(Boolean)
      .slice(0, 12);

    const statusSummary = statusRows.rows.reduce((summary, row) => {
      summary[String(row.status || '').toUpperCase()] = {
        orders: Number(row.order_count || 0),
        cartons: Number(row.cartons || 0),
        pairs: Number(row.pairs || 0),
        ordered_cartons: Number(row.ordered_cartons || 0),
        ordered_pairs: Number(row.ordered_pairs || 0),
        already_delivered_cartons: Number(
          row.already_delivered_cartons || 0
        ),
        already_delivered_pairs: Number(row.already_delivered_pairs || 0),
      };
      return summary;
    }, {});

    return res.json({
      success: true,
      data: {
        statuses: statusSummary,
        recent_transitions: recentTransitions,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET AVAILABILITY ─────────────────────────────
const getAvailability = async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await loadAvailabilityForRequest(req),
    });
  } catch (err) {
    next(err);
  }
};

const getOfferPurchases = async (req, res, next) => {
  try {
    if (!await hasColumn('order_items', 'ordered_from_offer')) {
      return res.status(400).json({ success: false, message: 'Offer purchase tracking requires sql/add-offer-order-snapshots.sql.' });
    }
    const supportsOfferCampaigns = await hasOfferCampaignSchema();

    const rows = await query(
      `SELECT oi.id AS order_item_id, oi.order_id, oi.finished_good_id, oi.qty_ordered,
              oi.offer_label_snapshot, oi.offer_display_percentage, oi.offer_display_quantity,
              oi.offer_price_snapshot, oi.offer_pairs_per_carton_snapshot${supportsOfferCampaigns ? ', oi.offer_campaign_id, campaign.created_at AS offer_campaign_started_at, campaign.ended_at AS offer_campaign_ended_at, campaign.status AS offer_campaign_status' : ''},
              o.customer_name, o.status, o.created_at, o.delivery_note_number,
              u.name AS account_name, u.email AS account_email,
              fg.name AS product_name, fg.article_code, fg.sole_code, fg.color, fg.size, fg.unit
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       LEFT JOIN users u ON u.id = o.created_by
       ${supportsOfferCampaigns ? 'LEFT JOIN finished_good_offer_campaigns campaign ON campaign.id = oi.offer_campaign_id' : ''}
       WHERE oi.ordered_from_offer = 1
       ORDER BY o.created_at DESC, oi.id DESC`
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        qty_ordered: Number(row.qty_ordered || 0),
        offer_display_percentage: row.offer_display_percentage === null ? null : Number(row.offer_display_percentage),
        offer_display_quantity: row.offer_display_quantity === null ? null : Number(row.offer_display_quantity),
        offer_price_snapshot: row.offer_price_snapshot === null ? null : Number(row.offer_price_snapshot),
        offer_pairs_per_carton_snapshot: row.offer_pairs_per_carton_snapshot === null ? null : Number(row.offer_pairs_per_carton_snapshot),
        offer_campaign_id: row.offer_campaign_id === null || row.offer_campaign_id === undefined ? null : Number(row.offer_campaign_id),
      })),
    });
  } catch (err) {
    next(err);
  }
};

const getOfferVsRegularReport = async (req, res, next) => {
  try {
    if (!(await hasColumn('order_items', 'ordered_from_offer'))) {
      return res.status(409).json({
        success: false,
        message: 'Offer comparison requires sql/add-offer-order-snapshots.sql.',
      });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    const defaultTo = today.toISOString().slice(0, 10);
    const defaultFromDate = new Date(today);
    defaultFromDate.setDate(defaultFromDate.getDate() - 29);
    const defaultFrom = defaultFromDate.toISOString().slice(0, 10);
    const dateFrom = datePattern.test(String(req.query.date_from || ''))
      ? String(req.query.date_from)
      : defaultFrom;
    const dateTo = datePattern.test(String(req.query.date_to || ''))
      ? String(req.query.date_to)
      : defaultTo;
    if (dateFrom > dateTo) {
      return res.status(400).json({
        success: false,
        message: 'The report start date must be before the end date.',
      });
    }

    const supportsDeliveryAllocations =
      (await hasTable('order_item_warehouse_allocations')) &&
      (await hasColumn('order_item_warehouse_allocations', 'allocation_status'));
    const supportsAllocationDeliveredAt = supportsDeliveryAllocations
      ? await hasColumn('order_item_warehouse_allocations', 'delivered_at')
      : false;
    const supportsWarehouseDeliveryNotes = await hasTable(
      'order_warehouse_delivery_notes'
    );
    const supportsOfferCampaigns = await hasOfferCampaignSchema();

    const orderRowsPromise = query(
      `SELECT product.id AS finished_good_id,
              product.name AS product_name,
              product.article_code,
              product.sole_code,
              product.color,
              product.size,
              product.unit,
              product.inner_boxes_per_outer_box AS pairs_per_carton,
              orders.created_by AS dealer_user_id,
              dealer.name AS dealer_name,
              dealer.email AS dealer_email,
              COALESCE(item.ordered_from_offer, 0) AS is_offer,
              COALESCE(SUM(CASE WHEN orders.status <> 'CANCELLED' THEN item.qty_ordered ELSE 0 END), 0) AS ordered_pairs,
              COALESCE(SUM(CASE WHEN orders.status = 'CANCELLED' THEN item.qty_ordered ELSE 0 END), 0) AS cancelled_pairs,
              COUNT(DISTINCT CASE WHEN orders.status <> 'CANCELLED' THEN orders.id END) AS order_count,
              COUNT(DISTINCT CASE WHEN orders.status <> 'CANCELLED' THEN orders.created_by END) AS dealer_count
       FROM order_items item
       JOIN orders ON orders.id = item.order_id
       JOIN finished_goods product ON product.id = item.finished_good_id
       LEFT JOIN users dealer ON dealer.id = orders.created_by
       WHERE orders.created_at >= ?
         AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY product.id, product.name, product.article_code,
                product.sole_code, product.color, product.size, product.unit,
                product.inner_boxes_per_outer_box,
                orders.created_by, dealer.name, dealer.email,
                COALESCE(item.ordered_from_offer, 0)`,
      [dateFrom, dateTo]
    );

    const deliveryRowsPromise = supportsDeliveryAllocations
      ? query(
          `SELECT item.finished_good_id,
                  orders.created_by AS dealer_user_id,
                  dealer.name AS dealer_name,
                  dealer.email AS dealer_email,
                  COALESCE(item.ordered_from_offer, 0) AS is_offer,
                  COALESCE(SUM(CASE WHEN allocation.allocation_status = 'DEDUCTED' THEN allocation.quantity ELSE 0 END), 0) AS delivered_pairs,
                  COALESCE(SUM(CASE WHEN allocation.allocation_status = 'OUT_OF_STOCK' THEN allocation.quantity ELSE 0 END), 0) AS out_of_stock_pairs
           FROM order_items item
           JOIN orders ON orders.id = item.order_id
           LEFT JOIN users dealer ON dealer.id = orders.created_by
           JOIN order_item_warehouse_allocations allocation
             ON allocation.order_item_id = item.id
           WHERE orders.created_at >= ?
             AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)
             AND orders.status <> 'CANCELLED'
           GROUP BY item.finished_good_id, orders.created_by,
                    dealer.name, dealer.email,
                    COALESCE(item.ordered_from_offer, 0)`,
          [dateFrom, dateTo]
        )
      : Promise.resolve([]);

    const campaignRowsPromise = supportsOfferCampaigns
      ? query(
          `SELECT campaign.finished_good_id,
                  product.name AS product_name,
                  product.article_code,
                  product.sole_code,
                  product.color,
                  product.size,
                  product.unit,
                  product.inner_boxes_per_outer_box AS pairs_per_carton,
                  COUNT(DISTINCT campaign.id) AS offer_period_count,
                  COALESCE(SUM(campaign.stock_quantity_snapshot), 0) AS offer_starting_pairs
           FROM finished_good_offer_campaigns campaign
           JOIN finished_goods product ON product.id = campaign.finished_good_id
           WHERE campaign.created_at < DATE_ADD(?, INTERVAL 1 DAY)
             AND COALESCE(campaign.ended_at, campaign.offer_ends_at, '9999-12-31') >= ?
           GROUP BY campaign.finished_good_id, product.name, product.article_code,
                    product.sole_code, product.color, product.size, product.unit,
                    product.inner_boxes_per_outer_box`,
          [dateTo, dateFrom]
        )
      : Promise.resolve([]);

    const assignedRowsPromise = supportsOfferCampaigns
      ? query(
          `SELECT campaign.finished_good_id,
                  audience.user_id AS dealer_user_id,
                  dealer.name AS dealer_name,
                  dealer.email AS dealer_email,
                  COALESCE(SUM(audience.display_quantity), 0) AS offer_assigned_pairs
           FROM finished_good_offer_campaigns campaign
           JOIN finished_good_offer_campaign_users audience
             ON audience.campaign_id = campaign.id
           JOIN users dealer ON dealer.id = audience.user_id
           WHERE campaign.created_at < DATE_ADD(?, INTERVAL 1 DAY)
             AND COALESCE(campaign.ended_at, campaign.offer_ends_at, '9999-12-31') >= ?
           GROUP BY campaign.finished_good_id, audience.user_id,
                    dealer.name, dealer.email`,
          [dateTo, dateFrom]
        )
      : Promise.resolve([]);

    const orderDetailRowsPromise = query(
      `SELECT item.id AS order_item_id,
              orders.id AS order_id,
              orders.created_at AS order_placed_at,
              orders.status AS order_status,
              orders.customer_name,
              orders.delivery_note_number AS master_delivery_note_number,
              orders.created_by AS dealer_user_id,
              dealer.name AS dealer_name,
              dealer.email AS dealer_email,
              product.id AS finished_good_id,
              product.name AS product_name,
              product.article_code,
              product.sole_code,
              product.color,
              product.size,
              product.inner_boxes_per_outer_box AS pairs_per_carton,
              COALESCE(item.ordered_from_offer, 0) AS is_offer,
              ${supportsOfferCampaigns ? 'item.offer_campaign_id' : 'NULL'} AS offer_campaign_id,
              item.qty_ordered AS ordered_pairs,
              ${supportsOfferCampaigns ? 'campaign.offer_label' : 'item.offer_label_snapshot'} AS offer_label,
              ${supportsOfferCampaigns ? 'campaign.created_at' : 'NULL'} AS offer_started_at,
              ${supportsOfferCampaigns ? 'COALESCE(campaign.ended_at, campaign.offer_ends_at)' : 'NULL'} AS offer_ended_at,
              ${supportsOfferCampaigns ? 'campaign.offer_all_users' : 'NULL'} AS offer_all_users,
              ${supportsOfferCampaigns ? 'audience.display_quantity' : 'NULL'} AS assigned_pairs,
              COALESCE(delivery.delivered_pairs, 0) AS delivered_pairs,
              delivery.first_delivered_at,
              delivery.last_delivered_at,
              ${supportsWarehouseDeliveryNotes ? 'warehouse_notes.delivery_note_numbers' : 'NULL'} AS warehouse_delivery_note_numbers
       FROM order_items item
       JOIN orders ON orders.id = item.order_id
       JOIN finished_goods product ON product.id = item.finished_good_id
       LEFT JOIN users dealer ON dealer.id = orders.created_by
       ${
         supportsOfferCampaigns
           ? `LEFT JOIN finished_good_offer_campaigns campaign
                ON campaign.id = item.offer_campaign_id
              LEFT JOIN finished_good_offer_campaign_users audience
                ON audience.campaign_id = item.offer_campaign_id
               AND audience.user_id = orders.created_by`
           : ''
       }
       ${
         supportsDeliveryAllocations
           ? `LEFT JOIN (
                SELECT allocation.order_item_id,
                       COALESCE(SUM(CASE WHEN allocation.allocation_status = 'DEDUCTED' THEN allocation.quantity ELSE 0 END), 0) AS delivered_pairs,
                       ${supportsAllocationDeliveredAt ? "MIN(CASE WHEN allocation.allocation_status = 'DEDUCTED' THEN allocation.delivered_at END)" : 'NULL'} AS first_delivered_at,
                       ${supportsAllocationDeliveredAt ? "MAX(CASE WHEN allocation.allocation_status = 'DEDUCTED' THEN allocation.delivered_at END)" : 'NULL'} AS last_delivered_at
                FROM order_item_warehouse_allocations allocation
                GROUP BY allocation.order_item_id
              ) delivery ON delivery.order_item_id = item.id`
           : `LEFT JOIN (
                SELECT NULL AS order_item_id, 0 AS delivered_pairs,
                       NULL AS first_delivered_at, NULL AS last_delivered_at
              ) delivery ON 1 = 0`
       }
       ${
         supportsWarehouseDeliveryNotes
           ? `LEFT JOIN (
                SELECT note.order_id,
                       GROUP_CONCAT(
                         DISTINCT CONCAT(note.delivery_note_number, ' [', note.status, ']')
                         ORDER BY note.delivery_note_number SEPARATOR ', '
                       ) AS delivery_note_numbers
                FROM order_warehouse_delivery_notes note
                GROUP BY note.order_id
              ) warehouse_notes ON warehouse_notes.order_id = orders.id`
           : ''
       }
       WHERE orders.created_at >= ?
         AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY orders.created_at, orders.id, product.article_code,
                product.color, item.id`,
      [dateFrom, dateTo]
    );

    const [orderRows, deliveryRows, campaignRows, assignedRows, orderDetailRows] =
      await Promise.all([
        orderRowsPromise,
        deliveryRowsPromise,
        campaignRowsPromise,
        assignedRowsPromise,
        orderDetailRowsPromise,
      ]);

    const products = new Map();
    const ensureProduct = (row) => {
      const id = Number(row.finished_good_id);
      if (!products.has(id)) {
        products.set(id, {
          finished_good_id: id,
          product_name: row.product_name || '',
          article_code: row.article_code || '',
          sole_code: row.sole_code || '',
          color: row.color || '',
          size: row.size || '',
          unit: row.unit || 'pairs',
          pairs_per_carton: Number(row.pairs_per_carton || 0),
          offer_period_count: 0,
          offer_starting_pairs: 0,
          offer_assigned_pairs: 0,
          assigned_dealer_count: 0,
          offer_ordered_pairs: 0,
          offer_delivered_pairs: 0,
          offer_out_of_stock_pairs: 0,
          offer_cancelled_pairs: 0,
          offer_order_count: 0,
          offer_dealer_count: 0,
          regular_ordered_pairs: 0,
          regular_delivered_pairs: 0,
          regular_out_of_stock_pairs: 0,
          regular_cancelled_pairs: 0,
          regular_order_count: 0,
          regular_dealer_count: 0,
          _dealers: new Map(),
        });
      }
      const product = products.get(id);
      ['product_name', 'article_code', 'sole_code', 'color', 'size', 'unit'].forEach((key) => {
        if (!product[key] && row[key]) product[key] = row[key];
      });
      if (!product.pairs_per_carton && row.pairs_per_carton) {
        product.pairs_per_carton = Number(row.pairs_per_carton);
      }
      return product;
    };

    const ensureDealer = (product, row) => {
      const userId = Number(row.dealer_user_id || 0);
      const email = String(row.dealer_email || '').trim().toLowerCase();
      const name = String(row.dealer_name || '').trim();
      const key = userId > 0 ? `id:${userId}` : `account:${email || name || 'unknown'}`;
      if (!product._dealers.has(key)) {
        product._dealers.set(key, {
          user_id: userId || null,
          dealer_name: name || row.dealer_email || 'Unknown dealer',
          dealer_email: row.dealer_email || '',
          offer_assigned_pairs: 0,
          offer_ordered_pairs: 0,
          offer_delivered_pairs: 0,
          offer_cancelled_pairs: 0,
          offer_order_count: 0,
          regular_ordered_pairs: 0,
          regular_delivered_pairs: 0,
          regular_cancelled_pairs: 0,
          regular_order_count: 0,
        });
      }
      return product._dealers.get(key);
    };

    orderRows.forEach((row) => {
      const product = ensureProduct(row);
      const prefix = Number(row.is_offer) === 1 ? 'offer' : 'regular';
      product[`${prefix}_ordered_pairs`] += Number(row.ordered_pairs || 0);
      product[`${prefix}_cancelled_pairs`] += Number(row.cancelled_pairs || 0);
      product[`${prefix}_order_count`] += Number(row.order_count || 0);
      const dealer = ensureDealer(product, row);
      dealer[`${prefix}_ordered_pairs`] += Number(row.ordered_pairs || 0);
      dealer[`${prefix}_cancelled_pairs`] += Number(row.cancelled_pairs || 0);
      dealer[`${prefix}_order_count`] += Number(row.order_count || 0);
    });
    deliveryRows.forEach((row) => {
      const product = ensureProduct(row);
      const prefix = Number(row.is_offer) === 1 ? 'offer' : 'regular';
      product[`${prefix}_delivered_pairs`] += Number(row.delivered_pairs || 0);
      product[`${prefix}_out_of_stock_pairs`] += Number(row.out_of_stock_pairs || 0);
      const dealer = ensureDealer(product, row);
      dealer[`${prefix}_delivered_pairs`] += Number(row.delivered_pairs || 0);
    });
    campaignRows.forEach((row) => {
      const product = ensureProduct(row);
      product.offer_period_count = Number(row.offer_period_count || 0);
      product.offer_starting_pairs = Number(row.offer_starting_pairs || 0);
    });
    assignedRows.forEach((row) => {
      const product = ensureProduct(row);
      product.offer_assigned_pairs += Number(row.offer_assigned_pairs || 0);
      const dealer = ensureDealer(product, row);
      dealer.offer_assigned_pairs += Number(row.offer_assigned_pairs || 0);
    });

    const rows = [...products.values()]
      .map((row) => {
        const dealerDetails = [...row._dealers.values()]
          .map((dealer) => ({
            ...dealer,
            offer_not_delivered_pairs: Math.max(
              0,
              dealer.offer_ordered_pairs - dealer.offer_delivered_pairs
            ),
            offer_unused_assigned_pairs: Math.max(
              0,
              dealer.offer_assigned_pairs - dealer.offer_ordered_pairs
            ),
            regular_not_delivered_pairs: Math.max(
              0,
              dealer.regular_ordered_pairs - dealer.regular_delivered_pairs
            ),
          }))
          .sort((left, right) =>
            String(left.dealer_name).localeCompare(String(right.dealer_name), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          );
        const { _dealers, ...publicRow } = row;
        return {
          ...publicRow,
          assigned_dealer_count: dealerDetails.filter(
            (dealer) => Number(dealer.offer_assigned_pairs || 0) > 0
          ).length,
          offer_dealer_count: dealerDetails.filter(
            (dealer) => Number(dealer.offer_ordered_pairs || 0) > 0
          ).length,
          regular_dealer_count: dealerDetails.filter(
            (dealer) => Number(dealer.regular_ordered_pairs || 0) > 0
          ).length,
          dealer_details: dealerDetails,
          offer_not_delivered_pairs: Math.max(
            0,
            row.offer_ordered_pairs - row.offer_delivered_pairs
          ),
          regular_not_delivered_pairs: Math.max(
            0,
            row.regular_ordered_pairs - row.regular_delivered_pairs
          ),
          offer_unused_assigned_pairs: Math.max(
            0,
            row.offer_assigned_pairs - row.offer_ordered_pairs
          ),
        };
      })
      .sort((left, right) =>
        String(left.article_code || left.product_name).localeCompare(
          String(right.article_code || right.product_name),
          undefined,
          { numeric: true, sensitivity: 'base' }
        ) || String(left.color).localeCompare(String(right.color))
      );

    const summary = rows.reduce(
      (total, row) => {
        [
          'offer_assigned_pairs',
          'offer_ordered_pairs',
          'offer_delivered_pairs',
          'offer_not_delivered_pairs',
          'regular_ordered_pairs',
          'regular_delivered_pairs',
          'regular_not_delivered_pairs',
        ].forEach((key) => {
          total[key] += Number(row[key] || 0);
        });
        return total;
      },
      {
        offer_assigned_pairs: 0,
        offer_ordered_pairs: 0,
        offer_delivered_pairs: 0,
        offer_not_delivered_pairs: 0,
        regular_ordered_pairs: 0,
        regular_delivered_pairs: 0,
        regular_not_delivered_pairs: 0,
      }
    );

    const orderDetails = orderDetailRows.map((row) => {
      const orderedPairs = Number(row.ordered_pairs || 0);
      const deliveredPairs = Number(row.delivered_pairs || 0);
      const cancelled = String(row.order_status || '').toUpperCase() === 'CANCELLED';
      const isOffer = Number(row.is_offer || 0) === 1;
      let assignmentType = 'REGULAR';
      if (isOffer) {
        if (!Number(row.offer_campaign_id || 0)) assignmentType = 'LEGACY_OFFER';
        else if (Number(row.offer_all_users || 0) === 1) assignmentType = 'PUBLIC_OFFER';
        else if (row.assigned_pairs !== null && row.assigned_pairs !== undefined) {
          assignmentType = 'PERSONAL_ASSIGNMENT';
        } else assignmentType = 'OUTSIDE_RECORDED_ASSIGNMENT';
      }
      return {
        ...row,
        order_item_id: Number(row.order_item_id),
        order_id: Number(row.order_id),
        dealer_user_id: Number(row.dealer_user_id || 0) || null,
        finished_good_id: Number(row.finished_good_id),
        pairs_per_carton: Number(row.pairs_per_carton || 0),
        is_offer: isOffer,
        offer_campaign_id: Number(row.offer_campaign_id || 0) || null,
        assigned_pairs:
          row.assigned_pairs === null || row.assigned_pairs === undefined
            ? null
            : Number(row.assigned_pairs),
        placed_pairs: orderedPairs,
        ordered_pairs: cancelled ? 0 : orderedPairs,
        delivered_pairs: cancelled ? 0 : deliveredPairs,
        not_delivered_pairs: cancelled
          ? 0
          : Math.max(0, orderedPairs - deliveredPairs),
        cancelled_pairs: cancelled ? orderedPairs : 0,
        assignment_type: assignmentType,
      };
    });

    return res.json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        delivery_tracking: supportsDeliveryAllocations ? 'WAREHOUSE_ALLOCATIONS' : 'UNAVAILABLE',
        rows,
        order_details: orderDetails,
        summary,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE ORDER ─────────────────────────────────
const create = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('START TRANSACTION');

    const {
      customer_name,
      customer_phone,
      notes,
      pan_number,
      transport_name,
      customer_address,
    } = req.body;

    const items = normalizeItems(req.body.items);

    if (!customer_name || !items.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Customer name + items required',
      });
    }

    const duplicateConfirmed =
      req.body.confirm_duplicate === true ||
      String(req.body.confirm_duplicate || '').toLowerCase() === 'true';
    if (!duplicateConfirmed) {
      const duplicates = await findRecentExactDuplicateOrders(client, {
        createdBy: req.user.id,
        customerName: customer_name,
        customerPhone: customer_phone,
        items,
      });
      if (duplicates.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          code: 'POTENTIAL_DUPLICATE_ORDER',
          message:
            'A matching recent order already exists. Confirm only if this repeat order is intentional.',
          duplicate_window_hours: DUPLICATE_ORDER_WINDOW_HOURS,
          duplicates,
        });
      }
    }

    const productIds = [...new Set(items.map((i) => i.finished_good_id))];
    const { clause, params } = buildInClause(productIds);

    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');
    const supportsOfferAudience = await hasColumn('finished_goods', 'offer_all_users');
    const supportsOfferUsers = await hasTable('finished_good_offer_users');
    const supportsOfferUserQuantity = supportsOfferUsers
      ? await hasColumn('finished_good_offer_users', 'display_quantity')
      : false;
    const supportsOfferUserPercentage = supportsOfferUsers
      ? await hasColumn('finished_good_offer_users', 'display_percentage')
      : false;
    const supportsOfferOrderSnapshots = await hasColumn('order_items', 'ordered_from_offer');
    const supportsOfferCampaigns = await hasOfferCampaignSchema();
    const supportsRegularPriceMarkup = await hasColumn(
      'users',
      'regular_price_markup'
    );
    const supportsPercentageProductMarkup = await hasColumn(
      'users',
      'percentage_product_markup'
    );
    const supportsNonCommissionProductMarkup = await hasColumn(
      'users',
      'non_commission_product_markup'
    );
    const supportsCommissionFlag = await hasColumn(
      'finished_goods',
      'is_commission'
    );
    const supportsExchangeRate = await hasColumn(
      'users',
      'exchange_rate'
    );
    const supportsUnitPriceSnapshot = await hasColumn(
      'order_items',
      'unit_price_snapshot'
    );
    const supportsPriceCurrencySnapshot = await hasColumn(
      'order_items',
      'price_currency_snapshot'
    );
    const supportsIndiaPrice = await hasColumn(
      'finished_goods',
      'india_price'
    );
    const supportsOfferPriceAdjustments = await hasTable(
      'user_series_offer_price_adjustments'
    );
    const supportsPercentageAllocations = await hasColumn(
      'user_product_permissions',
      'allocation_quantity'
    );
    const supportsAllocationScope = supportsPercentageAllocations
      ? await hasColumn('user_product_permissions', 'allocation_scope')
      : false;
    const supportsAllocationPublication =
      supportsPercentageAllocations &&
      (await hasColumn('finished_goods', 'allocation_publication_status')) &&
      (await hasColumn('finished_goods', 'allocation_publish_at'));
    const supportsControlledRelease =
      supportsAllocationScope &&
      (await hasTable('product_controlled_release_pools')) &&
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));

    const canOrderHiddenProducts = ['ADMIN', 'CO_ADMIN'].includes(
      String(req.user.role || '').toUpperCase()
    );
    let productSql = `
      SELECT id, name, article_code, sole_code, color, quantity, price, inner_boxes_per_outer_box${supportsCommissionFlag ? ', is_commission' : ', 0 AS is_commission'}${supportsIndiaPrice ? ', india_price' : ''}${supportsDisplayQuantity ? ', display_quantity' : ''}${supportsOfferAudience ? ', offer_enabled, offer_label, offer_ends_at, offer_all_users' : ''}${supportsOfferCampaigns ? ', offer_campaign_id' : ''}
      FROM finished_goods
      WHERE is_deleted = 0
        ${
          canOrderHiddenProducts ||
          (supportsAllocationPublication &&
            ['USER', 'MEMBER', 'ELDER'].includes(req.user.role))
            ? ''
            : 'AND is_visible = 1'
        }
        AND id IN ${clause}
    `;
    const productParams = [...params];

    if (req.user.role === 'USER') {
      const normalPermissionSql = `EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = finished_goods.id
          AND upp.user_id = ?
          AND upp.can_view = 1
      ) AND NOT EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = finished_goods.id
          AND upp.user_id = ?
          AND upp.can_view = 0
      )${supportsPercentageAllocations ? supportsAllocationScope ? ` AND (
        NOT EXISTS (
          SELECT 1 FROM user_product_permissions allocated
          WHERE allocated.finished_good_id = finished_goods.id
            AND allocated.allocation_quantity IS NOT NULL
            AND COALESCE(allocated.allocation_scope, 'EXCLUSIVE') = 'EXCLUSIVE'
        )
        OR EXISTS (
          SELECT 1 FROM user_product_permissions own_allocation
          WHERE own_allocation.finished_good_id = finished_goods.id
            AND own_allocation.user_id = ?
            AND own_allocation.allocation_quantity IS NOT NULL
            AND COALESCE(own_allocation.allocation_scope, 'EXCLUSIVE') = 'EXCLUSIVE'
        )
      )` : ` AND (
        NOT EXISTS (
          SELECT 1 FROM user_product_permissions allocated
          WHERE allocated.finished_good_id = finished_goods.id
            AND allocated.allocation_quantity IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM user_product_permissions own_allocation
          WHERE own_allocation.finished_good_id = finished_goods.id
            AND own_allocation.user_id = ?
            AND own_allocation.allocation_quantity IS NOT NULL
        )
      )` : ''}${supportsAllocationPublication ? ` AND (
        (
          NOT EXISTS (
            SELECT 1 FROM user_product_permissions any_allocation
            WHERE any_allocation.finished_good_id = finished_goods.id
              AND any_allocation.allocation_quantity IS NOT NULL
          )
          AND finished_goods.is_visible = 1
        )
        OR (
          EXISTS (
            SELECT 1 FROM user_product_permissions any_allocation
            WHERE any_allocation.finished_good_id = finished_goods.id
              AND any_allocation.allocation_quantity IS NOT NULL
          )
          AND (
            COALESCE(finished_goods.allocation_publication_status, 'ACTIVE') = 'ACTIVE'
            OR (
              finished_goods.allocation_publication_status = 'SCHEDULED'
              AND finished_goods.allocation_publish_at <= NOW()
            )
          )
          AND (
            finished_goods.is_visible = 1
            OR EXISTS (
              SELECT 1 FROM user_product_permissions own_published_allocation
              WHERE own_published_allocation.finished_good_id = finished_goods.id
                AND own_published_allocation.user_id = ?
                AND own_published_allocation.allocation_quantity IS NOT NULL
            )
          )
        )
      )` : ''}`;
      if (supportsOfferAudience && supportsOfferUsers) {
        productSql += ` AND ((${normalPermissionSql}) OR (
          offer_enabled = 1
          AND (offer_ends_at IS NULL OR offer_ends_at >= NOW())
          AND (offer_all_users = 1 OR EXISTS (
            SELECT 1 FROM finished_good_offer_users fgo
            WHERE fgo.finished_good_id = finished_goods.id AND fgo.user_id = ?
          ))
        ))`;
        productParams.push(
          req.user.id,
          req.user.id,
          ...(supportsPercentageAllocations ? [req.user.id] : []),
          ...(supportsAllocationPublication ? [req.user.id] : []),
          req.user.id
        );
      } else {
        productSql += ` AND (${normalPermissionSql})`;
        productParams.push(
          req.user.id,
          req.user.id,
          ...(supportsPercentageAllocations ? [req.user.id] : []),
          ...(supportsAllocationPublication ? [req.user.id] : [])
        );
      }
    } else if (['MEMBER', 'ELDER'].includes(req.user.role)) {
      productSql += ` AND EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = finished_goods.id
          AND upp.user_id = ? AND upp.can_view = 1
      ) AND NOT EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = finished_goods.id
          AND upp.user_id = ? AND upp.can_view = 0
      )${supportsAllocationPublication ? ` AND (
        (
          NOT EXISTS (
            SELECT 1 FROM user_product_permissions any_allocation
            WHERE any_allocation.finished_good_id = finished_goods.id
              AND any_allocation.allocation_quantity IS NOT NULL
          )
          AND finished_goods.is_visible = 1
        )
        OR (
          (
            COALESCE(finished_goods.allocation_publication_status, 'ACTIVE') = 'ACTIVE'
            OR (
              finished_goods.allocation_publication_status = 'SCHEDULED'
              AND finished_goods.allocation_publish_at <= NOW()
            )
          )
          AND (
            finished_goods.is_visible = 1
            OR EXISTS (
              SELECT 1 FROM user_product_permissions own_published_allocation
              WHERE own_published_allocation.finished_good_id = finished_goods.id
                AND own_published_allocation.user_id = ?
                AND own_published_allocation.allocation_quantity IS NOT NULL
            )
          )
        )
      )` : ''}`;
      productParams.push(
        req.user.id,
        req.user.id,
        ...(supportsAllocationPublication ? [req.user.id] : [])
      );
    }

    productSql += ' FOR UPDATE';
    const products = await client.query(productSql, productParams);

    if (products.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Some products not found',
      });
    }

    const productMap = new Map(products.rows.map((p) => [p.id, p]));
    let orderCurrency = 'NPR';
    let orderExchangeRate = 1;
    let regularPriceMarkup = 0;
    let percentageProductMarkup = 0;
    let nonCommissionProductMarkup = 0;

    if (req.user.role === 'USER') {
      const pricingResult = await client.query(
        `SELECT currency_code${
          supportsExchangeRate ? ', exchange_rate' : ''
        }${
          supportsRegularPriceMarkup ? ', regular_price_markup' : ''
        }${
          supportsPercentageProductMarkup ? ', percentage_product_markup' : ''
        }${
          supportsNonCommissionProductMarkup ? ', non_commission_product_markup' : ''
        }
         FROM users
         WHERE id = ?`,
        [req.user.id]
      );
      const pricing = pricingResult.rows[0] || {};
      orderCurrency = String(pricing.currency_code || 'NPR').toUpperCase();
      orderExchangeRate = Math.max(0.000001, Number(pricing.exchange_rate || 1));
      regularPriceMarkup =
        supportsRegularPriceMarkup && orderCurrency === 'NPR'
          ? Math.max(0, Number(pricing.regular_price_markup || 0))
          : 0;
      percentageProductMarkup =
        orderCurrency === 'NPR'
          ? Math.max(
              0,
              Number(
                supportsPercentageProductMarkup
                  ? pricing.percentage_product_markup
                  : regularPriceMarkup
              ) || 0
            )
          : 0;
      nonCommissionProductMarkup =
        orderCurrency === 'NPR'
          ? Math.max(
              0,
              Number(
                supportsNonCommissionProductMarkup
                  ? pricing.non_commission_product_markup
                  : regularPriceMarkup
              ) || 0
            )
          : 0;
    }

    const userSeriesOfferAdjustments =
      req.user.role === 'USER' && supportsOfferPriceAdjustments
        ? await loadUserSeriesOfferAdjustments(
            (sql, values) => client.query(sql, values),
            req.user.id
          )
        : new Map();

    const getBaseOrderUnitPrice = (product) => {
      if (orderCurrency === 'INR') {
        return getIndiaPriceFromNepalPrice(product?.price);
      }

      const nprPrice = Number(product?.price);
      if (!Number.isFinite(nprPrice)) return null;
      return orderCurrency === 'NPR'
        ? nprPrice
        : nprPrice / orderExchangeRate;
    };

    let userOfferTargets = new Map();
    if (req.user.role === 'USER' && supportsOfferAudience && supportsOfferUsers && supportsOfferUserQuantity) {
      const targetRows = await client.query(
        `SELECT finished_good_id, display_quantity${supportsOfferUserPercentage ? ', display_percentage' : ''}
         FROM finished_good_offer_users
         WHERE user_id = ? AND finished_good_id IN ${clause}`,
        [req.user.id, ...params]
      );
      userOfferTargets = new Map(targetRows.rows.map((row) => [Number(row.finished_good_id), {
        display_quantity: Number(row.display_quantity),
        display_percentage: supportsOfferUserPercentage && row.display_percentage !== null ? Number(row.display_percentage) : null,
      }]));
    }

    let userPercentageAllocations = new Map();
    if (req.user.role === 'USER' && supportsPercentageAllocations) {
      const allocationRows = await client.query(
        `SELECT upp.finished_good_id,
                upp.allocation_quantity,
                upp.allocation_percentage,
                upp.allocation_started_at,
                ${supportsAllocationScope ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE')" : "'EXCLUSIVE'"} AS allocation_scope,
                COALESCE(SUM(${
                  supportsControlledRelease
                    ? `CASE
                         WHEN upp.allocation_scope = 'CONTROLLED'
                           THEN oi.controlled_personal_quantity
                         ELSE oi.qty_ordered
                       END`
                    : 'oi.qty_ordered'
                }), 0) AS used_quantity
         FROM user_product_permissions upp
         ${supportsControlledRelease ? 'LEFT JOIN product_controlled_release_pools controlled_pool ON controlled_pool.finished_good_id = upp.finished_good_id' : ''}
         LEFT JOIN orders o
           ON o.created_by = upp.user_id
          AND o.status <> 'CANCELLED'
          AND ${
            supportsControlledRelease
              ? `(
                   (upp.allocation_scope = 'CONTROLLED' AND o.created_at >= controlled_pool.created_at)
                   OR (COALESCE(upp.allocation_scope, 'EXCLUSIVE') <> 'CONTROLLED'
                     AND o.created_at >= upp.allocation_started_at)
                 )`
              : 'o.created_at >= upp.allocation_started_at'
          }
         LEFT JOIN order_items oi
           ON oi.order_id = o.id
          AND oi.finished_good_id = upp.finished_good_id
          ${supportsOfferOrderSnapshots ? supportsAllocationScope ? "AND (COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED' OR COALESCE(oi.ordered_from_offer, 0) = 0)" : 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
         WHERE upp.user_id = ?
           AND upp.allocation_quantity IS NOT NULL
           AND upp.finished_good_id IN ${clause}
         GROUP BY upp.finished_good_id, upp.allocation_quantity,
                  upp.allocation_percentage, upp.allocation_started_at${supportsAllocationScope ? ', upp.allocation_scope' : ''}`,
        [req.user.id, ...params]
      );
      userPercentageAllocations = new Map(
        allocationRows.rows.map((row) => {
          const assignedQuantity = Number(row.allocation_quantity || 0);
          const usedQuantity = Number(row.used_quantity || 0);
          return [
            Number(row.finished_good_id),
            {
              assigned_quantity: assignedQuantity,
              used_quantity: usedQuantity,
              remaining_quantity: Math.max(
                0,
                assignedQuantity - usedQuantity
              ),
              scope: String(row.allocation_scope || 'EXCLUSIVE').toUpperCase(),
            },
          ];
        })
      );
    }

    const privateAllocationSummary = new Map();
    if (req.user.role === 'USER' && supportsAllocationScope) {
      const privateRows = await client.query(
        `SELECT upp.finished_good_id, upp.user_id,
                upp.allocation_quantity,
                COALESCE(SUM(oi.qty_ordered), 0) AS used_quantity
         FROM user_product_permissions upp
         LEFT JOIN orders o
           ON o.created_by = upp.user_id
          AND o.status <> 'CANCELLED'
          AND o.created_at >= upp.allocation_started_at
         LEFT JOIN order_items oi
           ON oi.order_id = o.id
          AND oi.finished_good_id = upp.finished_good_id
          ${supportsOfferOrderSnapshots ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
         WHERE upp.allocation_scope = 'PRIVATE'
           AND upp.allocation_quantity IS NOT NULL
           AND upp.finished_good_id IN ${clause}
         GROUP BY upp.finished_good_id, upp.user_id, upp.allocation_quantity`,
        params
      );
      privateRows.rows.forEach((row) => {
        const productId = Number(row.finished_good_id);
        const remaining = Math.max(
          0,
          Number(row.allocation_quantity || 0) - Number(row.used_quantity || 0)
        );
        privateAllocationSummary.set(
          productId,
          Number(privateAllocationSummary.get(productId) || 0) + remaining
        );
      });
    }

    const controlledReleaseByProduct = new Map();
    if (req.user.role === 'USER' && supportsControlledRelease) {
      const controlledProducts = await client.query(
        `SELECT DISTINCT upp.finished_good_id
         FROM user_product_permissions upp
         WHERE upp.allocation_scope = 'CONTROLLED'
           AND upp.finished_good_id IN ${clause}
         UNION
         SELECT pool.finished_good_id
         FROM product_controlled_release_pools pool
         WHERE pool.finished_good_id IN ${clause}`,
        [...params, ...params]
      );
      const poolRows = await client.query(
        `SELECT * FROM product_controlled_release_pools
         WHERE finished_good_id IN ${clause}
         FOR UPDATE`,
        params
      );
      const poolByProduct = new Map(
        poolRows.rows.map((row) => [Number(row.finished_good_id), row])
      );
      const personalRows = await client.query(
        `SELECT finished_good_id, allocation_quantity
         FROM user_product_permissions
         WHERE user_id = ?
           AND allocation_scope = 'CONTROLLED'
           AND finished_good_id IN ${clause}`,
        [req.user.id, ...params]
      );
      const personalByProduct = new Map(
        personalRows.rows.map((row) => [
          Number(row.finished_good_id),
          Number(row.allocation_quantity || 0),
        ])
      );
      const usageRows = await client.query(
        `SELECT oi.finished_good_id,
                COALESCE(SUM(CASE WHEN o.created_by = ?
                  THEN oi.controlled_personal_quantity ELSE 0 END), 0) AS personal_used,
                COALESCE(SUM(oi.controlled_public_quantity), 0) AS public_used
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN product_controlled_release_pools pool
           ON pool.finished_good_id = oi.finished_good_id
          AND o.created_at >= pool.created_at
         WHERE o.status <> 'CANCELLED'
           AND oi.finished_good_id IN ${clause}
         GROUP BY oi.finished_good_id`,
        [req.user.id, ...params]
      );
      const usageByProduct = new Map(
        usageRows.rows.map((row) => [Number(row.finished_good_id), row])
      );
      controlledProducts.rows.forEach((row) => {
        const productId = Number(row.finished_good_id);
        const usage = usageByProduct.get(productId) || {};
        const personalQuantity = Number(personalByProduct.get(productId) || 0);
        const personalUsed = Number(usage.personal_used || 0);
        const publicQuantity = Number(
          poolByProduct.get(productId)?.public_quantity || 0
        );
        const publicUsed = Number(usage.public_used || 0);
        controlledReleaseByProduct.set(productId, {
          personal_remaining: Math.max(0, personalQuantity - personalUsed),
          public_remaining: Math.max(0, publicQuantity - publicUsed),
        });
      });
    }

    const reserved = await getReservedByProduct(
      (sql, params) => client.query(sql, params),
      productIds
    );

    const requested = new Map();
    for (const i of items) {
      requested.set(
        i.finished_good_id,
        (requested.get(i.finished_good_id) || 0) + i.qty_ordered
      );
    }

    const activeOfferProducts =
      req.user.role === 'USER'
        ? products.rows.filter(isActiveOfferProduct)
        : [];
    if (activeOfferProducts.length && !supportsOfferCampaigns) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message:
          'Cumulative offer limits require sql/add-offer-campaign-allowances.sql.',
      });
    }
    if (
      activeOfferProducts.some(
        (product) => Number(product.offer_campaign_id || 0) <= 0
      )
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          'This offer does not have an active offer period. Ask an admin to remove and publish the offer again.',
      });
    }

    const campaignUsage =
      req.user.role === 'USER' && supportsOfferCampaigns
        ? await getOfferCampaignUsage((sql, values) => client.query(sql, values), {
            campaignIds: activeOfferProducts.map(
              (product) => product.offer_campaign_id
            ),
            userId: req.user.id,
          })
        : new Map();

    // Availability check — mirrors getAvailability exactly
    const shortages = [];
    const controlledSplitByProduct = new Map();
    for (const [id, qty] of requested.entries()) {
      const p = productMap.get(id);
      const physicalStock = Number(p.quantity ?? 0);
      const reservedQty = reserved.get(id) || 0;
      const available = Math.max(0, physicalStock - reservedQty);
      const displayQuantity = supportsDisplayQuantity
        ? getProductDisplayQuantity(p)
        : DEFAULT_DISPLAY_QUANTITY;
      const userOfferTarget = userOfferTargets.get(Number(id));
      const offerIsActive = isActiveOfferProduct(p);
      const percentageAllocation = userPercentageAllocations.get(Number(id));
      const controlledRelease = controlledReleaseByProduct.get(Number(id));
      const privateRemaining = Number(
        privateAllocationSummary.get(Number(id)) || 0
      );
      const publicAvailable = Math.max(0, available - privateRemaining);
      const privateUserLimit =
        percentageAllocation?.scope === 'PRIVATE'
          ? Math.min(displayQuantity, publicAvailable) +
            percentageAllocation.remaining_quantity
          : null;
      const privateAccessibleAvailable = Math.min(
        available,
        publicAvailable +
          (percentageAllocation?.scope === 'PRIVATE'
            ? percentageAllocation.remaining_quantity
            : 0)
      );
      const effectiveDisplayQuantity =
        req.user.role === 'USER' &&
        offerIsActive &&
        Number(p.offer_all_users) !== 1 &&
        userOfferTarget != null
          ? userOfferTarget.display_quantity
          : req.user.role === 'USER' &&
              !offerIsActive &&
              percentageAllocation
            ? privateUserLimit ?? percentageAllocation.remaining_quantity
            : Math.min(displayQuantity, publicAvailable);
      const usedOfferQuantity =
        req.user.role === 'USER' && offerIsActive
          ? Number(campaignUsage.get(Number(p.offer_campaign_id)) || 0)
          : 0;
      const remainingDisplayQuantity =
        req.user.role === 'USER' && offerIsActive
          ? Math.max(0, effectiveDisplayQuantity - usedOfferQuantity)
          : effectiveDisplayQuantity;

      // Admin and co-admin orders use the real unreserved stock. Customer-facing
      // display/offer limits apply only when a USER places their own order.
      const orderableAvailable = controlledRelease
        ? Math.min(
            available,
            controlledRelease.personal_remaining +
              controlledRelease.public_remaining
          )
        : req.user.role === 'USER'
          ? Math.min(remainingDisplayQuantity, privateAccessibleAvailable)
          : available;

      if (controlledRelease && qty <= orderableAvailable) {
        const personalQuantity = Math.min(
          qty,
          controlledRelease.personal_remaining
        );
        controlledSplitByProduct.set(Number(id), {
          personal_quantity: personalQuantity,
          public_quantity: qty - personalQuantity,
        });
      }

      if (qty > orderableAvailable) {
        shortages.push({
          finished_good_id: id,
          product_name: p.name,
          requested: qty,
          available: orderableAvailable,
        });
      }
    }

    if (shortages.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: 'Insufficient stock',
        shortages,
      });
    }

    const offerSnapshotByProduct = new Map();
    if (req.user.role === 'USER') {
      products.rows.forEach((product) => {
        const target = userOfferTargets.get(Number(product.id));
        const eligible = isActiveOfferProduct(product) && (Number(product.offer_all_users) === 1 || Boolean(target));
        if (!eligible) return;
        const baseOfferPrice = getBaseOrderUnitPrice(product);
        offerSnapshotByProduct.set(Number(product.id), {
          offer_label_snapshot: product.offer_label || 'Special offer',
          offer_display_percentage: target?.display_percentage ?? null,
          offer_display_quantity: target?.display_quantity ?? getProductDisplayQuantity(product),
          offer_price_snapshot: getEffectiveOfferPrice(
            baseOfferPrice,
            product.sole_code,
            userSeriesOfferAdjustments
          ),
          offer_pairs_per_carton_snapshot: Number(product.inner_boxes_per_outer_box || 0) || null,
          offer_campaign_id: Number(product.offer_campaign_id),
        });
      });
    }
    if (offerSnapshotByProduct.size && !supportsOfferOrderSnapshots) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Offer purchase tracking requires sql/add-offer-order-snapshots.sql.' });
    }

    const orderInsert = await appendFiscalInsertFields(
      'orders',
      ['customer_name', 'customer_phone', 'notes', 'pan_number', 'transport_name', 'customer_address', 'created_by'],
      [
        customer_name,
        customer_phone || null,
        notes || null,
        pan_number || null,
        transport_name || null,
        customer_address || null,
        req.user.id,
      ]
    );
    const orderRes = await client.query(
      `INSERT INTO orders (${orderInsert.columns.join(', ')})
       VALUES (${orderInsert.columns.map(() => '?').join(', ')})`,
      orderInsert.values
    );

    const orderId = orderRes.insertId;

    if (!orderId) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Failed to create order',
      });
    }

    for (const item of items) {
      const offerSnapshot = offerSnapshotByProduct.get(Number(item.finished_good_id));
      const product = productMap.get(Number(item.finished_good_id));
      const baseUnitPrice = getBaseOrderUnitPrice(product);
      const unitPriceSnapshot = offerSnapshot
        ? offerSnapshot.offer_price_snapshot
        : Number(baseUnitPrice) > 0
          ? baseUnitPrice +
            (Number(product?.is_commission || 0) === 1
              ? percentageProductMarkup
              : nonCommissionProductMarkup)
          : null;
      const orderItemColumns = ['order_id', 'finished_good_id', 'qty_ordered'];
      const orderItemValues = [orderId, item.finished_good_id, item.qty_ordered];
      if (supportsControlledRelease) {
        const controlledSplit = controlledSplitByProduct.get(
          Number(item.finished_good_id)
        );
        orderItemColumns.push(
          'controlled_personal_quantity',
          'controlled_public_quantity'
        );
        orderItemValues.push(
          Number(controlledSplit?.personal_quantity || 0),
          Number(controlledSplit?.public_quantity || 0)
        );
      }
      if (supportsOfferOrderSnapshots) {
        orderItemColumns.push('ordered_from_offer', 'offer_label_snapshot', 'offer_display_percentage', 'offer_display_quantity', 'offer_price_snapshot', 'offer_pairs_per_carton_snapshot');
        orderItemValues.push(offerSnapshot ? 1 : 0, offerSnapshot?.offer_label_snapshot ?? null, offerSnapshot?.offer_display_percentage ?? null, offerSnapshot?.offer_display_quantity ?? null, offerSnapshot?.offer_price_snapshot ?? null, offerSnapshot?.offer_pairs_per_carton_snapshot ?? null);
      }
      if (supportsOfferCampaigns) {
        orderItemColumns.push('offer_campaign_id');
        orderItemValues.push(offerSnapshot?.offer_campaign_id ?? null);
      }
      if (supportsUnitPriceSnapshot) {
        orderItemColumns.push('unit_price_snapshot');
        orderItemValues.push(unitPriceSnapshot);
      }
      if (supportsPriceCurrencySnapshot) {
        orderItemColumns.push('price_currency_snapshot');
        orderItemValues.push(unitPriceSnapshot === null ? null : orderCurrency);
      }
      const orderItemInsert = await appendFiscalInsertFields(
        'order_items',
        orderItemColumns,
        orderItemValues
      );
      await client.query(
        `INSERT INTO order_items (${orderItemInsert.columns.join(', ')})
         VALUES (${orderItemInsert.columns.map(() => '?').join(', ')})`,
        orderItemInsert.values
      );
    }

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'ORDER_PLACED',
      module: 'orders',
      entity_type: 'order',
      entity_id: orderId,
      entityName: getOrderEntityName({ id: orderId, customer_name }),
      description: `Placed order #${orderId} for ${customer_name}`,
      metadata: {
        order_number: orderId,
        customer_name,
        status: 'PENDING',
        items: items.map((item) => ({
          ...item,
          product_name: productMap.get(item.finished_good_id)?.name,
          article_code: productMap.get(item.finished_good_id)?.article_code,
          color: productMap.get(item.finished_good_id)?.color,
        })),
      },
    });

    return res.status(201).json({ success: true, data: { id: orderId } });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.shortage ? { shortages: [err.shortage] } : {}),
      });
    }
    next(err);
  } finally {
    client.release();
  }
};

// ─── CORRECT PENDING / CONFIRMED ORDER ─────────────────────────────────────
const correctItems = async (req, res, next) => {
  const client = await getClient();
  try {
    if (!canCorrectOrders(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to correct order cartons.',
      });
    }

    await client.query('START TRANSACTION');
    const reason = String(req.body.reason || '').trim();
    const requestedRows = Array.isArray(req.body.items) ? req.body.items : [];
    if (!reason || !requestedRows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: !reason ? 'Correction reason is required.' : 'An order must contain at least one product.' });
    }

    const orderResult = await client.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (!['PENDING', 'CONFIRMED'].includes(String(order.status).toUpperCase())) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only pending or confirmed orders can be corrected.' });
    }

    const oldItemsResult = await client.query(
      `SELECT oi.*, fg.name AS product_name, fg.article_code, fg.color, fg.inner_boxes_per_outer_box
       FROM order_items oi JOIN finished_goods fg ON fg.id = oi.finished_good_id
       WHERE oi.order_id = ? FOR UPDATE`,
      [order.id]
    );
    const productIds = [...new Set(requestedRows.map((row) => Number(row.finished_good_id)).filter((id) => id > 0))];
    if (!productIds.length || productIds.length !== requestedRows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Each corrected row must contain a different valid product.' });
    }

    const { clause, params } = buildInClause(productIds);
    const supportsCommissionFlag = await hasColumn(
      'finished_goods',
      'is_commission'
    );
    const productsResult = await client.query(
      `SELECT id, name, article_code, color, quantity, price, inner_boxes_per_outer_box,
              ${supportsCommissionFlag ? 'is_commission' : '0 AS is_commission'}
       FROM finished_goods WHERE id IN ${clause} FOR UPDATE`,
      params
    );
    if (productsResult.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'One or more products were not found.' });
    }

    const productsById = new Map(productsResult.rows.map((product) => [Number(product.id), product]));
    const correctedItems = [];
    for (const row of requestedRows) {
      const product = productsById.get(Number(row.finished_good_id));
      const cartons = Number(row.carton_qty);
      const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
      if (!Number.isInteger(cartons) || cartons < 1 || pairsPerCarton <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: !Number.isInteger(cartons) || cartons < 1 ? `${product.name} carton quantity must be a whole number greater than zero.` : `${product.name} does not have pairs per carton configured.` });
      }
      correctedItems.push({ finished_good_id: Number(product.id), carton_qty: cartons, qty_ordered: cartons * pairsPerCarton, product });
    }

    const reserved = await getReservedByProduct((sql, values) => client.query(sql, values), productIds);
    const oldQtyByProduct = new Map(oldItemsResult.rows.map((item) => [Number(item.finished_good_id), Number(item.qty_ordered || 0)]));
    const shortages = correctedItems.filter((item) => {
      const reservedByOthers = Math.max(0, (reserved.get(item.finished_good_id) || 0) - (oldQtyByProduct.get(item.finished_good_id) || 0));
      return item.qty_ordered > Math.max(0, Number(item.product.quantity || 0) - reservedByOthers);
    });
    if (shortages.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, message: 'Insufficient stock for this correction.', shortages: shortages.map((item) => ({ product_name: item.product.name, requested: item.qty_ordered })) });
    }

    const supportsOfferOrderSnapshots = await hasColumn('order_items', 'ordered_from_offer');
    const supportsOfferCampaigns = await hasOfferCampaignSchema();
    const supportsRegularPriceMarkup = await hasColumn(
      'users',
      'regular_price_markup'
    );
    const supportsPercentageProductMarkup = await hasColumn(
      'users',
      'percentage_product_markup'
    );
    const supportsNonCommissionProductMarkup = await hasColumn(
      'users',
      'non_commission_product_markup'
    );
    const supportsUnitPriceSnapshot = await hasColumn(
      'order_items',
      'unit_price_snapshot'
    );
    const supportsPriceCurrencySnapshot = await hasColumn(
      'order_items',
      'price_currency_snapshot'
    );
    const supportsControlledRelease =
      (await hasColumn('user_product_permissions', 'allocation_scope')) &&
      (await hasTable('product_controlled_release_pools')) &&
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));
    let correctionRegularMarkup = 0;
    let correctionPercentageProductMarkup = 0;
    let correctionNonCommissionProductMarkup = 0;
    let correctionCurrency = 'NPR';
    if (supportsRegularPriceMarkup) {
      const pricingResult = await client.query(
        `SELECT currency_code, regular_price_markup
                ${supportsPercentageProductMarkup ? ', percentage_product_markup' : ''}
                ${supportsNonCommissionProductMarkup ? ', non_commission_product_markup' : ''}
         FROM users
         WHERE id = ?`,
        [order.created_by]
      );
      const pricing = pricingResult.rows[0] || {};
      correctionCurrency = String(pricing.currency_code || 'NPR').toUpperCase();
      if (correctionCurrency === 'NPR') {
        correctionRegularMarkup = Math.max(
          0,
          Number(pricing.regular_price_markup || 0)
        );
        correctionPercentageProductMarkup = Math.max(
          0,
          Number(
            supportsPercentageProductMarkup
              ? pricing.percentage_product_markup
              : correctionRegularMarkup
          ) || 0
        );
        correctionNonCommissionProductMarkup = Math.max(
          0,
          Number(
            supportsNonCommissionProductMarkup
              ? pricing.non_commission_product_markup
              : correctionRegularMarkup
          ) || 0
        );
      }
    }
    const oldItemByProduct = new Map(oldItemsResult.rows.map((item) => [Number(item.finished_good_id), item]));
    const controlledCorrectionSplit = new Map();
    if (supportsControlledRelease) {
      const poolRows = await client.query(
        `SELECT * FROM product_controlled_release_pools
         WHERE finished_good_id IN ${clause}
         FOR UPDATE`,
        params
      );
      const poolByProduct = new Map(
        poolRows.rows.map((row) => [Number(row.finished_good_id), row])
      );
      if (poolByProduct.size) {
        const personalRows = await client.query(
          `SELECT finished_good_id, allocation_quantity
           FROM user_product_permissions
           WHERE user_id = ?
             AND allocation_scope = 'CONTROLLED'
             AND finished_good_id IN ${clause}`,
          [order.created_by, ...params]
        );
        const personalByProduct = new Map(
          personalRows.rows.map((row) => [
            Number(row.finished_good_id),
            Number(row.allocation_quantity || 0),
          ])
        );
        const usageRows = await client.query(
          `SELECT oi.finished_good_id,
                  COALESCE(SUM(CASE WHEN o.created_by = ?
                    THEN oi.controlled_personal_quantity ELSE 0 END), 0) AS personal_used,
                  COALESCE(SUM(oi.controlled_public_quantity), 0) AS public_used
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN product_controlled_release_pools pool
             ON pool.finished_good_id = oi.finished_good_id
            AND o.created_at >= pool.created_at
           WHERE o.status <> 'CANCELLED'
             AND o.id <> ?
             AND oi.finished_good_id IN ${clause}
           GROUP BY oi.finished_good_id`,
          [order.created_by, order.id, ...params]
        );
        const usageByProduct = new Map(
          usageRows.rows.map((row) => [Number(row.finished_good_id), row])
        );
        const controlledShortages = [];
        correctedItems.forEach((item) => {
          const pool = poolByProduct.get(item.finished_good_id);
          if (!pool) return;
          const usage = usageByProduct.get(item.finished_good_id) || {};
          const personalRemaining = Math.max(
            0,
            Number(personalByProduct.get(item.finished_good_id) || 0) -
              Number(usage.personal_used || 0)
          );
          const publicRemaining = Math.max(
            0,
            Number(pool.public_quantity || 0) -
              Number(usage.public_used || 0)
          );
          if (item.qty_ordered > personalRemaining + publicRemaining) {
            controlledShortages.push({
              product_name: item.product.name,
              requested: item.qty_ordered,
              available: personalRemaining + publicRemaining,
            });
            return;
          }
          const personalQuantity = Math.min(
            item.qty_ordered,
            personalRemaining
          );
          controlledCorrectionSplit.set(item.finished_good_id, {
            personal_quantity: personalQuantity,
            public_quantity: item.qty_ordered - personalQuantity,
          });
        });
        if (controlledShortages.length) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            success: false,
            message:
              'This correction exceeds the customer’s controlled-release balance.',
            shortages: controlledShortages,
          });
        }
      }
    }
    if (supportsOfferCampaigns) {
      const campaignIds = correctedItems
        .map((item) => oldItemByProduct.get(item.finished_good_id)?.offer_campaign_id)
        .filter(Boolean);
      const campaignUsage = await getOfferCampaignUsage(
        (sql, values) => client.query(sql, values),
        {
          campaignIds,
          userId: order.created_by,
          excludeOrderId: order.id,
        }
      );
      const uniqueCampaignIds = [
        ...new Set(campaignIds.map(Number).filter((id) => id > 0)),
      ];
      let currentAssignmentByCampaign = new Map();
      if (uniqueCampaignIds.length) {
        const assignmentRows = await client.query(
          `SELECT campaign_id, display_quantity
           FROM finished_good_offer_campaign_users
           WHERE user_id = ?
             AND campaign_id IN (${uniqueCampaignIds.map(() => '?').join(',')})`,
          [order.created_by, ...uniqueCampaignIds]
        );
        currentAssignmentByCampaign = new Map(
          assignmentRows.rows.map((row) => [
            Number(row.campaign_id),
            Number(row.display_quantity || 0),
          ])
        );
      }
      const allowanceShortages = correctedItems
        .map((item) => {
          const oldItem = oldItemByProduct.get(item.finished_good_id);
          if (
            Number(oldItem?.ordered_from_offer || 0) !== 1 ||
            Number(oldItem?.offer_campaign_id || 0) <= 0
          ) {
            return null;
          }
          const assignedQuantity = Number(
            currentAssignmentByCampaign.get(Number(oldItem.offer_campaign_id)) ??
              oldItem.offer_display_quantity ??
              0
          );
          const usedByOtherOrders = Number(
            campaignUsage.get(Number(oldItem.offer_campaign_id)) || 0
          );
          const remainingQuantity = Math.max(
            0,
            assignedQuantity - usedByOtherOrders
          );
          return item.qty_ordered > remainingQuantity
            ? {
                product_name: item.product.name,
                requested: item.qty_ordered,
                available: remainingQuantity,
              }
            : null;
        })
        .filter(Boolean);

      if (allowanceShortages.length) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          message:
            'This correction exceeds the customer’s remaining offer allowance.',
          shortages: allowanceShortages,
        });
      }
    }
    // Confirmed orders may already have a warehouse plan because their DN was
    // previewed. Remove that plan before replacing the order items; a fresh
    // plan will be created when the corrected DN is prepared or packed.
    await releasePlannedWarehouseAllocations(client, order.id, true);
    await client.query('DELETE FROM order_items WHERE order_id = ?', [order.id]);
    for (const item of correctedItems) {
      const columns = ['order_id', 'finished_good_id', 'qty_ordered'];
      const values = [order.id, item.finished_good_id, item.qty_ordered];
      const oldItem = oldItemByProduct.get(Number(item.finished_good_id));
      if (supportsControlledRelease) {
        const split = controlledCorrectionSplit.get(item.finished_good_id);
        columns.push(
          'controlled_personal_quantity',
          'controlled_public_quantity'
        );
        values.push(
          Number(split?.personal_quantity || 0),
          Number(split?.public_quantity || 0)
        );
      }
      if (supportsOfferOrderSnapshots) {
        columns.push('ordered_from_offer', 'offer_label_snapshot', 'offer_display_percentage', 'offer_display_quantity', 'offer_price_snapshot', 'offer_pairs_per_carton_snapshot');
        values.push(
          Number(oldItem?.ordered_from_offer || 0),
          oldItem?.offer_label_snapshot ?? null,
          oldItem?.offer_display_percentage ?? null,
          oldItem?.offer_display_quantity ?? null,
          oldItem?.offer_price_snapshot ?? null,
          oldItem?.offer_pairs_per_carton_snapshot ?? null
        );
      }
      if (supportsOfferCampaigns) {
        columns.push('offer_campaign_id');
        values.push(oldItem?.offer_campaign_id ?? null);
      }
      if (supportsUnitPriceSnapshot) {
        const basePrice =
          correctionCurrency === 'INR'
            ? getIndiaPriceFromNepalPrice(item.product.price)
            : Number(item.product.price);
        const fallbackPrice =
          Number(oldItem?.ordered_from_offer || 0) === 1
            ? oldItem?.offer_price_snapshot
            : basePrice > 0
              ? basePrice +
                (Number(item.product?.is_commission || 0) === 1
                  ? correctionPercentageProductMarkup
                  : correctionNonCommissionProductMarkup)
              : null;
        columns.push('unit_price_snapshot');
        values.push(oldItem?.unit_price_snapshot ?? fallbackPrice ?? null);
      }
      if (supportsPriceCurrencySnapshot) {
        columns.push('price_currency_snapshot');
        values.push(oldItem?.price_currency_snapshot ?? correctionCurrency);
      }
      const insert = await appendFiscalInsertFields('order_items', columns, values);
      await client.query(`INSERT INTO order_items (${insert.columns.join(', ')}) VALUES (${insert.columns.map(() => '?').join(', ')})`, insert.values);
    }
    if (
      String(order.status || '').toUpperCase() === 'CONFIRMED' &&
      (await hasTable('order_warehouse_delivery_notes'))
    ) {
      await ensurePlannedWarehouseAllocations(client, order.id, req.user.id);
      await ensureWarehouseDeliveryNotes(client, order, req.user.id);
    }
    await client.query('UPDATE orders SET updated_at = NOW() WHERE id = ?', [order.id]);
    await client.query('COMMIT');
    clearCache();

    const before = oldItemsResult.rows.map((item) => ({ finished_good_id: Number(item.finished_good_id), product_name: item.product_name, qty_ordered: Number(item.qty_ordered), carton_qty: Number(item.inner_boxes_per_outer_box) > 0 ? Number(item.qty_ordered) / Number(item.inner_boxes_per_outer_box) : null }));
    const after = correctedItems.map((item) => ({ finished_good_id: item.finished_good_id, product_name: item.product.name, qty_ordered: item.qty_ordered, carton_qty: item.carton_qty }));
    await auditLog({ ...getActor(req), actionType: 'UPDATE', module: 'orders', entity_type: 'order', entity_id: order.id, entityName: getOrderEntityName(order), description: `Corrected items for ${getOrderEntityName(order)}: ${reason}`, metadata: { reason, status: order.status, before, after } });
    return res.json({ success: true, message: 'Order corrected and reserved stock updated.', data: { id: order.id, before, after } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// ─── UPDATE STATUS ────────────────────────────────
const updateStatus = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('START TRANSACTION');

    const status = String(req.body.status || '').toUpperCase();

    if (!ALL_STATUSES.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const cancellationReason = String(req.body.cancellation_reason || '').trim();
    const cancellationCode = String(
      req.body.cancellation_code || 'OTHER'
    ).trim().toUpperCase();
    const duplicateOfOrderId = Number(req.body.duplicate_of_order_id || 0);

    if (status === 'CANCELLED' && !cancellationReason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required',
      });
    }
    if (status === 'CANCELLED' && !CANCELLATION_CODES.has(cancellationCode)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Select a valid cancellation category',
      });
    }

    const { clause: idClause, params: idParams } = buildInClause([req.params.id]);
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id IN ${idClause} FOR UPDATE`,
      idParams
    );

    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderRes.rows[0];
    const supportsPerWarehouseDeliveryNotes = await hasTable(
      'order_warehouse_delivery_notes'
    );
    let statusWarehouseDeliveryNotes = [];

    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot change a ${order.status.toLowerCase()} order`,
      });
    }

    const currentStatus = String(order.status || '').toUpperCase();
    const allowedTransitions = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PACKED', 'CANCELLED'],
      PACKED: ['DELIVERED', 'CANCELLED'],
    };
    if (!(allowedTransitions[currentStatus] || []).includes(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Order must follow the workflow: Pending → Confirmed → Packed → Delivered. Cannot change ${currentStatus || 'UNKNOWN'} directly to ${status}.`,
      });
    }

    const supportsWarehouseAllocationStatus = await hasColumn(
      'order_item_warehouse_allocations',
      'allocation_status'
    );
    if (
      supportsWarehouseAllocationStatus &&
      ['CANCELLED', 'DELIVERED'].includes(status)
    ) {
      const deliveredAllocationResult = await client.query(
        `SELECT COUNT(*) AS delivered_allocations
         FROM order_item_warehouse_allocations allocation
         JOIN order_items item ON item.id = allocation.order_item_id
         WHERE item.order_id = ?
           AND allocation.allocation_status = 'DEDUCTED'`,
        [order.id]
      );
      const hasPartialDelivery =
        Number(deliveredAllocationResult.rows[0]?.delivered_allocations || 0) > 0;

      if (hasPartialDelivery && status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message:
            'A warehouse slip has already been delivered. The master order cannot be cancelled; deliver or separately resolve the remaining warehouse slips.',
        });
      }
      if (hasPartialDelivery && status === 'DELIVERED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message:
            'This order is partially delivered. Use the Deliver button on each remaining warehouse slip.',
        });
      }
    }

    // Track who performed each action
    let updateFields = ['status = ?', 'updated_at = NOW()'];
    let updateParams = [status];

    // Any order that has reached confirmation or beyond must have complete
    // confirmation metadata. This also repairs older confirmed orders whose DN
    // was missed by an earlier backend version.
    if (['CONFIRMED', 'PACKED', 'DELIVERED'].includes(status)) {
      if (!order.confirmed_by) {
        updateFields.push('confirmed_by = ?');
        updateParams.push(req.user.id);
      }
      if (!order.confirmed_at) {
        updateFields.push('confirmed_at = NOW()');
      }
      if (!order.delivery_note_number && !supportsPerWarehouseDeliveryNotes) {
        const nextDN = await getNextDeliveryNoteNumber(client, order.created_at ? new Date(order.created_at) : new Date());
        updateFields.push('delivery_note_number = ?');
        updateParams.push(nextDN);
      }
    }

    if (status === 'PACKED' && !order.packed_by) {
      updateFields.push('packed_by = ?', 'packed_at = NOW()');
      updateParams.push(req.user.id);
    } else if (status === 'DELIVERED' && !order.delivered_by) {
      updateFields.push(
        'delivered_by = ?',
        'delivered_at = NOW()',
        'stock_deducted = 1'
      );
      updateParams.push(req.user.id);
    }
    if (status === 'CANCELLED') {
      updateFields.push('cancellation_reason = ?');
      updateParams.push(cancellationReason);
      const [supportsCancellationCode, supportsDuplicateOrderLink] =
        await Promise.all([
          hasColumn('orders', 'cancellation_code'),
          hasColumn('orders', 'duplicate_of_order_id'),
        ]);
      if (supportsCancellationCode) {
        updateFields.push('cancellation_code = ?');
        updateParams.push(cancellationCode);
      }
      if (
        supportsDuplicateOrderLink &&
        cancellationCode === 'DUPLICATE_ORDER' &&
        Number.isInteger(duplicateOfOrderId) &&
        duplicateOfOrderId > 0
      ) {
        if (duplicateOfOrderId === Number(order.id)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'A duplicate order cannot reference itself',
          });
        }
        const originalOrder = await client.query(
          'SELECT id FROM orders WHERE id = ? LIMIT 1',
          [duplicateOfOrderId]
        );
        if (!originalOrder.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'The original order number was not found',
          });
        }
        updateFields.push('duplicate_of_order_id = ?');
        updateParams.push(duplicateOfOrderId);
      }
    }

    // Packing fixes the exact source warehouse without deducting stock yet.
    // Delivery later consumes this same plan, so the printed copies and stock
    // ledger cannot silently disagree.
    if (status === 'PACKED') {
      await ensurePlannedWarehouseAllocations(client, order.id, req.user.id);
      const allocationCapabilities =
        await getWarehouseAllocationCapabilities();
      if (allocationCapabilities.supportsPackedQuantity) {
        await client.query(
          `UPDATE order_item_warehouse_allocations allocation
           JOIN order_items item ON item.id = allocation.order_item_id
           SET allocation.packed_quantity = allocation.quantity
           WHERE item.order_id = ?
             AND allocation.allocation_status = 'PLANNED'`,
          [order.id]
        );
      }
      statusWarehouseDeliveryNotes = await ensureWarehouseDeliveryNotes(
        client,
        order,
        req.user.id
      );
    }

    if (status === 'CONFIRMED' && supportsPerWarehouseDeliveryNotes) {
      await ensurePlannedWarehouseAllocations(client, order.id, req.user.id);
      statusWarehouseDeliveryNotes = await ensureWarehouseDeliveryNotes(
        client,
        order,
        req.user.id
      );
    }

    if (status === 'CANCELLED') {
      await releasePlannedWarehouseAllocations(client, order.id);
      if (supportsPerWarehouseDeliveryNotes) {
        await client.query(
          `UPDATE order_warehouse_delivery_notes
           SET status = 'VOID',
               voided_at = NOW(),
               void_reason = ?
           WHERE order_id = ? AND status <> 'VOID'`,
          [`Order cancelled: ${cancellationReason}`.slice(0, 500), order.id]
        );
      }
    }

    // Deduct physical stock on delivery
    if (status === 'DELIVERED') {
      const { clause: oClause, params: oParams } = buildInClause([order.id]);
      const itemsRes = await client.query(
        `SELECT oi.*, fg.name AS product_name, fg.quantity,
                fg.inner_boxes_per_outer_box
         FROM order_items oi
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE oi.order_id IN ${oClause}`,
        oParams
      );

      const shortages = itemsRes.rows.filter((item) => {
        const physicalStock = Number(item.quantity || 0);
        return physicalStock < Number(item.qty_ordered);
      });

      if (shortages.length) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          message: 'Not enough physical stock to deliver this order',
          shortages: shortages.map((item) => ({
            product_name: item.product_name,
            ordered_qty: Number(item.qty_ordered),
            physical_stock: Number(item.quantity || 0),
          })),
        });
      }

      for (const item of itemsRes.rows) {
        try {
          await allocateWarehouseStockForDelivery(client, item, req.user.id);
        } catch (err) {
          if (err.statusCode === 422) {
            await client.query('ROLLBACK');
            return res.status(422).json({
              success: false,
              message: err.message,
              shortages: [err.shortage],
            });
          }

          throw err;
        }

        const { clause: fgClause, params: fgParams } = buildInClause([item.finished_good_id]);
        await client.query(
          `UPDATE finished_goods
           SET quantity = quantity - ?
           WHERE id IN ${fgClause}`,
          [item.qty_ordered, ...fgParams]
        );
      }
    }

    await client.query(
      `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
      [...updateParams, order.id]
    );

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType:
        status === 'CONFIRMED'
          ? 'CONFIRMED'
          : status === 'PACKED'
          ? 'PACKED'
          : status === 'DELIVERED'
          ? 'DELIVERED'
          : status === 'CANCELLED'
          ? 'CANCELLED'
          : 'UPDATE',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName(order),
      description: `${status === 'CANCELLED' ? 'Cancelled' : `Set status to ${status} for`} ${getOrderEntityName(order)}`,
      metadata: {
        order_number: order.id,
        customer_name: order.customer_name,
        previous_status: order.status,
        status,
        cancellation_reason: status === 'CANCELLED' ? cancellationReason : undefined,
        cancellation_code: status === 'CANCELLED' ? cancellationCode : undefined,
        duplicate_of_order_id:
          status === 'CANCELLED' && duplicateOfOrderId > 0
            ? duplicateOfOrderId
            : undefined,
        delivery_note_number: order.delivery_note_number,
        warehouse_delivery_note_numbers: statusWarehouseDeliveryNotes.map(
          (note) => note.delivery_note_number
        ),
      },
    });

    return res.json({
      success: true,
      message: statusWarehouseDeliveryNotes.length
        ? `Status updated. Warehouse DNs: ${statusWarehouseDeliveryNotes.map((note) => note.delivery_note_number).join(', ')}.`
        : 'Status updated',
      warehouse_delivery_note_numbers: statusWarehouseDeliveryNotes.map(
        (note) => note.delivery_note_number
      ),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.shortage ? { shortages: [err.shortage] } : {}),
      });
    }
    next(err);
  } finally {
    client.release();
  }
};

// ─── REPAIR A MISSING DELIVERY NOTE ────────────────────────────────────────
const assignDeliveryNote = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (!['CONFIRMED', 'PACKED', 'DELIVERED'].includes(String(order.status || '').toUpperCase())) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'A delivery note can only be assigned after an order is confirmed.',
      });
    }

    let deliveryNoteNumber = order.delivery_note_number;
    let warehouseDeliveryNotes = [];
    const supportsPerWarehouseDeliveryNotes = await hasTable(
      'order_warehouse_delivery_notes'
    );
    if (!deliveryNoteNumber && supportsPerWarehouseDeliveryNotes) {
      await ensurePlannedWarehouseAllocations(client, order.id, req.user.id);
      warehouseDeliveryNotes = await ensureWarehouseDeliveryNotes(
        client,
        order,
        req.user.id
      );
    } else if (!deliveryNoteNumber) {
      deliveryNoteNumber = await getNextDeliveryNoteNumber(
        client,
        order.created_at ? new Date(order.created_at) : new Date()
      );
      await client.query(
        `UPDATE orders
         SET delivery_note_number = ?,
             confirmed_by = COALESCE(confirmed_by, ?),
             confirmed_at = COALESCE(confirmed_at, NOW()),
             updated_at = NOW()
         WHERE id = ?`,
        [deliveryNoteNumber, req.user.id, order.id]
      );
    }

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName(order),
      description: warehouseDeliveryNotes.length
        ? `Assigned warehouse delivery notes ${warehouseDeliveryNotes.map((note) => note.delivery_note_number).join(', ')} to ${getOrderEntityName(order)}`
        : `Assigned ${deliveryNoteNumber} to ${getOrderEntityName(order)}`,
      metadata: {
        order_number: order.id,
        status: order.status,
        delivery_note_number: deliveryNoteNumber,
        warehouse_delivery_notes: warehouseDeliveryNotes,
      },
    });

    return res.json({
      success: true,
      message: warehouseDeliveryNotes.length
        ? `${warehouseDeliveryNotes.map((note) => note.delivery_note_number).join(', ')} assigned by warehouse.`
        : `${deliveryNoteNumber} assigned successfully.`,
      data: {
        id: order.id,
        delivery_note_number: deliveryNoteNumber,
        warehouse_delivery_notes: warehouseDeliveryNotes,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// Correct warehouse DNs that were assigned from the historical GLOBAL maximum.
// Permanent/printed DNs are intentionally excluded from this correction path.
const correctWarehouseDeliveryNoteNumbers = async (req, res, next) => {
  const client = await getClient();

  try {
    if (!canCorrectWarehouseSource(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to correct warehouse DNs.',
      });
    }

    const orderId = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order.' });
    }
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Enter why these DN numbers need correction.',
      });
    }
    if (
      !(await hasTable('order_warehouse_delivery_notes')) ||
      !(await hasTable('order_warehouse_delivery_note_corrections')) ||
      !(await hasTable('delivery_note_sequences')) ||
      !(await hasColumn('orders', 'bs_fiscal_year'))
    ) {
      return res.status(409).json({
        success: false,
        message: 'Fiscal warehouse-DN correction is not available in this database.',
      });
    }

    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (String(order.status || '').toUpperCase() !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'DN numbers can only be corrected while the order is confirmed and not yet packed.',
      });
    }
    const noteResult = await client.query(
      `SELECT *
       FROM order_warehouse_delivery_notes
       WHERE order_id = ?
       ORDER BY assigned_at, id
       FOR UPDATE`,
      [orderId]
    );
    const notes = noteResult.rows;
    if (!notes.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This order has no warehouse DNs to correct.',
      });
    }
    if (
      notes.some(
        (note) =>
          String(note.status || '').toUpperCase() !== 'ACTIVE'
      )
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only active warehouse DNs can be corrected.',
      });
    }

    const deliveredResult = await client.query(
      `SELECT COUNT(*) AS delivered_count
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       WHERE item.order_id = ?
         AND allocation.allocation_status = 'DEDUCTED'`,
      [orderId]
    );
    if (Number(deliveredResult.rows[0]?.delivered_count || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Delivered warehouse DNs are permanent and cannot be renumbered.',
      });
    }

    const orderDate = order.created_at ? new Date(order.created_at) : new Date();
    const fiscalYear =
      order.bs_fiscal_year || getNepaliFiscalMeta(orderDate).bs_fiscal_year;
    const legacyMaximumResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED)), 0) AS last_number
       FROM orders
       WHERE id <> ?
         AND bs_fiscal_year = ?
         AND delivery_note_number REGEXP '^DN-[0-9]+$'`,
      [orderId, fiscalYear]
    );
    const warehouseMaximumResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED)), 0) AS last_number
       FROM order_warehouse_delivery_notes
       WHERE order_id <> ?
         AND bs_fiscal_year = ?
         AND delivery_note_number REGEXP '^DN-[0-9]+$'`,
      [orderId, fiscalYear]
    );
    const previousMaximum = Math.max(
      Number(legacyMaximumResult.rows[0]?.last_number || 0),
      Number(warehouseMaximumResult.rows[0]?.last_number || 0)
    );
    const oldNumbers = notes.map((note) => note.delivery_note_number);
    const hadPrintedCopies =
      Number(order.delivery_note_print_count || 0) > 0 ||
      Boolean(order.delivery_note_printed_at) ||
      notes.some(
        (note) => Number(note.print_count || 0) > 0 || note.printed_at
      );
    const correctedNumbers = notes.map(
      (_, index) => `DN-${String(previousMaximum + index + 1).padStart(4, '0')}`
    );
    if (
      oldNumbers.every(
        (number, index) => String(number) === correctedNumbers[index]
      )
    ) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: `Warehouse DNs are already correct: ${correctedNumbers.join(', ')}.`,
        warehouse_delivery_note_numbers: correctedNumbers,
      });
    }

    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      const correctedNumber = correctedNumbers[index];
      await client.query(
        `INSERT INTO order_warehouse_delivery_note_corrections
          (order_id, warehouse_id, old_delivery_note_number,
           new_delivery_note_number, old_printed_at, old_print_count,
           reason, corrected_by, corrected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          orderId,
          note.warehouse_id,
          note.delivery_note_number,
          correctedNumber,
          note.printed_at || order.delivery_note_printed_at || null,
          Number(note.print_count || 0),
          reason,
          req.user.id,
        ]
      );
      await client.query(
        `UPDATE order_warehouse_delivery_notes
         SET delivery_note_number = ?
         WHERE id = ?`,
        [`TEMP-${orderId}-${note.id}-${Date.now()}`, note.id]
      );
    }
    for (let index = 0; index < notes.length; index += 1) {
      await client.query(
        `UPDATE order_warehouse_delivery_notes
         SET delivery_note_number = ?,
             bs_fiscal_year = ?,
             printed_at = NULL,
             print_count = 0
         WHERE id = ?`,
        [correctedNumbers[index], fiscalYear, notes[index].id]
      );
    }
    await client.query(
      `UPDATE orders
       SET delivery_note_printed_at = NULL,
           delivery_note_print_count = 0,
           updated_at = NOW()
       WHERE id = ?`,
      [orderId]
    );

    const sequenceKey = `FY:${fiscalYear}`;
    await client.query(
      `INSERT INTO delivery_note_sequences (sequence_key, last_number)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_number = VALUES(last_number)`,
      [sequenceKey, previousMaximum + notes.length]
    );

    await client.query('COMMIT');
    clearCache();

    try {
      await auditLog({
        ...getActor(req),
        actionType: 'CORRECTED',
        module: 'orders',
        entity_type: 'warehouse_delivery_note',
        entity_id: orderId,
        entityName: getOrderEntityName(order),
        description: `Corrected warehouse DN sequence for ${getOrderEntityName(order)}`,
        metadata: {
          order_number: orderId,
          fiscal_year: fiscalYear,
          old_delivery_note_numbers: oldNumbers,
          new_delivery_note_numbers: correctedNumbers,
          old_printed_copies_invalidated: hadPrintedCopies,
          reason,
        },
      });
    } catch (auditError) {
      console.error('Warehouse DN correction audit failed:', auditError);
    }

    return res.json({
      success: true,
      message: hadPrintedCopies
        ? `Warehouse DNs corrected: ${correctedNumbers.join(', ')}. Destroy or mark the old printed copies (${oldNumbers.join(', ')}) INVALID.`
        : `Warehouse DNs corrected: ${correctedNumbers.join(', ')}.`,
      warehouse_delivery_note_numbers: correctedNumbers,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// ─── REOPEN PACKED ORDER ───────────────────────────────────────────────────
const reopenPacking = async (req, res, next) => {
  const client = await getClient();

  try {
    if (!canCorrectOrders(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reopen packed orders.',
      });
    }

    await client.query('START TRANSACTION');

    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Reopen reason is required.',
      });
    }

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (String(order.status).toUpperCase() !== 'PACKED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only packed orders can be reopened.',
      });
    }

    if (await hasColumn('order_item_warehouse_allocations', 'allocation_status')) {
      const deliveredAllocationResult = await client.query(
        `SELECT COUNT(*) AS delivered_allocations
         FROM order_item_warehouse_allocations allocation
         JOIN order_items item ON item.id = allocation.order_item_id
         WHERE item.order_id = ?
           AND allocation.allocation_status = 'DEDUCTED'`,
        [order.id]
      );
      if (Number(deliveredAllocationResult.rows[0]?.delivered_allocations || 0) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message:
            'Packing cannot be reopened after any warehouse slip has been delivered.',
        });
      }
    }

    await releasePlannedWarehouseAllocations(client, order.id);

    await client.query(
      `UPDATE orders
       SET status = 'CONFIRMED',
           packed_by = NULL,
           packed_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [order.id]
    );

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName(order),
      description: `Reopened packing for ${getOrderEntityName(order)}: ${reason}`,
      metadata: {
        reason,
        previous_status: 'PACKED',
        status: 'CONFIRMED',
        delivery_note_number: order.delivery_note_number,
        previous_packed_by: order.packed_by,
        previous_packed_at: order.packed_at,
      },
    });

    return res.json({
      success: true,
      message: `Order reopened for correction. ${order.delivery_note_number || 'Delivery note'} was preserved.`,
      data: {
        id: order.id,
        status: 'CONFIRMED',
        delivery_note_number: order.delivery_note_number,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// ─── UNDO CONFIRMED ORDER ──────────────────────────────────────────────────
const undoConfirmation = async (req, res, next) => {
  const client = await getClient();

  try {
    if (!canCorrectOrders(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to undo order confirmation.',
      });
    }

    await client.query('START TRANSACTION');

    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Undo-confirmation reason is required.',
      });
    }

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (String(order.status || '').toUpperCase() !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only confirmed orders can be returned to pending.',
      });
    }

    if (Number(order.stock_deducted || 0) === 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This order has already affected physical stock and cannot be returned to pending.',
      });
    }

    const deliveryNoteDecision = await getDeliveryNoteReclaimDecision(
      client,
      order
    );

    await releasePlannedWarehouseAllocations(client, order.id);

    await client.query(
      `UPDATE orders
       SET status = 'PENDING',
           confirmed_by = NULL,
           confirmed_at = NULL,
           delivery_note_number = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [deliveryNoteDecision.reclaim ? null : order.delivery_note_number, order.id]
    );

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName(order),
      description: `Returned ${getOrderEntityName(order)} from confirmed to pending: ${reason}`,
      metadata: {
        reason,
        previous_status: 'CONFIRMED',
        status: 'PENDING',
        delivery_note_number: order.delivery_note_number,
        delivery_note_reclaimed: deliveryNoteDecision.reclaim,
        delivery_note_decision: deliveryNoteDecision.reason,
        previous_confirmed_by: order.confirmed_by,
        previous_confirmed_at: order.confirmed_at,
        reserved_stock_preserved: true,
        planned_warehouse_allocations_released: true,
      },
    });

    return res.json({
      success: true,
      message: deliveryNoteDecision.reclaim
        ? `Order returned to pending. ${order.delivery_note_number} was released for the next confirmed order.`
        : `Order returned to pending. ${order.delivery_note_number || 'Its delivery note number'} was preserved: ${deliveryNoteDecision.reason}`,
      data: {
        id: order.id,
        status: 'PENDING',
        delivery_note_number: deliveryNoteDecision.reclaim
          ? null
          : order.delivery_note_number,
        delivery_note_reclaimed: deliveryNoteDecision.reclaim,
        delivery_note_decision: deliveryNoteDecision.reason,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// Save the storekeeper's physical count without deducting stock. Delivery is a
// separate action so the saved quantities can be reviewed first.
const verifyWarehouseFulfillment = async (req, res, next) => {
  const client = await getClient();

  try {
    const orderId = Number(req.params.id);
    const warehouseId = Number(req.params.warehouseId);
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (
      !Number.isInteger(orderId) ||
      orderId <= 0 ||
      !Number.isInteger(warehouseId) ||
      warehouseId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Select a valid order and warehouse slip.',
      });
    }

    const capabilities = await getWarehouseAllocationCapabilities();
    if (!capabilities.supportsPlanning || !capabilities.supportsVerification) {
      return res.status(409).json({
        success: false,
        message:
          'Warehouse product verification requires sql/add-warehouse-pick-verification.sql.',
      });
    }

    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (String(order.status || '').toUpperCase() !== 'PACKED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Pack the master order before checking warehouse products.',
      });
    }

    const allocationResult = await client.query(
      `SELECT allocation.id AS allocation_id,
              allocation.quantity,
              allocation.order_item_id,
              allocation.created_by AS allocation_created_by,
              item.finished_good_id,
              product.name AS product_name
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       JOIN finished_goods product ON product.id = item.finished_good_id
       WHERE item.order_id = ?
         AND allocation.warehouse_id = ?
         AND allocation.allocation_status = 'PLANNED'
       ORDER BY allocation.id
       FOR UPDATE`,
      [orderId, warehouseId]
    );
    if (!allocationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This warehouse slip has no products waiting for delivery.',
      });
    }

    const requestedByAllocation = new Map();
    for (const item of requestedItems) {
      const allocationId = Number(item.allocation_id);
      if (
        !Number.isInteger(allocationId) ||
        allocationId <= 0 ||
        requestedByAllocation.has(allocationId)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Every warehouse product must be checked exactly once.',
        });
      }
      requestedByAllocation.set(allocationId, item);
    }
    if (
      requestedByAllocation.size !== allocationResult.rows.length ||
      allocationResult.rows.some(
        (allocation) =>
          !requestedByAllocation.has(Number(allocation.allocation_id))
      )
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          'The warehouse slip changed while it was open. Refresh and check every pending product again.',
      });
    }

    const verificationItems = [];
    const configuredGroups = await loadWarehousePrintGroupMap(
      client,
      capabilities.supportsConfiguredGroups
    );
    for (const allocation of allocationResult.rows) {
      const requested = requestedByAllocation.get(
        Number(allocation.allocation_id)
      );
      const plannedQuantity = Number(allocation.quantity || 0);
      const verifiedQuantity = Number(requested.deliver_quantity);
      const remainingQuantity = Math.max(0, plannedQuantity - verifiedQuantity);
      const remainderAction = String(
        requested.remainder_action || 'DELIVER_LATER'
      ).toUpperCase();
      const note = String(requested.note || '').trim().slice(0, 500);
      const targetWarehouseId = Number(requested.target_warehouse_id || 0);
      if (
        !Number.isFinite(verifiedQuantity) ||
        verifiedQuantity < 0 ||
        verifiedQuantity > plannedQuantity + 0.001
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Enter a valid found quantity for ${allocation.product_name}.`,
        });
      }
      if (
        remainingQuantity > 0.001 &&
        !WAREHOUSE_REMAINDER_ACTIONS.has(remainderAction)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Choose deliver later or not found for ${allocation.product_name}.`,
        });
      }
      if (
        remainderAction === 'FOUND_OTHER_WAREHOUSE' &&
        (remainingQuantity <= 0.001 ||
          !Number.isInteger(targetWarehouseId) ||
          targetWarehouseId <= 0 ||
          targetWarehouseId === warehouseId)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Select a different warehouse for the remaining ${allocation.product_name}.`,
        });
      }

      const verificationStatus =
        remainingQuantity <= 0.001 ? 'FOUND' : remainderAction;
      const verificationRecord = {
        allocation_id: Number(allocation.allocation_id),
        finished_good_id: Number(allocation.finished_good_id),
        product_name: allocation.product_name,
        planned_quantity: plannedQuantity,
        verified_quantity: verifiedQuantity,
        remaining_quantity: remainingQuantity,
        remainder_action: remainingQuantity > 0.001 ? remainderAction : null,
        note: note || null,
      };

      if (remainderAction === 'FOUND_OTHER_WAREHOUSE') {
        const targetResult = await client.query(
          `SELECT warehouse.id, warehouse.name, warehouse.is_active,
                  COALESCE(stock.quantity, 0) AS stock_quantity
           FROM warehouses warehouse
           LEFT JOIN finished_good_warehouse_stock stock
             ON stock.warehouse_id = warehouse.id
            AND stock.finished_good_id = ?
           WHERE warehouse.id = ?
             AND warehouse.deleted_at IS NULL
           FOR UPDATE`,
          [allocation.finished_good_id, targetWarehouseId]
        );
        const targetWarehouse = targetResult.rows[0];
        if (!targetWarehouse || Number(targetWarehouse.is_active) !== 1) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Select an active destination warehouse.',
          });
        }

        const reservedResult = await client.query(
          `SELECT COALESCE(SUM(quantity), 0) AS reserved_quantity
           FROM order_item_warehouse_allocations
           WHERE finished_good_id = ?
             AND warehouse_id = ?
             AND allocation_status = 'PLANNED'
             AND id <> ?`,
          [
            allocation.finished_good_id,
            targetWarehouseId,
            allocation.allocation_id,
          ]
        );
        const availableQuantity = Math.max(
          0,
          Number(targetWarehouse.stock_quantity || 0) -
            Number(reservedResult.rows[0]?.reserved_quantity || 0)
        );
        const relocationQuantity = Math.max(
          0,
          remainingQuantity - availableQuantity
        );
        if (relocationQuantity > 0.001) {
          const sourceStockResult = await client.query(
            `SELECT quantity
             FROM finished_good_warehouse_stock
             WHERE finished_good_id = ? AND warehouse_id = ?
             FOR UPDATE`,
            [allocation.finished_good_id, warehouseId]
          );
          const sourceRecordedQuantity = Number(
            sourceStockResult.rows[0]?.quantity || 0
          );
          if (sourceRecordedQuantity + 0.001 < relocationQuantity) {
            await client.query('ROLLBACK');
            return res.status(422).json({
              success: false,
              message: `The recorded stock cannot relocate ${relocationQuantity} pairs of ${allocation.product_name} from this warehouse to ${targetWarehouse.name}. Correct the warehouse count first.`,
            });
          }

          await client.query(
            `UPDATE finished_good_warehouse_stock
             SET quantity = quantity - ?, updated_by = ?
             WHERE finished_good_id = ? AND warehouse_id = ?`,
            [
              relocationQuantity,
              req.user.id,
              allocation.finished_good_id,
              warehouseId,
            ]
          );
          const targetStockInsert = await appendFiscalInsertFields(
            'finished_good_warehouse_stock',
            [
              'finished_good_id',
              'warehouse_id',
              'quantity',
              'created_by',
              'updated_by',
            ],
            [
              allocation.finished_good_id,
              targetWarehouseId,
              relocationQuantity,
              req.user.id,
              req.user.id,
            ]
          );
          await client.query(
            `INSERT INTO finished_good_warehouse_stock
              (${targetStockInsert.columns.join(', ')})
             VALUES (${targetStockInsert.columns.map(() => '?').join(', ')})
             ON DUPLICATE KEY UPDATE
               quantity = quantity + VALUES(quantity),
               updated_by = VALUES(updated_by)`,
            targetStockInsert.values
          );

          const movementNote = (
            note ||
            `Physical check found order #${orderId} stock in ${targetWarehouse.name}`
          ).slice(0, 500);
          const transferOutInsert = await appendFiscalInsertFields(
            'finished_good_warehouse_movements',
            [
              'finished_good_id',
              'warehouse_id',
              'quantity',
              'movement_type',
              'reference_type',
              'reference_id',
              'notes',
              'created_by',
            ],
            [
              allocation.finished_good_id,
              warehouseId,
              relocationQuantity,
              'TRANSFER_OUT',
              'order_warehouse_reassignment',
              orderId,
              movementNote,
              req.user.id,
            ]
          );
          await client.query(
            `INSERT INTO finished_good_warehouse_movements
              (${transferOutInsert.columns.join(', ')})
             VALUES (${transferOutInsert.columns.map(() => '?').join(', ')})`,
            transferOutInsert.values
          );
          const transferInInsert = await appendFiscalInsertFields(
            'finished_good_warehouse_movements',
            [
              'finished_good_id',
              'warehouse_id',
              'quantity',
              'movement_type',
              'reference_type',
              'reference_id',
              'notes',
              'created_by',
            ],
            [
              allocation.finished_good_id,
              targetWarehouseId,
              relocationQuantity,
              'TRANSFER_IN',
              'order_warehouse_reassignment',
              orderId,
              movementNote,
              req.user.id,
            ]
          );
          await client.query(
            `INSERT INTO finished_good_warehouse_movements
              (${transferInInsert.columns.join(', ')})
             VALUES (${transferInInsert.columns.map(() => '?').join(', ')})`,
            transferInInsert.values
          );
          verificationRecord.warehouse_stock_relocated_quantity =
            relocationQuantity;
        }

        if (verifiedQuantity > 0.001) {
          await client.query(
            `UPDATE order_item_warehouse_allocations
             SET quantity = ?,
                 packed_quantity = ?,
                 verified_quantity = ?,
                 verification_status = 'FOUND',
                 verification_note = ?,
                 verified_by = ?,
                 verified_at = NOW()
             WHERE id = ? AND allocation_status = 'PLANNED'`,
            [
              verifiedQuantity,
              verifiedQuantity,
              verifiedQuantity,
              note || null,
              req.user.id,
              allocation.allocation_id,
            ]
          );
        } else {
          await client.query(
            `UPDATE order_item_warehouse_allocations
             SET allocation_status = 'RELEASED',
                 packed_quantity = 0,
                 verified_quantity = 0,
                 verification_status = 'FOUND_OTHER_WAREHOUSE',
                 verification_note = ?,
                 verified_by = ?,
                 verified_at = NOW()
             WHERE id = ? AND allocation_status = 'PLANNED'`,
            [note || null, req.user.id, allocation.allocation_id]
          );
        }

        const printGroup = resolveWarehousePrintGroup(
          targetWarehouse.id,
          targetWarehouse.name,
          configuredGroups
        );
        const targetInsert = await appendFiscalInsertFields(
          'order_item_warehouse_allocations',
          [
            'order_item_id',
            'finished_good_id',
            'warehouse_id',
            'quantity',
            'allocation_status',
            'packed_quantity',
            'print_group_code_snapshot',
            'print_group_name_snapshot',
            'verification_status',
            'verified_quantity',
            'verification_note',
            'verified_by',
            'verified_at',
            'created_by',
          ],
          [
            allocation.order_item_id,
            allocation.finished_good_id,
            targetWarehouseId,
            remainingQuantity,
            'PLANNED',
            remainingQuantity,
            printGroup.code,
            printGroup.name,
            'FOUND',
            remainingQuantity,
            note || `Found in ${targetWarehouse.name}`,
            req.user.id,
            new Date(),
            allocation.allocation_created_by || req.user.id,
          ]
        );
        await client.query(
          `INSERT INTO order_item_warehouse_allocations (${targetInsert.columns.join(', ')})
           VALUES (${targetInsert.columns.map(() => '?').join(', ')})`,
          targetInsert.values
        );
        verificationRecord.target_warehouse_id = targetWarehouseId;
        verificationRecord.target_warehouse_name = targetWarehouse.name;
        verificationRecord.reassigned_quantity = remainingQuantity;
      } else {
        await client.query(
          `UPDATE order_item_warehouse_allocations
           SET verified_quantity = ?,
               verification_status = ?,
               verification_note = ?,
               verified_by = ?,
               verified_at = NOW()
           WHERE id = ? AND allocation_status = 'PLANNED'`,
          [
            verifiedQuantity,
            verificationStatus,
            note || null,
            req.user.id,
            allocation.allocation_id,
          ]
        );
      }
      verificationItems.push(verificationRecord);
    }

    let warehouseDeliveryNotes = await ensureWarehouseDeliveryNotes(
      client,
      order,
      req.user.id
    );
    const reassignedWarehouseIds = [
      ...new Set(
        verificationItems
          .map((item) => Number(item.target_warehouse_id))
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];
    const sourceDeliveryNote = warehouseDeliveryNotes.find(
      (note) => Number(note.warehouse_id) === warehouseId
    );
    if (
      reassignedWarehouseIds.length > 0 &&
      String(sourceDeliveryNote?.status || '').toUpperCase() === 'VOID' &&
      (await hasTable('order_warehouse_dn_reassignments'))
    ) {
      for (const destinationWarehouseId of reassignedWarehouseIds) {
        const destinationDeliveryNote = warehouseDeliveryNotes.find(
          (note) =>
            Number(note.warehouse_id) === destinationWarehouseId &&
            Number(note.id) !== Number(sourceDeliveryNote.id)
        );
        if (!destinationDeliveryNote) continue;
        await client.query(
          `INSERT INTO order_warehouse_dn_reassignments
            (source_delivery_note_id, destination_delivery_note_id,
             reassigned_by, reassigned_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             reassigned_by = VALUES(reassigned_by),
             reassigned_at = VALUES(reassigned_at)`,
          [sourceDeliveryNote.id, destinationDeliveryNote.id, req.user.id]
        );
      }
      await client.query(
        `UPDATE order_warehouse_delivery_notes
         SET status = 'REASSIGNED',
             voided_at = NULL,
             void_reason = NULL
         WHERE id = ?`,
        [sourceDeliveryNote.id]
      );
      warehouseDeliveryNotes = await loadWarehouseDeliveryNotes(client, [
        orderId,
      ]);
    }
    const deliveryNoteByWarehouse = new Map(
      warehouseDeliveryNotes.map((note) => [
        Number(note.warehouse_id),
        note.delivery_note_number,
      ])
    );
    verificationItems.forEach((item) => {
      if (!item.target_warehouse_id) return;
      item.source_delivery_note_number =
        deliveryNoteByWarehouse.get(warehouseId) ||
        order.delivery_note_number ||
        null;
      item.target_delivery_note_number =
        deliveryNoteByWarehouse.get(Number(item.target_warehouse_id)) || null;
    });

    const preparedOrder = await loadDeliveryNoteOrder(
      client,
      orderId,
      capabilities
    );
    const fulfillment = preparedOrder.warehouse_fulfillments.find(
      (entry) => Number(entry.warehouse_id) === warehouseId
    );
    await client.query('COMMIT');
    clearCache();

    try {
      await auditLog({
        ...getActor(req),
        actionType: 'VERIFIED',
        module: 'orders',
        entity_type: 'warehouse_delivery_slip',
        entity_id: orderId,
        entityName:
          fulfillment?.warehouse_slip_number || getOrderEntityName(order),
        description: `Checked products for ${fulfillment?.warehouse_slip_number || `warehouse ${warehouseId}`} on ${getOrderEntityName(order)}`,
        metadata: {
          order_number: orderId,
          delivery_note_number: order.delivery_note_number,
          warehouse_id: warehouseId,
          warehouse_name: fulfillment?.name,
          verification_items: verificationItems,
        },
      });
    } catch (auditError) {
      console.error('Warehouse verification audit failed:', auditError);
    }

    return res.json({
      success: true,
      message:
        'Product check saved. Stock has not been deducted; use Deliver verified products when ready.',
      data: preparedOrder,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// Deliver only one warehouse slip. The master order remains PACKED while any
// other warehouse still has planned stock, and becomes DELIVERED only when all
// warehouse allocations have been deducted.
const deliverWarehouseFulfillment = async (req, res, next) => {
  const client = await getClient();

  try {
    const orderId = Number(req.params.id);
    const warehouseId = Number(req.params.warehouseId);
    if (!Number.isInteger(orderId) || orderId <= 0 ||
        !Number.isInteger(warehouseId) || warehouseId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Select a valid order and warehouse slip.',
      });
    }

    const capabilities = await getWarehouseAllocationCapabilities();
    if (
      !capabilities.supportsPlanning ||
      !capabilities.supportsDeliveredBy ||
      !capabilities.supportsDeliveredAt
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Partial warehouse delivery requires sql/add-partial-warehouse-delivery.sql.',
      });
    }
    const requestedVerification = Array.isArray(req.body?.items)
      ? req.body.items
      : null;
    if (!capabilities.supportsVerification) {
      return res.status(409).json({
        success: false,
        message:
          'Warehouse product verification requires sql/add-warehouse-pick-verification.sql.',
      });
    }

    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (String(order.status || '').toUpperCase() !== 'PACKED') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          String(order.status || '').toUpperCase() === 'DELIVERED'
            ? 'This order is already fully delivered.'
            : 'Pack the master order before delivering a warehouse slip.',
      });
    }

    const allocationResult = await client.query(
      `SELECT allocation.id AS allocation_id,
              allocation.quantity AS allocated_quantity,
              allocation.allocation_status,
              allocation.created_by AS allocation_created_by,
              allocation.print_group_code_snapshot,
              allocation.print_group_name_snapshot,
              allocation.verified_quantity,
              allocation.verification_status,
              allocation.verification_note,
              allocation.verified_at,
              item.id AS order_item_id,
              item.order_id,
              item.finished_good_id,
              product.name AS product_name,
              product.quantity AS physical_stock,
              warehouse.name AS warehouse_name
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       JOIN finished_goods product ON product.id = item.finished_good_id
       JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
       WHERE item.order_id = ?
         AND allocation.warehouse_id = ?
         AND allocation.allocation_status <> 'RELEASED'
       ORDER BY allocation.id
       FOR UPDATE`,
      [orderId, warehouseId]
    );

    if (!allocationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'This order has no allocation for the selected warehouse.',
      });
    }

    const plannedAllocations = allocationResult.rows.filter(
      (allocation) =>
        String(allocation.allocation_status || '').toUpperCase() === 'PLANNED'
    );
    if (!plannedAllocations.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This warehouse slip has already been delivered.',
      });
    }

    const verificationByAllocation = new Map();
    if (requestedVerification) {
      for (const requestedItem of requestedVerification) {
        const allocationId = Number(requestedItem.allocation_id);
        if (!Number.isInteger(allocationId) || allocationId <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Every verified product must include a valid allocation.',
          });
        }
        if (verificationByAllocation.has(allocationId)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'A warehouse product was submitted more than once.',
          });
        }
        verificationByAllocation.set(allocationId, requestedItem);
      }
      const missingAllocation = plannedAllocations.find(
        (allocation) =>
          !verificationByAllocation.has(Number(allocation.allocation_id))
      );
      const unrelatedAllocation = [...verificationByAllocation.keys()].find(
        (allocationId) =>
          !plannedAllocations.some(
            (allocation) => Number(allocation.allocation_id) === allocationId
          )
      );
      if (missingAllocation || unrelatedAllocation) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message:
            'The warehouse slip changed while it was open. Refresh and verify every pending product again.',
        });
      }
    }

    let deliveredPairs = 0;
    let closedOutOfStockPairs = 0;
    const verificationItems = [];
    for (const allocation of plannedAllocations) {
      const allocatedQuantity = Number(allocation.allocated_quantity || 0);
      const requestedItem = verificationByAllocation.get(
        Number(allocation.allocation_id)
      );
      const quantity = requestedItem
        ? Number(requestedItem.deliver_quantity)
        : allocatedQuantity;
      const remainder = Math.max(0, allocatedQuantity - quantity);
      const remainderAction = String(
        requestedItem?.remainder_action || 'DELIVER_LATER'
      ).toUpperCase();
      const verificationNote = String(requestedItem?.note || '')
        .trim()
        .slice(0, 500);

      if (
        requestedVerification &&
        (!allocation.verified_at ||
          allocation.verified_quantity === null ||
          Math.abs(Number(allocation.verified_quantity) - quantity) > 0.001)
      ) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `The saved product check for ${allocation.product_name} is missing or changed. Check the products again before delivery.`,
        });
      }

      if (
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > allocatedQuantity + 0.001
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Enter a valid deliver-now quantity for ${allocation.product_name}.`,
        });
      }
      if (remainder > 0.001 && !WAREHOUSE_REMAINDER_ACTIONS.has(remainderAction)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Choose deliver later or not found for the remaining ${allocation.product_name}.`,
        });
      }

      verificationItems.push({
        allocation_id: Number(allocation.allocation_id),
        finished_good_id: Number(allocation.finished_good_id),
        product_name: allocation.product_name,
        planned_quantity: allocatedQuantity,
        delivered_quantity: quantity,
        remaining_quantity: remainder,
        remainder_action: remainder > 0.001 ? remainderAction : null,
        note: verificationNote || null,
      });

      if (quantity <= 0.001) {
        const closeOutOfStock = remainderAction === 'OUT_OF_STOCK';
        await client.query(
          `UPDATE order_item_warehouse_allocations
           SET allocation_status = ?,
               packed_quantity = 0,
               verified_quantity = 0,
               verification_status = ?,
               verification_note = ?,
               verified_by = ?,
               verified_at = NOW(),
               delivered_by = ?,
               delivered_at = ?
           WHERE id = ? AND allocation_status = 'PLANNED'`,
          [
            closeOutOfStock ? 'OUT_OF_STOCK' : 'PLANNED',
            remainderAction,
            verificationNote || null,
            req.user.id,
            closeOutOfStock ? req.user.id : null,
            closeOutOfStock ? new Date() : null,
            allocation.allocation_id,
          ]
        );
        if (closeOutOfStock) closedOutOfStockPairs += allocatedQuantity;
        continue;
      }

      const warehouseStockResult = await client.query(
        `SELECT id, quantity
         FROM finished_good_warehouse_stock
         WHERE finished_good_id = ? AND warehouse_id = ?
         FOR UPDATE`,
        [allocation.finished_good_id, warehouseId]
      );
      const warehouseStock = warehouseStockResult.rows[0];
      if (!warehouseStock || Number(warehouseStock.quantity || 0) + 0.001 < quantity) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          message: `The planned stock for ${allocation.product_name} is no longer available in ${allocation.warehouse_name}.`,
          shortages: [
            {
              product_name: allocation.product_name,
              ordered_qty: quantity,
              warehouse_stock: Number(warehouseStock?.quantity || 0),
              warehouse_name: allocation.warehouse_name,
            },
          ],
        });
      }
      if (Number(allocation.physical_stock || 0) + 0.001 < quantity) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          message: `Not enough physical stock remains for ${allocation.product_name}.`,
        });
      }

      const warehouseDeduction = await client.query(
        `UPDATE finished_good_warehouse_stock
         SET quantity = quantity - ?, updated_by = ?
         WHERE id = ? AND quantity >= ?`,
        [quantity, req.user.id, warehouseStock.id, quantity]
      );
      if (Number(warehouseDeduction.affectedRows || 0) !== 1) {
        const error = new Error(
          `The stock for ${allocation.product_name} changed while this warehouse slip was being delivered. Refresh and try again.`
        );
        error.statusCode = 409;
        throw error;
      }

      const productDeduction = await client.query(
        `UPDATE finished_goods
         SET quantity = quantity - ?
         WHERE id = ? AND quantity >= ?`,
        [quantity, allocation.finished_good_id, quantity]
      );
      if (Number(productDeduction.affectedRows || 0) !== 1) {
        const error = new Error(
          `The total stock for ${allocation.product_name} changed while this warehouse slip was being delivered. Refresh and try again.`
        );
        error.statusCode = 409;
        throw error;
      }
      if (remainder > 0.001) {
        const closeOutOfStock = remainderAction === 'OUT_OF_STOCK';
        await client.query(
          `UPDATE order_item_warehouse_allocations
           SET quantity = ?,
               allocation_status = ?,
               packed_quantity = 0,
               verified_quantity = 0,
               verification_status = ?,
               verification_note = ?,
               verified_by = ?,
               verified_at = NOW(),
               delivered_by = ?,
               delivered_at = ?
           WHERE id = ? AND allocation_status = 'PLANNED'`,
          [
            remainder,
            closeOutOfStock ? 'OUT_OF_STOCK' : 'PLANNED',
            remainderAction,
            verificationNote || null,
            req.user.id,
            closeOutOfStock ? req.user.id : null,
            closeOutOfStock ? new Date() : null,
            allocation.allocation_id,
          ]
        );
        if (closeOutOfStock) closedOutOfStockPairs += remainder;
        const deliveredInsert = await appendFiscalInsertFields(
          'order_item_warehouse_allocations',
          [
            'order_item_id',
            'finished_good_id',
            'warehouse_id',
            'quantity',
            'allocation_status',
            'packed_quantity',
            'print_group_code_snapshot',
            'print_group_name_snapshot',
            'delivered_by',
            'delivered_at',
            'verification_status',
            'verified_quantity',
            'verification_note',
            'verified_by',
            'verified_at',
            'created_by',
          ],
          [
            allocation.order_item_id,
            allocation.finished_good_id,
            warehouseId,
            quantity,
            'DEDUCTED',
            quantity,
            allocation.print_group_code_snapshot || null,
            allocation.print_group_name_snapshot || allocation.warehouse_name,
            req.user.id,
            new Date(),
            'FOUND',
            quantity,
            verificationNote || null,
            req.user.id,
            new Date(),
            allocation.allocation_created_by || req.user.id,
          ]
        );
        await client.query(
          `INSERT INTO order_item_warehouse_allocations (${deliveredInsert.columns.join(', ')})
           VALUES (${deliveredInsert.columns.map(() => '?').join(', ')})`,
          deliveredInsert.values
        );
      } else {
        await client.query(
          `UPDATE order_item_warehouse_allocations
           SET allocation_status = 'DEDUCTED',
               packed_quantity = quantity,
               delivered_by = ?,
               delivered_at = NOW(),
               verification_status = 'FOUND',
               verified_quantity = quantity,
               verification_note = ?,
               verified_by = ?,
               verified_at = NOW()
           WHERE id = ? AND allocation_status = 'PLANNED'`,
          [
            req.user.id,
            verificationNote || null,
            req.user.id,
            allocation.allocation_id,
          ]
        );
      }
      await recordWarehouseOrderMovement(client, {
        item: {
          order_id: orderId,
          finished_good_id: allocation.finished_good_id,
        },
        warehouseId,
        quantity,
        userId: req.user.id,
      });
      deliveredPairs += quantity;
    }

    const remainingResult = await client.query(
      `SELECT COUNT(*) AS remaining_allocations
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       WHERE item.order_id = ?
         AND allocation.allocation_status = 'PLANNED'`,
      [orderId]
    );
    if (await hasTable('order_warehouse_delivery_notes')) {
      const warehouseRemainingResult = await client.query(
        `SELECT SUM(allocation_status = 'PLANNED') AS remaining_allocations,
                SUM(allocation_status = 'DEDUCTED') AS delivered_allocations,
                SUM(allocation_status = 'OUT_OF_STOCK') AS out_of_stock_allocations
         FROM order_item_warehouse_allocations allocation
         JOIN order_items item ON item.id = allocation.order_item_id
         WHERE item.order_id = ?
           AND allocation.warehouse_id = ?
           AND allocation.allocation_status <> 'RELEASED'`,
        [orderId, warehouseId]
      );
      if (
        Number(
          warehouseRemainingResult.rows[0]?.remaining_allocations || 0
        ) === 0
      ) {
        const warehouseHasShortage =
          Number(
            warehouseRemainingResult.rows[0]?.out_of_stock_allocations || 0
          ) > 0;
        await client.query(
          `UPDATE order_warehouse_delivery_notes
           SET status = ?
           WHERE order_id = ? AND warehouse_id = ? AND status <> 'VOID'`,
          [warehouseHasShortage ? 'SHORTAGE' : 'DELIVERED', orderId, warehouseId]
        );
      }
    }
    const fullyDelivered =
      Number(remainingResult.rows[0]?.remaining_allocations || 0) === 0;

    if (fullyDelivered) {
      await client.query(
        `UPDATE orders
         SET status = 'DELIVERED',
             delivered_by = ?,
             delivered_at = NOW(),
             stock_deducted = 1,
             updated_at = NOW()
         WHERE id = ?`,
        [req.user.id, orderId]
      );
    } else {
      await client.query(
        'UPDATE orders SET updated_at = NOW() WHERE id = ?',
        [orderId]
      );
    }

    const preparedOrder = await loadDeliveryNoteOrder(
      client,
      orderId,
      capabilities
    );
    const deliveredFulfillment = preparedOrder.warehouse_fulfillments.find(
      (fulfillment) => Number(fulfillment.warehouse_id) === warehouseId
    );

    await client.query('COMMIT');
    clearCache();

    try {
      await auditLog({
        ...getActor(req),
        actionType:
          deliveredPairs > 0 || closedOutOfStockPairs > 0
            ? 'DELIVERED'
            : 'VERIFIED',
        module: 'orders',
        entity_type: 'warehouse_delivery_slip',
        entity_id: orderId,
        entityName:
          deliveredFulfillment?.warehouse_slip_number ||
          getOrderEntityName(order),
        description:
          deliveredPairs > 0 || closedOutOfStockPairs > 0
            ? `Verified and delivered ${deliveredFulfillment?.warehouse_slip_number || `warehouse ${warehouseId}`} for ${getOrderEntityName(order)}`
            : `Verified ${deliveredFulfillment?.warehouse_slip_number || `warehouse ${warehouseId}`} for ${getOrderEntityName(order)}; all products remain pending`,
        metadata: {
          order_number: orderId,
          delivery_note_number: order.delivery_note_number,
          warehouse_id: warehouseId,
          warehouse_name: deliveredFulfillment?.name,
          warehouse_slip_number: deliveredFulfillment?.warehouse_slip_number,
          delivered_pairs: deliveredPairs,
          out_of_stock_pairs: closedOutOfStockPairs,
          master_order_status: fullyDelivered ? 'DELIVERED' : 'PACKED',
          fulfillment_status: fullyDelivered
            ? 'DELIVERED'
            : deliveredPairs > 0
              ? 'PARTIALLY DELIVERED'
              : 'PACKED',
          verification_items: verificationItems,
        },
      });
    } catch (auditError) {
      // Delivery is already committed. Do not report it as failed and invite a
      // dangerous retry merely because the secondary audit write failed.
      console.error('Warehouse delivery audit failed:', auditError);
    }

    return res.json({
      success: true,
      message: fullyDelivered
        ? `${deliveredFulfillment?.warehouse_slip_number || 'Warehouse slip'} completed${closedOutOfStockPairs > 0 ? ` with ${closedOutOfStockPairs} out-of-stock pairs` : ''}. The master order is now complete.`
        : deliveredPairs > 0
          ? `${deliveredPairs} pairs delivered now.${closedOutOfStockPairs > 0 ? ` ${closedOutOfStockPairs} missing pairs were closed as out of stock.` : ''} Remaining products stay pending for later delivery.`
          : closedOutOfStockPairs > 0
            ? `${closedOutOfStockPairs} missing pairs were closed as out of stock without deducting stock.`
          : 'Warehouse check saved. No stock was deducted; all selected products remain pending.',
      data: preparedOrder,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// Reverse a mistakenly delivered warehouse slip without deleting its stock
// history. Restored allocations return to PLANNED in the same warehouse so the
// slip remains visible and must be physically checked again before redelivery.
const undoWarehouseFulfillmentDelivery = async (req, res, next) => {
  if (!canCorrectWarehouseSource(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to reverse warehouse deliveries.',
    });
  }

  const orderId = Number(req.params.id);
  const warehouseId = Number(req.params.warehouseId);
  const reason = String(req.body?.reason || '').trim();
  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    !Number.isInteger(warehouseId) ||
    warehouseId <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: 'Select a valid order and warehouse slip.',
    });
  }
  if (reason.length < 3) {
    return res.status(400).json({
      success: false,
      message: 'Enter why this warehouse delivery must be reversed.',
    });
  }

  const client = await getClient();
  let committed = false;
  let auditPayload = null;

  try {
    const capabilities = await getWarehouseAllocationCapabilities();
    if (
      !capabilities.supportsPlanning ||
      !capabilities.supportsDeliveredBy ||
      !capabilities.supportsDeliveredAt
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Warehouse delivery reversal requires sql/add-partial-warehouse-delivery.sql.',
      });
    }

    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const status = String(order.status || '').toUpperCase();
    if (!['PACKED', 'DELIVERED'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only a packed or delivered order can have a warehouse delivery reversed.',
      });
    }

    const allocationResult = await client.query(
      `SELECT allocation.id AS allocation_id,
              allocation.quantity,
              allocation.finished_good_id,
              item.id AS order_item_id,
              product.name AS product_name,
              warehouse.name AS warehouse_name
       FROM order_item_warehouse_allocations allocation
       JOIN order_items item ON item.id = allocation.order_item_id
       JOIN finished_goods product ON product.id = allocation.finished_good_id
       JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
       WHERE item.order_id = ?
         AND allocation.warehouse_id = ?
         AND allocation.allocation_status = 'DEDUCTED'
       ORDER BY allocation.id
       FOR UPDATE`,
      [orderId, warehouseId]
    );

    if (!allocationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This warehouse slip is not delivered or has already been reversed.',
      });
    }

    let restoredPairs = 0;
    for (const allocation of allocationResult.rows) {
      const quantity = Number(allocation.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        const error = new Error(
          `Invalid delivered quantity found for ${allocation.product_name}.`
        );
        error.statusCode = 422;
        throw error;
      }

      await client.query(
        `INSERT INTO finished_good_warehouse_stock
          (finished_good_id, warehouse_id, quantity, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           quantity = quantity + VALUES(quantity),
           updated_by = VALUES(updated_by)`,
        [
          allocation.finished_good_id,
          warehouseId,
          quantity,
          req.user.id,
          req.user.id,
        ]
      );
      await client.query(
        `UPDATE finished_goods
         SET quantity = quantity + ?
         WHERE id = ?`,
        [quantity, allocation.finished_good_id]
      );
      await client.query(
        `UPDATE order_item_warehouse_allocations
         SET allocation_status = 'PLANNED',
             packed_quantity = quantity,
             delivered_by = NULL,
             delivered_at = NULL
             ${
               capabilities.supportsVerification
                 ? `, verified_quantity = NULL,
                      verification_status = NULL,
                      verification_note = ?,
                      verified_by = NULL,
                      verified_at = NULL`
                 : ''
             }
         WHERE id = ? AND allocation_status = 'DEDUCTED'`,
        [
          ...(capabilities.supportsVerification
            ? [`Delivery reversed: ${reason}`.slice(0, 500)]
            : []),
          allocation.allocation_id,
        ]
      );
      await recordWarehouseMovement(client, {
        finishedGoodId: allocation.finished_good_id,
        warehouseId,
        quantity,
        movementType: 'DELIVERY_REVERSAL',
        referenceType: 'order',
        referenceId: orderId,
        notes: `Reversed warehouse delivery for order #${orderId}: ${reason}`,
        userId: req.user.id,
      });
      restoredPairs += quantity;
    }

    await client.query(
      `UPDATE orders
       SET status = 'PACKED',
           delivered_by = NULL,
           delivered_at = NULL,
           stock_deducted = 0,
           updated_at = NOW()
       WHERE id = ?`,
      [orderId]
    );
    if (await hasTable('order_warehouse_delivery_notes')) {
      await client.query(
        `UPDATE order_warehouse_delivery_notes
         SET status = 'ACTIVE'
         WHERE order_id = ? AND warehouse_id = ? AND status = 'DELIVERED'`,
        [orderId, warehouseId]
      );
    }

    const preparedOrder = await loadDeliveryNoteOrder(
      client,
      orderId,
      capabilities
    );
    await client.query('COMMIT');
    committed = true;
    clearCache();

    auditPayload = {
      ...getActor(req),
      actionType: 'REVERSED',
      module: 'orders',
      entity_type: 'warehouse_delivery_slip',
      entity_id: orderId,
      entityName: order.delivery_note_number || getOrderEntityName(order),
      description: `Reversed the delivered warehouse slip for ${allocationResult.rows[0].warehouse_name} on ${getOrderEntityName(order)}`,
      metadata: {
        order_number: orderId,
        delivery_note_number: order.delivery_note_number,
        warehouse_id: warehouseId,
        warehouse_name: allocationResult.rows[0].warehouse_name,
        restored_pairs: restoredPairs,
        reason,
        previous_order_status: status,
        new_order_status: 'PACKED',
        restored_allocation_status: 'PLANNED',
        requires_product_recheck: true,
      },
    };

    try {
      await auditLog(auditPayload);
    } catch (auditError) {
      console.error('Warehouse delivery reversal audit failed:', auditError);
    }

    return res.json({
      success: true,
      message: `${allocationResult.rows[0].warehouse_name} delivery was reversed and ${restoredPairs} pairs were restored. The warehouse slip is pending again; check its products before redelivery.`,
      data: preparedOrder,
    });
  } catch (err) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  } finally {
    client.release();
  }
};

const loadDeliveryNoteOrder = async (client, orderId, capabilities) => {
  const orderResult = await client.query(
    `SELECT orders.*,
            created_user.name AS created_by_name,
            confirmed_user.name AS confirmed_by_name,
            packed_user.name AS packed_by_name,
            delivered_user.name AS delivered_by_name
     FROM orders
     LEFT JOIN users created_user ON created_user.id = orders.created_by
     LEFT JOIN users confirmed_user ON confirmed_user.id = orders.confirmed_by
     LEFT JOIN users packed_user ON packed_user.id = orders.packed_by
     LEFT JOIN users delivered_user ON delivered_user.id = orders.delivered_by
     WHERE orders.id = ?`,
    [orderId]
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const itemsResult = await client.query(
    `SELECT item.id, item.order_id, item.finished_good_id, item.qty_ordered,
            product.name AS product_name,
            product.article_code,
            product.color,
            product.size,
            product.unit,
            product.inner_boxes_per_outer_box
     FROM order_items item
     JOIN finished_goods product ON product.id = item.finished_good_id
     WHERE item.order_id = ?
     ORDER BY item.id`,
    [orderId]
  );

  const itemIds = itemsResult.rows.map((item) => Number(item.id));
  let allocationRows = [];
  if (itemIds.length) {
    const { clause, params } = buildInClause(itemIds);
    const allocationResult = await client.query(
      `SELECT allocation.*, warehouse.name AS warehouse_name
       FROM order_item_warehouse_allocations allocation
       JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
       WHERE allocation.order_item_id IN ${clause}
         ${
           capabilities.supportsPlanning
             ? "AND allocation.allocation_status <> 'RELEASED'"
             : ''
         }
       ORDER BY allocation.id`,
      params
    );
    allocationRows = allocationResult.rows;
  }

  const configuredGroups = await loadWarehousePrintGroupMap(
    client,
    capabilities.supportsConfiguredGroups
  );
  const allocationsByItem = new Map();
  allocationRows.forEach((allocation) => {
    const printGroup = resolveWarehousePrintGroup(
      allocation.warehouse_id,
      allocation.warehouse_name,
      configuredGroups
    );
    const normalized = {
      ...allocation,
      // Always print by the current individual warehouse identity. Older
      // allocations may still contain the former combined group snapshots.
      print_group_code_snapshot: printGroup.code,
      print_group_name_snapshot: printGroup.name,
      print_group_display_order: printGroup.display_order,
    };
    const itemAllocations =
      allocationsByItem.get(Number(allocation.order_item_id)) || [];
    itemAllocations.push(normalized);
    allocationsByItem.set(Number(allocation.order_item_id), itemAllocations);
  });

  const items = itemsResult.rows.map((item) => ({
    ...item,
    warehouse_allocations: allocationsByItem.get(Number(item.id)) || [],
  }));
  const warehouseDeliveryNotes = await loadWarehouseDeliveryNotes(client, [
    order.id,
  ]);
  const warehouseSummary = buildWarehouseFulfillments(
    order,
    items,
    configuredGroups,
    warehouseDeliveryNotes
  );

  return {
    ...order,
    items,
    warehouse_delivery_note_numbers: warehouseDeliveryNotes.map(
      (note) => note.delivery_note_number
    ),
    warehouse_print_groups: warehouseSummary.fulfillments,
    warehouse_fulfillments: warehouseSummary.fulfillments,
    fulfillment_status: warehouseSummary.fulfillmentStatus,
    delivered_warehouse_count: warehouseSummary.deliveredCount,
    warehouse_fulfillment_count: warehouseSummary.totalCount,
  };
};

// Prepare a stable warehouse plan before opening the browser print dialog.
// It assigns no new DN when one already exists and does not deduct stock.
const prepareDeliveryNote = async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('START TRANSACTION');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const status = String(order.status || '').toUpperCase();
    if (!['CONFIRMED', 'PACKED', 'DELIVERED'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Confirm the order before preparing its delivery note.',
      });
    }

    let deliveryNoteNumber = order.delivery_note_number;
    const supportsPerWarehouseDeliveryNotes = await hasTable(
      'order_warehouse_delivery_notes'
    );
    if (!deliveryNoteNumber && !supportsPerWarehouseDeliveryNotes) {
      deliveryNoteNumber = await getNextDeliveryNoteNumber(
        client,
        order.created_at ? new Date(order.created_at) : new Date()
      );
      await client.query(
        `UPDATE orders
         SET delivery_note_number = ?,
             confirmed_by = COALESCE(confirmed_by, ?),
             confirmed_at = COALESCE(confirmed_at, NOW()),
             updated_at = NOW()
         WHERE id = ?`,
        [deliveryNoteNumber, req.user.id, order.id]
      );
    }

    const capabilities = await getWarehouseAllocationCapabilities();
    if (status !== 'DELIVERED') {
      await ensurePlannedWarehouseAllocations(client, order.id, req.user.id);
      if (status === 'PACKED' && capabilities.supportsPackedQuantity) {
        await client.query(
          `UPDATE order_item_warehouse_allocations allocation
           JOIN order_items item ON item.id = allocation.order_item_id
           SET allocation.packed_quantity = allocation.quantity
           WHERE item.order_id = ?
             AND allocation.allocation_status = 'PLANNED'`,
          [order.id]
        );
      }
      if (supportsPerWarehouseDeliveryNotes) {
        await ensureWarehouseDeliveryNotes(client, order, req.user.id);
      }
    }
    const preparedOrder = await loadDeliveryNoteOrder(
      client,
      order.id,
      capabilities
    );

    await client.query('COMMIT');
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'PREPARED',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName({
        ...order,
        delivery_note_number: deliveryNoteNumber,
      }),
      description: `Prepared warehouse delivery notes for ${
        preparedOrder.warehouse_delivery_note_numbers?.join(', ') ||
        deliveryNoteNumber ||
        `order #${order.id}`
      }`,
      metadata: {
        order_number: order.id,
        delivery_note_number: deliveryNoteNumber,
        warehouse_delivery_note_numbers:
          preparedOrder.warehouse_delivery_note_numbers || [],
        warehouse_slips: preparedOrder.warehouse_fulfillments,
      },
    });

    return res.json({ success: true, data: preparedOrder });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.shortage ? { shortages: [err.shortage] } : {}),
      });
    }
    next(err);
  } finally {
    client.release();
  }
};

const logPrint = async (req, res, next) => {
  const [supportsPrintedAt, supportsPrintCount] = await Promise.all([
    hasColumn('orders', 'delivery_note_printed_at'),
    hasColumn('orders', 'delivery_note_print_count'),
  ]);
  const client = await getClient();

  try {
    await client.query('START TRANSACTION');
    const orderRows = await client.query(
      `SELECT id, customer_name, status, delivery_note_number
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!orderRows.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRows.rows[0];
    if (!['CONFIRMED', 'PACKED', 'DELIVERED'].includes(String(order.status || '').toUpperCase())) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only confirmed, packed, or delivered orders can be printed.',
      });
    }
    if (!supportsPrintedAt || !supportsPrintCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Delivery-note printing requires sql/add-delivery-note-print-state.sql.',
      });
    }

    await client.query(
      `UPDATE orders
       SET delivery_note_printed_at = COALESCE(delivery_note_printed_at, NOW()),
           delivery_note_print_count = delivery_note_print_count + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [order.id]
    );
    if (await hasTable('order_warehouse_delivery_notes')) {
      const printedNumbers = (Array.isArray(req.body?.warehouse_slips)
        ? req.body.warehouse_slips
        : []
      )
        .map((slip) => String(slip?.slip_number || '').trim())
        .filter(Boolean);
      if (printedNumbers.length) {
        const { clause, params } = buildInClause(printedNumbers);
        await client.query(
          `UPDATE order_warehouse_delivery_notes
           SET printed_at = COALESCE(printed_at, NOW()),
               print_count = print_count + 1
           WHERE order_id = ?
             AND delivery_note_number IN ${clause}`,
          [order.id, ...params]
        );
      }
    }
    await client.query('COMMIT');

    await auditLog({
      ...getActor(req),
      actionType: 'PRINTED',
      module: 'orders',
      entity_type: 'order',
      entity_id: order.id,
      entityName: getOrderEntityName(order),
      description: `Printed delivery note for ${getOrderEntityName(order)}`,
      metadata: {
        order_number: order.id,
        customer_name: order.customer_name,
        status: order.status,
        delivery_note_number: order.delivery_note_number,
        print_type: req.body?.print_type || 'delivery_note',
        warehouse_groups: Array.isArray(req.body?.warehouse_groups)
          ? req.body.warehouse_groups
          : [],
        warehouse_slips: Array.isArray(req.body?.warehouse_slips)
          ? req.body.warehouse_slips
          : [],
      },
    });

    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getAll, getFilters, getOverview, getAvailability, getOfferPurchases, getOfferVsRegularReport, create, correctItems, updateStatus, assignDeliveryNote, correctWarehouseDeliveryNoteNumbers, reopenPacking, undoConfirmation, verifyWarehouseFulfillment, deliverWarehouseFulfillment, undoWarehouseFulfillmentDelivery, prepareDeliveryNote, logPrint };
