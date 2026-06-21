const { query, getClient } = require('../config/db');
const { hasColumn } = require('../utils/schemaSupport');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];
const DEFAULT_DISPLAY_QUANTITY = 450;

const getProductDisplayQuantity = (product) => {
  const value = Number(product?.display_quantity);

  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DISPLAY_QUANTITY;
};

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

    await client.query(
      `INSERT INTO order_item_warehouse_allocations
         (order_item_id, finished_good_id, warehouse_id, quantity, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [item.id, item.finished_good_id, stock.warehouse_id, deduct, userId]
    );

    await client.query(
      `INSERT INTO finished_good_warehouse_movements
         (finished_good_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, 'ORDER_OUT', 'order', ?, ?, ?)`,
      [
        item.finished_good_id,
        stock.warehouse_id,
        deduct,
        item.order_id,
        `Delivered order #${item.order_id}`,
        userId,
      ]
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
    const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');
    const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');
    const includeHidden =
      req.query.include_hidden === '1' &&
      ['ADMIN', 'CO_ADMIN'].includes(req.user.role);

    let sql = `SELECT * FROM finished_goods WHERE is_deleted = 0${
      includeHidden ? '' : ' AND is_visible = 1'
    }`;
    const params = [];

    if (['USER', 'MEMBER', 'ELDER'].includes(req.user.role)) {
      sql += ` AND EXISTS (
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
      params.push(req.user.id, req.user.id);
    }

    sql += supportsDisplayOrder
      ? ' ORDER BY display_order ASC, article_code, color, id'
      : ' ORDER BY article_code, color, id';

    const products = await query(sql, params);
    const productIds = products.rows.map((p) => p.id);

    const reserved = await getReservedByProduct(
      (sql, params) => query(sql, params),
      productIds
    );

    return res.json({
      success: true,
      data: products.rows.map((p) => {
        const reserved_qty = reserved.get(p.id) || 0;
        const physical_stock = Number(p.quantity || 0);
        const display_quantity = supportsDisplayQuantity
          ? getProductDisplayQuantity(p)
          : DEFAULT_DISPLAY_QUANTITY;

        // Step 1: actual available = physical minus reserved
        const available_qty = Math.max(0, physical_stock - reserved_qty);

        // Step 2: cap what user sees at this product's display quantity
        const display_stock = Math.min(display_quantity, available_qty);

        return {
          ...p,
          physical_stock,  // 660 — actual warehouse stock
          reserved_qty,    // 300 — orders in progress
          available_qty,   // 360 — actual available (physical - reserved)
          display_stock,   // 360 — what user sees after the per-product cap
          display_quantity,
        };
      }),
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

    let productSql = `
      SELECT id, name, quantity${supportsDisplayQuantity ? ', display_quantity' : ''}
      FROM finished_goods
      WHERE is_deleted = 0
        AND is_visible = 1
        AND id IN ${clause}
    `;
    const productParams = [...params];

    if (['USER', 'MEMBER', 'ELDER'].includes(req.user.role)) {
      productSql += ` AND EXISTS (
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
      productParams.push(req.user.id, req.user.id);
    }

    const products = await client.query(productSql, productParams);

    if (products.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Some products not found',
      });
    }

    const productMap = new Map(products.rows.map((p) => [p.id, p]));

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

    // Availability check — mirrors getAvailability exactly
    const shortages = [];
    for (const [id, qty] of requested.entries()) {
      const p = productMap.get(id);
      const physicalStock = Number(p.quantity ?? 0);
      const reservedQty = reserved.get(id) || 0;
      const displayQuantity = supportsDisplayQuantity
        ? getProductDisplayQuantity(p)
        : DEFAULT_DISPLAY_QUANTITY;

      // Step 1: actual available
      const available = Math.max(0, physicalStock - reservedQty);
      // Step 2: cap at this product's display quantity
      const displayAvailable = Math.min(displayQuantity, available);

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

    const orderRes = await client.query(
      `INSERT INTO orders
        (customer_name, customer_phone, notes, pan_number, transport_name, customer_address, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

    const orderId = orderRes.insertId;

    if (!orderId) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Failed to create order',
      });
    }

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, finished_good_id, qty_ordered)
         VALUES (?, ?, ?)`,
        [orderId, item.finished_good_id, item.qty_ordered]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({ success: true, data: { id: orderId } });

  } catch (err) {
    await client.query('ROLLBACK');
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
      `SELECT * FROM orders WHERE id IN ${idClause}`,
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

    if (status === 'CONFIRMED' && !order.confirmed_by) {
      const lastDnRes = await client.query(
        `SELECT delivery_note_number
         FROM orders
         WHERE status != 'CANCELLED'
           AND delivery_note_number IS NOT NULL
         ORDER BY CAST(SUBSTRING(delivery_note_number, 4) AS UNSIGNED) DESC
         LIMIT 1
         FOR UPDATE`
      );
      const lastDnNumber = Number(
        String(lastDnRes.rows[0]?.delivery_note_number || '').replace('DN-', '')
      );
      const nextDN = order.delivery_note_number || `DN-${(lastDnNumber || 1940) + 1}`;

      updateFields.push('confirmed_by = ?', 'confirmed_at = NOW()', 'delivery_note_number = ?');
      updateParams.push(req.user.id, nextDN);
    } else if (status === 'PACKED' && !order.packed_by) {
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

    return res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getAll, getAvailability, create, updateStatus };
