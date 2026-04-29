const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];

const normalizeItems = (items = []) =>
  items
    .map((item) => ({
      finished_good_id: Number(item.finished_good_id),
      qty_ordered: Number(item.qty_ordered),
    }))
    .filter((item) => item.finished_good_id > 0 && item.qty_ordered > 0);

const getReservedByProduct = async (client, productIds = []) => {
  if (!productIds.length) return new Map();

  const result = await client.query(
    `SELECT oi.finished_good_id, COALESCE(SUM(oi.qty_ordered), 0) AS reserved_qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status = ANY($1::text[])
       AND oi.finished_good_id = ANY($2::int[])
     GROUP BY oi.finished_good_id`,
    [ACTIVE_RESERVATION_STATUSES, productIds]
  );

  return new Map(result.rows.map((row) => [Number(row.finished_good_id), Number(row.reserved_qty)]));
};

const getAll = async (req, res, next) => {
  try {
    const params = [];
    let where = '';

    if (req.user.role === 'USER') {
      params.push(req.user.id);
      where = `WHERE o.created_by = $${params.length}`;
    }

    const result = await query(
      `SELECT o.*, u.name AS created_by_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.created_by
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    const orderIds = result.rows.map((order) => order.id);
    let items = [];

    if (orderIds.length) {
      const itemResult = await query(
        `SELECT oi.*, fg.name AS product_name, fg.article_code, fg.color, fg.size, fg.unit, fg.quantity AS physical_stock
         FROM order_items oi
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE oi.order_id = ANY($1::int[])
         ORDER BY oi.id`,
        [orderIds]
      );
      items = itemResult.rows;
    }

    const groupedItems = items.reduce((acc, item) => {
      acc[item.order_id] = acc[item.order_id] || [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    return res.json({
      success: true,
      data: result.rows.map((order) => ({
        ...order,
        items: groupedItems[order.id] || [],
      })),
    });
  } catch (err) {
    next(err);
  }
};

const getAvailability = async (req, res, next) => {
  try {
    const params = [];
    let sql = 'SELECT fg.* FROM finished_goods fg WHERE 1=1';

    if (req.user.role === 'USER') {
      params.push(req.user.id);
      sql += ` AND EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = fg.id
          AND upp.user_id = $${params.length}
          AND upp.can_view = TRUE
      )`;
    }

    sql += ' ORDER BY fg.article_code, fg.color, fg.size';
    const products = await query(sql, params);
    const productIds = products.rows.map((item) => item.id);
    const reservedByProduct = await getReservedByProduct({ query }, productIds);

    return res.json({
      success: true,
      data: products.rows.map((item) => {
        const reserved_qty = reservedByProduct.get(Number(item.id)) || 0;
        const physical_stock = Number(item.quantity || 0);
        return {
          ...item,
          physical_stock,
          reserved_qty,
          available_qty: physical_stock - reserved_qty,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { customer_name, customer_phone, notes } = req.body;
    const items = normalizeItems(req.body.items);

    if (!customer_name || !items.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Customer name and at least one order item are required' });
    }

    const productIds = [...new Set(items.map((item) => item.finished_good_id))];
    const products = await client.query(
      `SELECT id, name, quantity
       FROM finished_goods
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [productIds]
    );

    if (products.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'One or more finished goods were not found' });
    }

    const productById = new Map(products.rows.map((item) => [Number(item.id), item]));
    const reservedByProduct = await getReservedByProduct(client, productIds);
    const requestedByProduct = items.reduce((acc, item) => {
      acc.set(item.finished_good_id, (acc.get(item.finished_good_id) || 0) + item.qty_ordered);
      return acc;
    }, new Map());

    const shortages = [];
    for (const [productId, requestedQty] of requestedByProduct.entries()) {
      const product = productById.get(productId);
      const physicalStock = Number(product.quantity || 0);
      const reservedQty = reservedByProduct.get(productId) || 0;
      const availableQty = physicalStock - reservedQty;

      if (requestedQty > availableQty) {
        shortages.push({
          finished_good_id: productId,
          product_name: product.name,
          requested_qty: requestedQty,
          physical_stock: physicalStock,
          reserved_qty: reservedQty,
          available_qty: availableQty,
        });
      }
    }

    if (shortages.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: 'Not enough available stock to reserve this order',
        shortages,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_phone, notes, created_by)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [customer_name, customer_phone || null, notes || null, req.user.id]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, finished_good_id, qty_ordered)
         VALUES ($1,$2,$3)`,
        [order.id, item.finished_good_id, item.qty_ordered]
      );
    }

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: 'ORDER_CREATED',
      tableName: 'orders',
      recordId: order.id,
      detail: `Order #${order.id} reserved ${items.length} item line(s) for ${customer_name}`,
    });

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const updateStatus = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { status } = req.body;
    const nextStatus = String(status || '').toUpperCase();

    if (!ALL_STATUSES.includes(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Cannot change a ${order.status.toLowerCase()} order` });
    }

    const itemsResult = await client.query(
      `SELECT oi.*, fg.name AS product_name, fg.quantity
       FROM order_items oi
       JOIN finished_goods fg ON fg.id = oi.finished_good_id
       WHERE oi.order_id = $1
       FOR UPDATE OF fg`,
      [order.id]
    );

    if (nextStatus === 'DELIVERED') {
      const shortages = itemsResult.rows
        .map((item) => ({
          finished_good_id: item.finished_good_id,
          product_name: item.product_name,
          ordered_qty: Number(item.qty_ordered),
          physical_stock: Number(item.quantity || 0),
        }))
        .filter((item) => item.ordered_qty > item.physical_stock);

      if (shortages.length) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          message: 'Not enough physical stock to deliver this order',
          shortages,
        });
      }

      for (const item of itemsResult.rows) {
        await client.query(
          'UPDATE finished_goods SET quantity = quantity - $1 WHERE id = $2',
          [item.qty_ordered, item.finished_good_id]
        );
      }
    }

    const result = await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, order.id]
    );

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: nextStatus === 'DELIVERED' ? 'ORDER_DELIVERED' : 'ORDER_STATUS_UPDATED',
      tableName: 'orders',
      recordId: order.id,
      detail: `Order #${order.id} changed from ${order.status} to ${nextStatus}`,
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getAll,
  getAvailability,
  create,
  updateStatus,
};
