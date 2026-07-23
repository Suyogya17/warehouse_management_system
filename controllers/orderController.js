const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn, hasTable } = require('../utils/schemaSupport');
const { appendFiscalInsertFields, getNepaliFiscalMeta } = require('../utils/nepaliFiscalYear');
const { clearCache } = require('../middleware/cacheMiddleware');
const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const {
  hasOfferCampaignSchema,
  getOfferCampaignUsage,
} = require('../utils/offerCampaigns');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];
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

const allocateWarehouseStockForDelivery = async (client, item, userId) => {
  let remaining = Number(item.qty_ordered || 0);
  const allocations = [];

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

    const allocationInsert = await appendFiscalInsertFields(
      'order_item_warehouse_allocations',
      ['order_item_id', 'finished_good_id', 'warehouse_id', 'quantity', 'created_by'],
      [item.id, item.finished_good_id, stock.warehouse_id, deduct, userId]
    );

    await client.query(
      `INSERT INTO order_item_warehouse_allocations (${allocationInsert.columns.join(', ')})
       VALUES (${allocationInsert.columns.map(() => '?').join(', ')})`,
      allocationInsert.values
    );

    const movementInsert = await appendFiscalInsertFields(
      'finished_good_warehouse_movements',
      ['finished_good_id', 'warehouse_id', 'quantity', 'movement_type', 'reference_type', 'reference_id', 'notes', 'created_by'],
      [
        item.finished_good_id,
        stock.warehouse_id,
        deduct,
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

    allocations.push({
      warehouse_id: stock.warehouse_id,
      warehouse_name: stock.warehouse_name,
      quantity: deduct,
    });

    remaining -= deduct;
  }

  return allocations;
};

// ─── GET ALL ORDERS ───────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    const limit = Math.min(Math.max(Number(req.query.limit || 0), 0), 200);
    const limitClause = limit ? 'LIMIT ?' : '';

    if (req.user.role === 'USER') {
      where = 'WHERE o.created_by = ?';
      params.push(req.user.id);
    }

    const orders = await query(
      `SELECT o.*, 
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
      limit ? [...params, limit] : params
    );

    const orderIds = orders.rows.map((o) => o.id);
    let items = [];

    if (orderIds.length) {
      const { clause, params: orderParams } = buildInClause(orderIds);
      const itemResult = await query(
        `SELECT oi.*, fg.name AS product_name,
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

    if (items.length) {
      const itemIds = items.map((item) => item.id);
      const { clause, params: itemParams } = buildInClause(itemIds);
      const allocationResult = await query(
        `SELECT oiwa.*,
                w.name AS warehouse_name
         FROM order_item_warehouse_allocations oiwa
         JOIN warehouses w ON w.id = oiwa.warehouse_id
         WHERE oiwa.order_item_id IN ${clause}
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

    let productSql = `
      SELECT id, name, article_code, sole_code, color, quantity, price, inner_boxes_per_outer_box${supportsDisplayQuantity ? ', display_quantity' : ''}${supportsOfferAudience ? ', offer_enabled, offer_label, offer_ends_at, offer_all_users' : ''}${supportsOfferCampaigns ? ', offer_campaign_id' : ''}
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
      )`;
      if (supportsOfferAudience && supportsOfferUsers) {
        productSql += ` AND ((${normalPermissionSql}) OR (
          offer_enabled = 1
          AND (offer_ends_at IS NULL OR offer_ends_at >= NOW())
          AND (offer_all_users = 1 OR EXISTS (
            SELECT 1 FROM finished_good_offer_users fgo
            WHERE fgo.finished_good_id = finished_goods.id AND fgo.user_id = ?
          ))
        ))`;
        productParams.push(req.user.id, req.user.id, req.user.id);
      } else {
        productSql += ` AND (${normalPermissionSql})`;
        productParams.push(req.user.id, req.user.id);
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
      const effectiveDisplayQuantity =
        req.user.role === 'USER' &&
        offerIsActive &&
        Number(p.offer_all_users) !== 1 &&
        userOfferTarget != null
          ? userOfferTarget.display_quantity
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
        offerSnapshotByProduct.set(Number(product.id), {
          offer_label_snapshot: product.offer_label || 'Special offer',
          offer_display_percentage: target?.display_percentage ?? null,
          offer_display_quantity: target?.display_quantity ?? getProductDisplayQuantity(product),
          offer_price_snapshot: Number(product.price || 0) > 0 ? Number(product.price) + 50 : null,
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
      `SELECT id, name, article_code, color, quantity, inner_boxes_per_outer_box
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

    if (status === 'CANCELLED' && !cancellationReason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required',
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
      },
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getAvailability, getOfferPurchases, create, correctItems, updateStatus, assignDeliveryNote, reopenPacking, logPrint };
