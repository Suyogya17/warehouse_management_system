const { query, getClient } = require('../config/db');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];

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

// ─── GET ALL ORDERS ───────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const params = [];
    let where = '';

    if (req.user.role === 'USER') {
      where = 'WHERE o.created_by = ?';
      params.push(req.user.id);
    }

    const orders = await query(
      `SELECT o.*, u.name AS created_by_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.created_by
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    const orderIds = orders.rows.map((o) => o.id);
    let items = [];

    if (orderIds.length) {
      const { clause, params: orderParams } = buildInClause(orderIds);
      const itemResult = await query(
        `SELECT oi.*, fg.name AS product_name,
                fg.article_code, fg.color, fg.size,
                fg.unit, fg.quantity AS physical_stock
         FROM order_items oi
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE oi.order_id IN ${clause}
         ORDER BY oi.id`,
        orderParams
      );
      items = itemResult.rows;
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
    let sql = 'SELECT * FROM finished_goods';
    const params = [];

    if (req.user.role === 'USER') {
      sql += ` WHERE EXISTS (
        SELECT 1 FROM user_product_permissions upp
        WHERE upp.finished_good_id = finished_goods.id
          AND upp.user_id = ?
          AND upp.can_view = 1
      )`;
      params.push(req.user.id);
    }

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
        return {
          ...p,
          physical_stock,
          reserved_qty,
          available_qty: Math.max(0, physical_stock - reserved_qty),
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

    // NO FOR UPDATE — plain select, safe on shared hosting
    const products = await client.query(
      `SELECT id, name, quantity FROM finished_goods WHERE id IN ${clause}`,
      params
    );

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

    const shortages = [];
    for (const [id, qty] of requested.entries()) {
      const p = productMap.get(id);
      const available = Number(p.quantity) - (reserved.get(id) || 0);
      if (qty > available) {
        shortages.push({
          finished_good_id: id,
          product_name: p.name,
          requested: qty,
          available,
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

    // deduct physical stock on delivery
    if (status === 'DELIVERED') {
      const { clause: oClause, params: oParams } = buildInClause([order.id]);
      const itemsRes = await client.query(
        `SELECT oi.*, fg.name AS product_name, fg.quantity
         FROM order_items oi
         JOIN finished_goods fg ON fg.id = oi.finished_good_id
         WHERE oi.order_id IN ${oClause}`,
        oParams
      );

      const shortages = itemsRes.rows.filter(
        (item) => Number(item.qty_ordered) > Number(item.quantity || 0)
      );

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
        const { clause: fgClause, params: fgParams } = buildInClause([item.finished_good_id]);
        await client.query(
          `UPDATE finished_goods SET quantity = quantity - ? WHERE id IN ${fgClause}`,
          [item.qty_ordered, ...fgParams]
        );
      }
    }

    await client.query(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, order.id]
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