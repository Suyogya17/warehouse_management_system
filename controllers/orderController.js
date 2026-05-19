// const { query, getClient } = require('../config/db');

// const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
// const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];

// const DISPLAY_CAP = 450; // ← single source of truth for the display limit

// // ─── BUILD IN CLAUSE (safe placeholder expansion) ──
// const buildInClause = (values = []) => {
//   if (!values.length) return { clause: '(-1)', params: [] };
//   const placeholders = values.map(() => '?').join(',');
//   return { clause: `(${placeholders})`, params: values };
// };

// // ─── NORMALIZE ITEMS ───────────────────────────────
// const normalizeItems = (items = []) =>
//   items
//     .map((item) => ({
//       finished_good_id: Number(item.finished_good_id),
//       qty_ordered: Number(item.qty_ordered),
//     }))
//     .filter((item) => item.finished_good_id > 0 && item.qty_ordered > 0);

// // ─── RESERVED STOCK ───────────────────────────────
// const getReservedByProduct = async (executor, productIds = []) => {
//   if (!productIds.length) return new Map();

//   const { clause: statusClause, params: statusParams } =
//     buildInClause(ACTIVE_RESERVATION_STATUSES);
//   const { clause: productClause, params: productParams } =
//     buildInClause(productIds);

//   const result = await executor(
//     `SELECT oi.finished_good_id,
//             COALESCE(SUM(oi.qty_ordered), 0) AS reserved_qty
//      FROM order_items oi
//      JOIN orders o ON o.id = oi.order_id
//      WHERE o.status IN ${statusClause}
//        AND oi.finished_good_id IN ${productClause}
//      GROUP BY oi.finished_good_id`,
//     [...statusParams, ...productParams]
//   );

//   return new Map(
//     result.rows.map((r) => [Number(r.finished_good_id), Number(r.reserved_qty)])
//   );
// };

// // ─── GET ALL ORDERS ───────────────────────────────
// // const getAll = async (req, res, next) => {
// //   try {
// //     const params = [];
// //     let where = '';

// //     if (req.user.role === 'USER') {
// //       where = 'WHERE o.created_by = ?';
// //       params.push(req.user.id);
// //     }

// //     const orders = await query(
// //       `SELECT o.*, u.name AS created_by_name
// //        FROM orders o
// //        LEFT JOIN users u ON u.id = o.created_by
// //        ${where}
// //        ORDER BY o.created_at DESC`,
// //       params
// //     );

// //     const orderIds = orders.rows.map((o) => o.id);
// //     let items = [];

// //     if (orderIds.length) {
// //       const { clause, params: orderParams } = buildInClause(orderIds);
// //       const itemResult = await query(
// //         `SELECT oi.*, fg.name AS product_name,
// //                 fg.article_code, fg.color, fg.size,
// //                 fg.unit, fg.quantity AS physical_stock,
// //                 fg.display_quantity
// //          FROM order_items oi
// //          JOIN finished_goods fg ON fg.id = oi.finished_good_id
// //          WHERE oi.order_id IN ${clause}
// //          ORDER BY oi.id`,
// //         orderParams
// //       );
// //       items = itemResult.rows;
// //     }

// //     const grouped = items.reduce((acc, item) => {
// //       acc[item.order_id] = acc[item.order_id] || [];
// //       acc[item.order_id].push(item);
// //       return acc;
// //     }, {});

// //     return res.json({
// //       success: true,
// //       data: orders.rows.map((o) => ({ ...o, items: grouped[o.id] || [] })),
// //     });
// //   } catch (err) {
// //     next(err);
// //   }
// // };

// // ─── GET ALL ORDERS ───────────────────────────────
// const getAll = async (req, res, next) => {
//   try {
//     const params = [];
//     let where = '';

//     if (req.user.role === 'USER') {
//       where = 'WHERE o.created_by = ?';
//       params.push(req.user.id);
//     }

//     const orders = await query(
//       `SELECT o.*, 
//               u_created.name AS created_by_name,
//               u_confirmed.name AS confirmed_by_name,
//               u_packed.name AS packed_by_name,
//               u_delivered.name AS delivered_by_name
//        FROM orders o
//        LEFT JOIN users u_created ON u_created.id = o.created_by
//        LEFT JOIN users u_confirmed ON u_confirmed.id = o.confirmed_by
//        LEFT JOIN users u_packed ON u_packed.id = o.packed_by
//        LEFT JOIN users u_delivered ON u_delivered.id = o.delivered_by
//        ${where}
//        ORDER BY o.created_at DESC`,
//       params
//     );

//     const orderIds = orders.rows.map((o) => o.id);
//     let items = [];

//     if (orderIds.length) {
//       const { clause, params: orderParams } = buildInClause(orderIds);
//       const itemResult = await query(
//         `SELECT oi.*, fg.name AS product_name,
//                 fg.article_code, fg.color, fg.size,
//                 fg.unit, fg.quantity AS physical_stock,
//                 fg.display_quantity,
//                 fg.inner_boxes_per_outer_box
//          FROM order_items oi
//          JOIN finished_goods fg ON fg.id = oi.finished_good_id
//          WHERE oi.order_id IN ${clause}
//          ORDER BY oi.id`,
//         orderParams
//       );
//       items = itemResult.rows;
//     }

//     const grouped = items.reduce((acc, item) => {
//       acc[item.order_id] = acc[item.order_id] || [];
//       acc[item.order_id].push(item);
//       return acc;
//     }, {});

//     return res.json({
//       success: true,
//       data: orders.rows.map((o) => ({ ...o, items: grouped[o.id] || [] })),
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// // ─── GET AVAILABILITY ─────────────────────────────
// const DISPLAY_CAP = 450; // Keep this for UI display purposes

// const getAvailability = async (req, res, next) => {
//   try {
//     let sql = 'SELECT * FROM finished_goods WHERE is_deleted = 0 AND is_visible = 1';
//     const params = [];

//     if (['USER', 'MEMBER', 'ELDER'].includes(req.user.role)) {
//       sql += ` AND EXISTS (
//         SELECT 1 FROM user_product_permissions upp
//         WHERE upp.finished_good_id = finished_goods.id
//           AND upp.user_id = ?
//           AND upp.can_view = 1
//       ) AND NOT EXISTS (
//         SELECT 1 FROM user_product_permissions upp
//         WHERE upp.finished_good_id = finished_goods.id
//           AND upp.user_id = ?
//           AND upp.can_view = 0
//       )`;
//       params.push(req.user.id, req.user.id);
//     }

//     const products = await query(sql, params);
//     const productIds = products.rows.map((p) => p.id);

//     const reserved = await getReservedByProduct(
//       (sql, params) => query(sql, params),
//       productIds
//     );

//     return res.json({
//       success: true,
//       data: products.rows.map((p) => {
//         const reserved_qty = reserved.get(p.id) || 0;
//         const physical_stock = Number(p.quantity || 0);

//         // Display stock is capped at 450 for UI
//         const display_stock = Math.min(DISPLAY_CAP, physical_stock);
        
//         // Available is based on ACTUAL physical stock, not display cap
//         const available_qty = Math.max(0, physical_stock - reserved_qty);

//         return {
//           ...p,
//           physical_stock,     // 660 (actual warehouse stock)
//           display_stock,      // 450 (capped for UI display)
//           reserved_qty,       // 300 (orders in progress)
//           available_qty,      // 360 (actual available = 660 - 300)
//         };
//       }),
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// // ─── CREATE ORDER ─────────────────────────────────
// const create = async (req, res, next) => {
//   const client = await getClient();

//   try {
//     await client.query('START TRANSACTION');

//     const {
//       customer_name,
//       customer_phone,
//       notes,
//       pan_number,
//       transport_name,
//       customer_address,
//     } = req.body;

//     const items = normalizeItems(req.body.items);

//     if (!customer_name || !items.length) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({
//         success: false,
//         message: 'Customer name + items required',
//       });
//     }

//     const productIds = [...new Set(items.map((i) => i.finished_good_id))];
//     const { clause, params } = buildInClause(productIds);

//     // Only need quantity now — availability is always capped at DISPLAY_CAP
//     let productSql = `
//       SELECT id, name, quantity
//       FROM finished_goods
//       WHERE is_deleted = 0
//         AND is_visible = 1
//         AND id IN ${clause}
//     `;
//     const productParams = [...params];

//     if (['USER', 'MEMBER', 'ELDER'].includes(req.user.role)) {
//       productSql += ` AND EXISTS (
//         SELECT 1 FROM user_product_permissions upp
//         WHERE upp.finished_good_id = finished_goods.id
//           AND upp.user_id = ?
//           AND upp.can_view = 1
//       ) AND NOT EXISTS (
//         SELECT 1 FROM user_product_permissions upp
//         WHERE upp.finished_good_id = finished_goods.id
//           AND upp.user_id = ?
//           AND upp.can_view = 0
//       )`;
//       productParams.push(req.user.id, req.user.id);
//     }

//     const products = await client.query(productSql, productParams);

//     if (products.rows.length !== productIds.length) {
//       await client.query('ROLLBACK');
//       return res.status(404).json({
//         success: false,
//         message: 'Some products not found',
//       });
//     }

//     const productMap = new Map(products.rows.map((p) => [p.id, p]));

//     const reserved = await getReservedByProduct(
//       (sql, params) => client.query(sql, params),
//       productIds
//     );

//     const requested = new Map();
//     for (const i of items) {
//       requested.set(
//         i.finished_good_id,
//         (requested.get(i.finished_good_id) || 0) + i.qty_ordered
//       );
//     }

//     // Availability check — mirrors getAvailability exactly
//     const shortages = [];
//     for (const [id, qty] of requested.entries()) {
//       const p = productMap.get(id);
//       const physicalStock = Number(p.quantity ?? 0);
//       const reservedQty = reserved.get(id) || 0;
//       const displayStock = Math.min(DISPLAY_CAP, physicalStock);
//       const available = Math.max(0, displayStock - reservedQty);

//       if (qty > available) {
//         shortages.push({
//           finished_good_id: id,
//           product_name: p.name,
//           requested: qty,
//           available,
//         });
//       }
//     }

//     if (shortages.length) {
//       await client.query('ROLLBACK');
//       return res.status(422).json({
//         success: false,
//         message: 'Insufficient stock',
//         shortages,
//       });
//     }

//     const orderRes = await client.query(
//       `INSERT INTO orders
//         (customer_name, customer_phone, notes, pan_number, transport_name, customer_address, created_by)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         customer_name,
//         customer_phone || null,
//         notes || null,
//         pan_number || null,
//         transport_name || null,
//         customer_address || null,
//         req.user.id,
//       ]
//     );

//     const orderId = orderRes.insertId;

//     if (!orderId) {
//       await client.query('ROLLBACK');
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to create order',
//       });
//     }

//     for (const item of items) {
//       await client.query(
//         `INSERT INTO order_items (order_id, finished_good_id, qty_ordered)
//          VALUES (?, ?, ?)`,
//         [orderId, item.finished_good_id, item.qty_ordered]
//       );
//     }

//     await client.query('COMMIT');

//     return res.status(201).json({ success: true, data: { id: orderId } });


//     // Availability check - use ACTUAL physical stock, not display cap
//     const shortages = [];
//     for (const [id, qty] of requested.entries()) {
//       const p = productMap.get(id);
//       const physicalStock = Number(p.quantity ?? 0);
//       const reservedQty = reserved.get(id) || 0;
      
//       // Calculate available from actual stock, not display cap
//       const available = Math.max(0, physicalStock - reservedQty);

//       if (qty > available) {
//         shortages.push({
//           finished_good_id: id,
//           product_name: p.name,
//           requested: qty,
//           available,
//         });
//       }
//     }
//   } 
  
  
//   catch (err) {
//     await client.query('ROLLBACK');
//     next(err);
//   } finally {
//     client.release();
//   }
// };

// // ─── UPDATE STATUS ────────────────────────────────
// const updateStatus = async (req, res, next) => {
//   const client = await getClient();

//   try {
//     await client.query('START TRANSACTION');

//     const status = String(req.body.status || '').toUpperCase();

//     if (!ALL_STATUSES.includes(status)) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({ success: false, message: 'Invalid status' });
//     }

//     const cancellationReason = String(req.body.cancellation_reason || '').trim();

//     if (status === 'CANCELLED' && !cancellationReason) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({
//         success: false,
//         message: 'Cancellation reason is required',
//       });
//     }

//     const { clause: idClause, params: idParams } = buildInClause([req.params.id]);
//     const orderRes = await client.query(
//       `SELECT * FROM orders WHERE id IN ${idClause}`,
//       idParams
//     );

//     if (!orderRes.rows.length) {
//       await client.query('ROLLBACK');
//       return res.status(404).json({ message: 'Order not found' });
//     }

//     const order = orderRes.rows[0];

//     if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({
//         success: false,
//         message: `Cannot change a ${order.status.toLowerCase()} order`,
//       });
//     }

//     // Track who performed each action
//     let updateFields = ['status = ?', 'updated_at = NOW()'];
//     let updateParams = [status];

//     if (status === 'CONFIRMED' && !order.confirmed_by) {
//       updateFields.push('confirmed_by = ?', 'confirmed_at = NOW()');
//       updateParams.push(req.user.id);
//     } else if (status === 'PACKED' && !order.packed_by) {
//       updateFields.push('packed_by = ?', 'packed_at = NOW()');
//       updateParams.push(req.user.id);
//     } else if (status === 'DELIVERED' && !order.delivered_by) {
//       updateFields.push('delivered_by = ?', 'delivered_at = NOW()');
//       updateParams.push(req.user.id);
//     }
//     if (status === 'CANCELLED') {
//       updateFields.push('cancellation_reason = ?');
//       updateParams.push(cancellationReason);
//     }

//     // Deduct physical stock on delivery
//     if (status === 'DELIVERED') {
//       const { clause: oClause, params: oParams } = buildInClause([order.id]);
//       const itemsRes = await client.query(
//         `SELECT oi.*, fg.name AS product_name, fg.quantity
//          FROM order_items oi
//          JOIN finished_goods fg ON fg.id = oi.finished_good_id
//          WHERE oi.order_id IN ${oClause}`,
//         oParams
//       );

//       const productIds = itemsRes.rows.map((i) => i.finished_good_id);
//       const reservedMap = await getReservedByProduct(
//         (sql, p) => client.query(sql, p),
//         productIds
//       );

//       const shortages = itemsRes.rows.filter((item) => {
//         const physicalStock = Number(item.quantity || 0);
//         const totalReserved = reservedMap.get(item.finished_good_id) || 0;
//         const otherReserved = totalReserved - Number(item.qty_ordered);
//         const trueAvailable = physicalStock - otherReserved;
//         return Number(item.qty_ordered) > trueAvailable;
//       });

//       if (shortages.length) {
//         await client.query('ROLLBACK');
//         return res.status(422).json({
//           success: false,
//           message: 'Not enough physical stock to deliver this order',
//           shortages: shortages.map((item) => ({
//             product_name: item.product_name,
//             ordered_qty: Number(item.qty_ordered),
//             physical_stock: Number(item.quantity || 0),
//           })),
//         });
//       }

//       for (const item of itemsRes.rows) {
//         const { clause: fgClause, params: fgParams } = buildInClause([item.finished_good_id]);
//         await client.query(
//           `UPDATE finished_goods
//            SET quantity = quantity - ?
//            WHERE id IN ${fgClause}`,
//           [item.qty_ordered, ...fgParams]
//         );
//       }
//     }

//     await client.query(
//       `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
//       [...updateParams, order.id]
//     );

//     await client.query('COMMIT');

//     return res.json({ success: true, message: 'Status updated' });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     next(err);
//   } finally {
//     client.release();
//   }
// };

// module.exports = { getAll, getAvailability, create, updateStatus };
const { query, getClient } = require('../config/db');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const ALL_STATUSES = [...ACTIVE_RESERVATION_STATUSES, 'DELIVERED', 'CANCELLED'];

const DISPLAY_CAP = 450; // ← single source of truth for the display limit

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
    let sql = 'SELECT * FROM finished_goods WHERE is_deleted = 0 AND is_visible = 1';
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

        // Step 1: actual available = physical minus reserved
        const available_qty = Math.max(0, physical_stock - reserved_qty);

        // Step 2: cap what user sees at 450
        // e.g. physical=660, reserved=300 → available=360 → user sees 360
        //      physical=800, reserved=100 → available=700 → user sees 450
        const display_stock = Math.min(DISPLAY_CAP, available_qty);

        return {
          ...p,
          physical_stock,  // 660 — actual warehouse stock
          reserved_qty,    // 300 — orders in progress
          available_qty,   // 360 — actual available (physical - reserved)
          display_stock,   // 360 — what user sees (capped at 450)
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

    let productSql = `
      SELECT id, name, quantity
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

      // Step 1: actual available
      const available = Math.max(0, physicalStock - reservedQty);
      // Step 2: cap at 450 — user cannot order more than they see
      const displayAvailable = Math.min(DISPLAY_CAP, available);

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
      updateFields.push('confirmed_by = ?', 'confirmed_at = NOW()');
      updateParams.push(req.user.id);
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

      const productIds = itemsRes.rows.map((i) => i.finished_good_id);
      const reservedMap = await getReservedByProduct(
        (sql, p) => client.query(sql, p),
        productIds
      );

      const shortages = itemsRes.rows.filter((item) => {
        const physicalStock = Number(item.quantity || 0);
        const totalReserved = reservedMap.get(item.finished_good_id) || 0;
        const otherReserved = totalReserved - Number(item.qty_ordered);
        const trueAvailable = physicalStock - otherReserved;
        return Number(item.qty_ordered) > trueAvailable;
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