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
const DUPLICATE_ORDER_WINDOW_HOURS = Math.max(
  1,
  Math.min(168, Number.parseInt(process.env.DUPLICATE_ORDER_WINDOW_HOURS, 10) || 72)
);
const DEFAULT_DISPLAY_QUANTITY = 450;
const FISCAL_DELIVERY_NOTE_START_YEAR = 2083;
const ORDER_CORRECTION_CO_ADMINS = new Set([
  'suyogya shrestha',
  'suyogya shresth',
  'suvarna shrestha',
  'hirdaya shrestha',
]);

const canCorrectOrders = (user = {}) =>
  String(user.role || '').toUpperCase() === 'CO_ADMIN' &&
  ORDER_CORRECTION_CO_ADMINS.has(
    String(user.name || '').trim().replace(/\s+/g, ' ').toLowerCase()
  );

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

const getNextDeliveryNoteNumber = async (client, date = new Date()) =>
  shouldUseFiscalDeliveryNotes(date)
    ? getNextFiscalDeliveryNoteNumber(client, date)
    : getNextLegacyDeliveryNoteNumber(client);

// ─── RESERVED STOCK ───────────────────────────────
const getReservedByProduct = async (executor, productIds = []) => {
  if (!productIds.length) return new Map();

  const { clause: statusClause, params: statusParams } =
    buildInClause(ACTIVE_RESERVATION_STATUSES);
  const { clause: productClause, params: productParams } =
    buildInClause(productIds);

  const result = await executor(
    `SELECT oi.finished_good_id,
            COALESCE(SUM(oi.qty_ordered), 0) AS reserved_qty
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
  ]);

  return {
    supportsPlanning,
    supportsPackedQuantity,
    supportsGroupCode,
    supportsGroupName,
    supportsConfiguredGroups,
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

const recordWarehouseOrderMovement = async (
  client,
  { item, warehouseId, quantity, userId }
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
      item.finished_good_id,
      warehouseId,
      quantity,
      'ORDER_OUT',
      'order',
      item.order_id,
      `Delivered order #${item.order_id}`,
      userId,
    ]
  );

  await client.query(
    `INSERT INTO finished_good_warehouse_movements (${movementInsert.columns.join(', ')})
     VALUES (${movementInsert.columns.map(() => '?').join(', ')})`,
    movementInsert.values
  );
};

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
            product.name AS product_name
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
    `SELECT order_item_id, COALESCE(SUM(quantity), 0) AS allocated_quantity
     FROM order_item_warehouse_allocations
     WHERE order_item_id IN ${itemClause}
       AND allocation_status = 'PLANNED'
     GROUP BY order_item_id`,
    itemParams
  );
  const existingByItem = new Map(
    existingResult.rows.map((row) => [
      Number(row.order_item_id),
      Number(row.allocated_quantity || 0),
    ])
  );
  const hasCompletePlan = itemsResult.rows.every(
    (item) =>
      Math.abs(
        Number(item.qty_ordered || 0) -
          Number(existingByItem.get(Number(item.id)) || 0)
      ) < 0.001
  );

  if (hasCompletePlan) return;

  await releasePlannedWarehouseAllocations(client, orderId, true);

  const configuredGroups = await loadWarehousePrintGroupMap(
    client,
    capabilities.supportsConfiguredGroups
  );

  for (const item of itemsResult.rows) {
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

    let remaining = Number(item.qty_ordered || 0);
    const availableTotal = stockResult.rows.reduce(
      (sum, stock) =>
        sum +
        Math.max(
          0,
          Number(stock.quantity || 0) -
            Number(plannedByWarehouse.get(Number(stock.warehouse_id)) || 0)
        ),
      0
    );

    if (availableTotal + 0.001 < remaining) {
      const error = new Error(
        `Not enough unallocated warehouse stock for ${item.product_name}.`
      );
      error.statusCode = 422;
      error.shortage = {
        product_name: item.product_name,
        ordered_qty: Number(item.qty_ordered || 0),
        warehouse_stock: availableTotal,
      };
      throw error;
    }

    for (const stock of stockResult.rows) {
      if (remaining <= 0.001) break;

      const available = Math.max(
        0,
        Number(stock.quantity || 0) -
          Number(plannedByWarehouse.get(Number(stock.warehouse_id)) || 0)
      );
      if (available <= 0) continue;

      const allocatedQuantity = Math.min(available, remaining);
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
      `SELECT allocation.*, warehouse.name AS warehouse_name
       FROM order_item_warehouse_allocations allocation
       JOIN warehouses warehouse ON warehouse.id = allocation.warehouse_id
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
           }
           WHERE id = ?`,
          [allocation.id]
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

  const totalWarehouseQty = warehouseStock.rows.reduce(
    (sum, row) => sum + Number(row.quantity || 0),
    0
  );

  if (totalWarehouseQty < remaining) {
    const error = new Error('Not enough warehouse stock to deliver this order');
    error.statusCode = 422;
    error.shortage = {
      product_name: item.product_name,
      ordered_qty: Number(item.qty_ordered),
      warehouse_stock: totalWarehouseQty,
    };
    throw error;
  }

  for (const stock of warehouseStock.rows) {
    if (remaining <= 0) break;

    const available = Number(stock.quantity || 0);
    const deduct = Math.min(available, remaining);

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
    ] =
      await Promise.all([
        hasColumn('orders', 'cancellation_code'),
        hasColumn('orders', 'duplicate_of_order_id'),
        hasColumn('order_items', 'unit_price_snapshot'),
        hasColumn('order_items', 'price_currency_snapshot'),
        hasColumn('order_item_warehouse_allocations', 'allocation_status'),
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

    if (req.user.role === 'USER') {
      conditions.push('o.created_by = ?');
      params.push(req.user.id);
    }

    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    if (ALL_STATUSES.includes(requestedStatus)) {
      conditions.push('o.status = ?');
      params.push(requestedStatus);
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      const likeSearch = `%${search}%`;
      conditions.push(`(
        CAST(o.id AS CHAR) = ?
        OR o.customer_name LIKE ?
        OR o.customer_phone LIKE ?
        OR o.delivery_note_number LIKE ?
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
              o.stock_deducted,
              o.delivery_note_number,
              o.confirmed_by,
              o.confirmed_at,
              o.packed_by,
              o.packed_at,
              o.delivered_by,
              o.delivered_at,
              u_created.name AS created_by_name,
              u_confirmed.name AS confirmed_by_name,
              u_packed.name AS packed_by_name,
              u_delivered.name AS delivered_by_name
       FROM orders o
       LEFT JOIN users u_created ON u_created.id = o.created_by
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
                w.name AS warehouse_name
         FROM order_item_warehouse_allocations oiwa
         JOIN warehouses w ON w.id = oiwa.warehouse_id
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

    return res.json({
      success: true,
      data: orders.rows.map((o) => ({ ...o, items: grouped[o.id] || [] })),
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

    let productSql = `
      SELECT id, name, article_code, sole_code, color, quantity, price, inner_boxes_per_outer_box${supportsIndiaPrice ? ', india_price' : ''}${supportsDisplayQuantity ? ', display_quantity' : ''}${supportsOfferAudience ? ', offer_enabled, offer_label, offer_ends_at, offer_all_users' : ''}${supportsOfferCampaigns ? ', offer_campaign_id' : ''}
      FROM finished_goods
      WHERE is_deleted = 0
        AND is_visible = 1
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
      )${supportsPercentageAllocations ? ` AND (
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
          req.user.id
        );
      } else {
        productSql += ` AND (${normalPermissionSql})`;
        productParams.push(
          req.user.id,
          req.user.id,
          ...(supportsPercentageAllocations ? [req.user.id] : [])
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
      )`;
      productParams.push(req.user.id, req.user.id);
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

    if (req.user.role === 'USER') {
      const pricingResult = await client.query(
        `SELECT currency_code${
          supportsExchangeRate ? ', exchange_rate' : ''
        }${
          supportsRegularPriceMarkup ? ', regular_price_markup' : ''
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
        const indiaPrice = Number(product?.india_price);
        return Number.isFinite(indiaPrice) ? indiaPrice : null;
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
         WHERE upp.user_id = ?
           AND upp.allocation_quantity IS NOT NULL
           AND upp.finished_good_id IN ${clause}
         GROUP BY upp.finished_good_id, upp.allocation_quantity,
                  upp.allocation_percentage, upp.allocation_started_at`,
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
            },
          ];
        })
      );
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
    for (const [id, qty] of requested.entries()) {
      const p = productMap.get(id);
      const physicalStock = Number(p.quantity ?? 0);
      const reservedQty = reserved.get(id) || 0;
      const displayQuantity = supportsDisplayQuantity
        ? getProductDisplayQuantity(p)
        : DEFAULT_DISPLAY_QUANTITY;
      const userOfferTarget = userOfferTargets.get(Number(id));
      const offerIsActive = isActiveOfferProduct(p);
      const percentageAllocation = userPercentageAllocations.get(Number(id));
      const effectiveDisplayQuantity =
        req.user.role === 'USER' &&
        offerIsActive &&
        Number(p.offer_all_users) !== 1 &&
        userOfferTarget != null
          ? userOfferTarget.display_quantity
          : req.user.role === 'USER' &&
              !offerIsActive &&
              percentageAllocation
            ? percentageAllocation.remaining_quantity
            : displayQuantity;
      const usedOfferQuantity =
        req.user.role === 'USER' && offerIsActive
          ? Number(campaignUsage.get(Number(p.offer_campaign_id)) || 0)
          : 0;
      const remainingDisplayQuantity =
        req.user.role === 'USER' && offerIsActive
          ? Math.max(0, effectiveDisplayQuantity - usedOfferQuantity)
          : effectiveDisplayQuantity;

      // Step 1: actual available
      const available = Math.max(0, physicalStock - reservedQty);
      // Step 2: cap at this product's display quantity
      const displayAvailable = Math.min(remainingDisplayQuantity, available);

      if (qty > displayAvailable) {
        shortages.push({
          finished_good_id: id,
          product_name: p.name,
          requested: qty,
          available: displayAvailable,
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
          ? baseUnitPrice + regularPriceMarkup
          : null;
      const orderItemColumns = ['order_id', 'finished_good_id', 'qty_ordered'];
      const orderItemValues = [orderId, item.finished_good_id, item.qty_ordered];
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
    const productsResult = await client.query(
      `SELECT id, name, article_code, color, quantity, price, inner_boxes_per_outer_box
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
    const supportsUnitPriceSnapshot = await hasColumn(
      'order_items',
      'unit_price_snapshot'
    );
    const supportsPriceCurrencySnapshot = await hasColumn(
      'order_items',
      'price_currency_snapshot'
    );
    let correctionRegularMarkup = 0;
    if (supportsRegularPriceMarkup) {
      const pricingResult = await client.query(
        `SELECT currency_code, regular_price_markup
         FROM users
         WHERE id = ?`,
        [order.created_by]
      );
      const pricing = pricingResult.rows[0] || {};
      if (String(pricing.currency_code || 'NPR').toUpperCase() === 'NPR') {
        correctionRegularMarkup = Math.max(
          0,
          Number(pricing.regular_price_markup || 0)
        );
      }
    }
    const oldItemByProduct = new Map(oldItemsResult.rows.map((item) => [Number(item.finished_good_id), item]));
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
        const basePrice = Number(item.product.price);
        const fallbackPrice =
          Number(oldItem?.ordered_from_offer || 0) === 1
            ? oldItem?.offer_price_snapshot
            : basePrice > 0
              ? basePrice + correctionRegularMarkup
              : null;
        columns.push('unit_price_snapshot');
        values.push(oldItem?.unit_price_snapshot ?? fallbackPrice ?? null);
      }
      if (supportsPriceCurrencySnapshot) {
        columns.push('price_currency_snapshot');
        values.push(oldItem?.price_currency_snapshot ?? 'NPR');
      }
      const insert = await appendFiscalInsertFields('order_items', columns, values);
      await client.query(`INSERT INTO order_items (${insert.columns.join(', ')}) VALUES (${insert.columns.map(() => '?').join(', ')})`, insert.values);
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

    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot change a ${order.status.toLowerCase()} order`,
      });
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
      if (!order.delivery_note_number) {
        const nextDN = await getNextDeliveryNoteNumber(client, order.created_at ? new Date(order.created_at) : new Date());
        updateFields.push('delivery_note_number = ?');
        updateParams.push(nextDN);
      }
    }

    if (status === 'PACKED' && !order.packed_by) {
      updateFields.push('packed_by = ?', 'packed_at = NOW()');
      updateParams.push(req.user.id);
    } else if (status === 'DELIVERED' && !order.delivered_by) {
      updateFields.push('delivered_by = ?', 'delivered_at = NOW()');
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
    }

    if (status === 'CANCELLED') {
      await releasePlannedWarehouseAllocations(client, order.id);
    }

    // Deduct physical stock on delivery
    if (status === 'DELIVERED') {
      const { clause: oClause, params: oParams } = buildInClause([order.id]);
      const itemsRes = await client.query(
        `SELECT oi.*, fg.name AS product_name, fg.quantity
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
      },
    });

    return res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    await client.query('ROLLBACK');
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
    if (!deliveryNoteNumber) {
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
      description: `Assigned ${deliveryNoteNumber} to ${getOrderEntityName(order)}`,
      metadata: {
        order_number: order.id,
        status: order.status,
        delivery_note_number: deliveryNoteNumber,
      },
    });

    return res.json({
      success: true,
      message: `${deliveryNoteNumber} assigned successfully.`,
      data: { id: order.id, delivery_note_number: deliveryNoteNumber },
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
  const groups = new Map();
  items.forEach((item) => {
    item.warehouse_allocations.forEach((allocation) => {
      const code = allocation.print_group_code_snapshot;
      if (!groups.has(code)) {
        groups.set(code, {
          code,
          name: allocation.print_group_name_snapshot,
          display_order: Number(allocation.print_group_display_order || 999),
          pairs: 0,
        });
      }
      groups.get(code).pairs += Number(allocation.quantity || 0);
    });
  });

  return {
    ...order,
    items,
    warehouse_print_groups: [...groups.values()].sort(
      (left, right) => left.display_order - right.display_order
    ),
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
    if (!deliveryNoteNumber) {
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
      description: `Prepared grouped delivery note ${deliveryNoteNumber}`,
      metadata: {
        order_number: order.id,
        delivery_note_number: deliveryNoteNumber,
        warehouse_groups: preparedOrder.warehouse_print_groups,
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
  try {
    const orderRows = await query(
      `SELECT id, customer_name, status, delivery_note_number
       FROM orders
       WHERE id = ?`,
      [req.params.id]
    );

    if (!orderRows.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRows.rows[0];

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
      },
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getAvailability, getOfferPurchases, create, correctItems, updateStatus, assignDeliveryNote, reopenPacking, prepareDeliveryNote, logPrint };
