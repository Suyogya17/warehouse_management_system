const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { getPagination, shouldIncludeTotal } = require('../utils/pagination');
const { hasColumn } = require('../utils/schemaSupport');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');

const ORDER_STATUSES = new Set([
  'ORDERED',
  'IN_PRODUCTION',
  'SHIPPED',
  'AT_CUSTOMS',
  'DELIVERED',
  'REACHED_SITE',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);

const CONTAINER_STATUSES = new Set([
  'PLANNED',
  'LOADING',
  'SHIPPED',
  'AT_CUSTOMS',
  'ARRIVED',
  'UNLOADED',
]);

const normalizeDate = (value) => value || null;
const normalizeNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const normalizeBoolean = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()) || Number(value) === 1 ? 1 : 0;
};

const getActor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const buildOrderNumber = async () => {
  const today = new Date();
  const stamp = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await query(
    `SELECT COUNT(*) AS count
     FROM import_orders
     WHERE order_number LIKE ?`,
    [`IMP-${stamp}-%`]
  );
  const next = String(Number(rows.rows[0]?.count || 0) + 1).padStart(3, '0');
  return `IMP-${stamp}-${next}`;
};

const normalizeOrderPayload = async (body = {}) => {
  const status = String(body.status || 'ORDERED').toUpperCase();
  if (!ORDER_STATUSES.has(status)) {
    const error = new Error('Invalid import order status');
    error.statusCode = 400;
    throw error;
  }

  const order = {
    order_number: String(body.order_number || '').trim() || await buildOrderNumber(),
    supplier_name: String(body.supplier_name || '').trim(),
    supplier_country: String(body.supplier_country || '').trim() || null,
    sender_name: String(body.sender_name || '').trim() || null,
    agent_name: String(body.agent_name || '').trim() || null,
    shipping_method: String(body.shipping_method || '').trim() || null,
    transport_company: String(body.transport_company || '').trim() || null,
    tracking_number: String(body.tracking_number || '').trim() || null,
    order_date: normalizeDate(body.order_date),
    loading_date: normalizeDate(body.loading_date),
    expected_delivery_date: normalizeDate(body.expected_delivery_date),
    shipped_date: normalizeDate(body.shipped_date),
    delivered_date: normalizeDate(body.delivered_date),
    reached_site_date: normalizeDate(body.reached_site_date),
    vehicle_no: String(body.vehicle_no || '').trim() || null,
    vehicle_size: String(body.vehicle_size || '').trim() || null,
    destination: String(body.destination || '').trim() || null,
    ocean_company: String(body.ocean_company || '').trim() || null,
    status,
    is_test: normalizeBoolean(body.is_test, 1),
    notes: String(body.notes || '').trim() || null,
  };

  if (!order.order_date) {
    const error = new Error('Order date is required');
    error.statusCode = 400;
    throw error;
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const normalizedItems = items
    .map((item) => ({
      raw_material_id: item.raw_material_id || null,
      material_name: String(item.material_name || '').trim(),
      article_code: String(item.article_code || '').trim() || null,
      category: String(item.category || '').trim() || null,
      color: String(item.color || '').trim() || null,
      size: String(item.size || '').trim() || null,
      unit: String(item.unit || 'pcs').trim() || 'pcs',
      carton_qty: normalizeNumber(item.carton_qty),
      qty_per_carton: normalizeNumber(item.qty_per_carton),
      ordered_qty: normalizeNumber(item.ordered_qty),
      unit_price: normalizeNumber(item.unit_price),
      price_currency: String(item.price_currency || 'RMB').trim().toUpperCase() || 'RMB',
      creditor: String(item.creditor || '').trim() || null,
      received_qty: normalizeNumber(item.received_qty),
      damaged_qty: normalizeNumber(item.damaged_qty),
      short_qty: normalizeNumber(item.short_qty),
      notes: String(item.notes || '').trim() || null,
    }))
    .filter((item) => item.material_name && item.ordered_qty > 0);

  if (!normalizedItems.length) {
    const error = new Error('At least one raw material item with ordered quantity is required');
    error.statusCode = 400;
    throw error;
  }

  const containers = (Array.isArray(body.containers) ? body.containers : [])
    .map((container) => {
      const containerStatus = String(container.status || 'PLANNED').toUpperCase();
      if (!CONTAINER_STATUSES.has(containerStatus)) {
        const error = new Error('Invalid container status');
        error.statusCode = 400;
        throw error;
      }

      return {
        container_number: String(container.container_number || '').trim(),
        seal_number: String(container.seal_number || '').trim() || null,
        container_size: String(container.container_size || '').trim() || null,
        status: containerStatus,
        departure_date: normalizeDate(container.departure_date),
        expected_arrival_date: normalizeDate(container.expected_arrival_date),
        actual_arrival_date: normalizeDate(container.actual_arrival_date),
        notes: String(container.notes || '').trim() || null,
        items: Array.isArray(container.items) ? container.items : [],
      };
    })
    .filter((container) => container.container_number);

  return { order, items: normalizedItems, containers };
};

const attachChildren = (orders, items, containers, containerItems) => {
  const itemsByOrder = new Map();
  const containersByOrder = new Map();
  const containerItemsByContainer = new Map();

  items.forEach((item) => {
    const rows = itemsByOrder.get(item.import_order_id) || [];
    rows.push(item);
    itemsByOrder.set(item.import_order_id, rows);
  });

  containerItems.forEach((item) => {
    const rows = containerItemsByContainer.get(item.container_id) || [];
    rows.push(item);
    containerItemsByContainer.set(item.container_id, rows);
  });

  containers.forEach((container) => {
    const rows = containersByOrder.get(container.import_order_id) || [];
    rows.push({
      ...container,
      items: containerItemsByContainer.get(container.id) || [],
    });
    containersByOrder.set(container.import_order_id, rows);
  });

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) || [],
    containers: containersByOrder.get(order.id) || [],
  }));
};

const fetchOrdersByIds = async (ids = []) => {
  if (!ids.length) return { items: [], containers: [], containerItems: [] };
  const placeholders = ids.map(() => '?').join(',');
  const [items, containers, containerItems] = await Promise.all([
    query(
      `SELECT * FROM import_order_items
       WHERE import_order_id IN (${placeholders})
       ORDER BY id`,
      ids
    ),
    query(
      `SELECT * FROM import_containers
       WHERE import_order_id IN (${placeholders})
       ORDER BY id`,
      ids
    ),
    query(
      `SELECT ici.*, ioi.material_name, ioi.article_code, ioi.color, ioi.unit
       FROM import_container_items ici
       JOIN import_order_items ioi ON ioi.id = ici.import_order_item_id
       JOIN import_containers ic ON ic.id = ici.container_id
       WHERE ic.import_order_id IN (${placeholders})
       ORDER BY ici.id`,
      ids
    ),
  ]);

  return { items: items.rows, containers: containers.rows, containerItems: containerItems.rows };
};

const getAll = async (req, res, next) => {
  try {
    const { limit, offset } = getPagination(req.query, { defaultLimit: 100, maxLimit: 500 });
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const params = [];
    const filters = [];

    const search = String(req.query.search || '').trim();
    if (search) {
      filters.push(`(
        io.order_number LIKE ?
        OR io.supplier_name LIKE ?
        OR io.sender_name LIKE ?
        OR io.agent_name LIKE ?
        OR io.tracking_number LIKE ?
        OR EXISTS (
          SELECT 1 FROM import_order_items ioi
          WHERE ioi.import_order_id = io.id
            AND (ioi.material_name LIKE ? OR ioi.article_code LIKE ? OR ioi.color LIKE ?)
        )
        OR EXISTS (
          SELECT 1 FROM import_containers ic
          WHERE ic.import_order_id = io.id
            AND ic.container_number LIKE ?
        )
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term, term, term);
    }

    if (req.query.status) {
      filters.push('io.status = ?');
      params.push(String(req.query.status).toUpperCase());
    }

    if (req.query.date_from) {
      filters.push('io.order_date >= ?');
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      filters.push('io.order_date <= ?');
      params.push(req.query.date_to);
    }

    if (supportsTestMode) {
      filters.push('io.is_test = ?');
      params.push(normalizeBoolean(req.query.is_test, 1));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const orders = await query(
      `SELECT io.*,
              ${supportsTestMode ? 'io.is_test' : '1'} AS is_test,
              created.name AS created_by_name,
              updated.name AS updated_by_name,
              COALESCE(item_totals.total_ordered_qty, 0) AS total_ordered_qty,
              COALESCE(item_totals.total_received_qty, 0) AS total_received_qty,
              COALESCE(container_totals.container_count, 0) AS container_count
       FROM import_orders io
       LEFT JOIN (
         SELECT import_order_id,
                SUM(ordered_qty) AS total_ordered_qty,
                SUM(received_qty) AS total_received_qty
         FROM import_order_items
         GROUP BY import_order_id
       ) item_totals ON item_totals.import_order_id = io.id
       LEFT JOIN (
         SELECT import_order_id,
                COUNT(*) AS container_count
         FROM import_containers
         GROUP BY import_order_id
       ) container_totals ON container_totals.import_order_id = io.id
       LEFT JOIN users created ON created.id = io.created_by
       LEFT JOIN users updated ON updated.id = io.updated_by
       ${where}
       ORDER BY io.order_date DESC, io.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = shouldIncludeTotal(req.query)
      ? await query(
          `SELECT COUNT(*) AS count
           FROM import_orders io
           ${where}`,
          params
        )
      : null;

    const ids = orders.rows.map((order) => order.id);
    const children = await fetchOrdersByIds(ids);

    return res.json({
      success: true,
      total: total ? Number(total.rows[0]?.count || 0) : undefined,
      count: orders.rows.length,
      limit,
      offset,
      data: attachChildren(orders.rows, children.items, children.containers, children.containerItems),
    });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const orders = await query(
      `SELECT io.*,
              ${supportsTestMode ? 'io.is_test' : '1'} AS is_test,
              created.name AS created_by_name,
              updated.name AS updated_by_name
       FROM import_orders io
       LEFT JOIN users created ON created.id = io.created_by
       LEFT JOIN users updated ON updated.id = io.updated_by
       WHERE io.id = ?`,
      [req.params.id]
    );

    if (!orders.rows.length) {
      return res.status(404).json({ success: false, message: 'Import order not found' });
    }

    const children = await fetchOrdersByIds([Number(req.params.id)]);

    return res.json({
      success: true,
      data: attachChildren(orders.rows, children.items, children.containers, children.containerItems)[0],
    });
  } catch (err) {
    next(err);
  }
};

const saveContainerItems = async (client, containerId, containerItems = [], savedItems = []) => {
  const itemByClientKey = new Map();
  savedItems.forEach((item, index) => {
    itemByClientKey.set(String(index), item.id);
    itemByClientKey.set(String(item.raw_material_id || ''), item.id);
    itemByClientKey.set(String(item.material_name || '').toLowerCase(), item.id);
  });

  for (const item of containerItems) {
    const importOrderItemId =
      Number(item.import_order_item_id || 0) ||
      itemByClientKey.get(String(item.item_index ?? '')) ||
      itemByClientKey.get(String(item.raw_material_id || '')) ||
      itemByClientKey.get(String(item.material_name || '').toLowerCase());

    const quantity = normalizeNumber(item.quantity);
    if (!importOrderItemId || quantity <= 0) continue;

    await client.query(
      `INSERT INTO import_container_items
         (container_id, import_order_item_id, quantity, notes)
       VALUES (?, ?, ?, ?)`,
      [containerId, importOrderItemId, quantity, String(item.notes || '').trim() || null]
    );
  }
};

const insertImportOrderItem = async (client, importOrderId, item, supportedItemColumns = {}) => {
  const columns = [
    'import_order_id', 'raw_material_id', 'material_name', 'article_code', 'category',
    'color', 'unit', 'ordered_qty',
  ];
  const values = [
    importOrderId,
    item.raw_material_id,
    item.material_name,
    item.article_code,
    item.category,
    item.color,
    item.unit,
    item.ordered_qty,
  ];

  if (supportedItemColumns.carton_qty) {
    columns.push('carton_qty');
    values.push(item.carton_qty);
  }

  if (supportedItemColumns.size) {
    columns.push('size');
    values.push(item.size);
  }

  if (supportedItemColumns.qty_per_carton) {
    columns.push('qty_per_carton');
    values.push(item.qty_per_carton);
  }

  if (supportedItemColumns.unit_price) {
    columns.push('unit_price');
    values.push(item.unit_price);
  }

  if (supportedItemColumns.price_currency) {
    columns.push('price_currency');
    values.push(item.price_currency);
  }

  if (supportedItemColumns.creditor) {
    columns.push('creditor');
    values.push(item.creditor);
  }

  columns.push('received_qty', 'damaged_qty', 'short_qty', 'notes');
  values.push(item.received_qty, item.damaged_qty, item.short_qty, item.notes);

  return client.query(
    `INSERT INTO import_order_items (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
};

const create = async (req, res, next) => {
  const client = await getClient();
  try {
    const payload = await normalizeOrderPayload(req.body);
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const supportedOrderColumns = {
      loading_date: await hasColumn('import_orders', 'loading_date'),
      vehicle_no: await hasColumn('import_orders', 'vehicle_no'),
      vehicle_size: await hasColumn('import_orders', 'vehicle_size'),
      destination: await hasColumn('import_orders', 'destination'),
      ocean_company: await hasColumn('import_orders', 'ocean_company'),
    };
    const supportedItemColumns = {
      size: await hasColumn('import_order_items', 'size'),
      carton_qty: await hasColumn('import_order_items', 'carton_qty'),
      qty_per_carton: await hasColumn('import_order_items', 'qty_per_carton'),
      unit_price: await hasColumn('import_order_items', 'unit_price'),
      price_currency: await hasColumn('import_order_items', 'price_currency'),
      creditor: await hasColumn('import_order_items', 'creditor'),
    };

    await client.query('START TRANSACTION');

    const orderColumns = [
      'order_number', 'supplier_name', 'supplier_country', 'sender_name', 'agent_name',
      'shipping_method', 'transport_company', 'tracking_number', 'order_date',
      'expected_delivery_date', 'shipped_date', 'delivered_date', 'reached_site_date',
      'status',
    ];
    const orderValues = [
      payload.order.order_number,
      payload.order.supplier_name,
      payload.order.supplier_country,
      payload.order.sender_name,
      payload.order.agent_name,
      payload.order.shipping_method,
      payload.order.transport_company,
      payload.order.tracking_number,
      payload.order.order_date,
      payload.order.expected_delivery_date,
      payload.order.shipped_date,
      payload.order.delivered_date,
      payload.order.reached_site_date,
      payload.order.status,
    ];

    if (supportsTestMode) {
      orderColumns.push('is_test');
      orderValues.push(payload.order.is_test);
    }

    Object.entries(supportedOrderColumns).forEach(([column, supported]) => {
      if (!supported) return;
      orderColumns.push(column);
      orderValues.push(payload.order[column]);
    });

    orderColumns.push('notes', 'created_by', 'updated_by');
    orderValues.push(payload.order.notes, req.user.id, req.user.id);

    const result = await client.query(
      `INSERT INTO import_orders (${orderColumns.join(', ')})
       VALUES (${orderColumns.map(() => '?').join(', ')})`,
      orderValues
    );

    const orderId = result.insertId;
    const savedItems = [];

    for (const item of payload.items) {
      const itemResult = await insertImportOrderItem(client, orderId, item, supportedItemColumns);
      savedItems.push({ ...item, id: itemResult.insertId });
    }

    for (const container of payload.containers) {
      const containerResult = await client.query(
        `INSERT INTO import_containers
           (import_order_id, container_number, seal_number, container_size, status,
            departure_date, expected_arrival_date, actual_arrival_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          container.container_number,
          container.seal_number,
          container.container_size,
          container.status,
          container.departure_date,
          container.expected_arrival_date,
          container.actual_arrival_date,
          container.notes,
        ]
      );

      await saveContainerItems(client, containerResult.insertId, container.items, savedItems);
    }

    await client.query('COMMIT');

    await auditLog({
      ...getActor(req),
      actionType: 'CREATE',
      module: 'import_tracking',
      entity_type: 'import_order',
      entity_id: orderId,
      entityName: payload.order.order_number,
      description: `Created import order ${payload.order.order_number} from ${payload.order.supplier_name}`,
      metadata: {
        ...payload.order,
        items: payload.items,
        containers: payload.containers,
      },
    });

    return res.status(201).json({ success: true, data: { id: orderId } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Import order number already exists' });
    }
    next(err);
  } finally {
    client.release();
  }
};

const update = async (req, res, next) => {
  const client = await getClient();
  try {
    const payload = await normalizeOrderPayload(req.body);
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const supportedOrderColumns = {
      loading_date: await hasColumn('import_orders', 'loading_date'),
      vehicle_no: await hasColumn('import_orders', 'vehicle_no'),
      vehicle_size: await hasColumn('import_orders', 'vehicle_size'),
      destination: await hasColumn('import_orders', 'destination'),
      ocean_company: await hasColumn('import_orders', 'ocean_company'),
    };
    const supportedItemColumns = {
      size: await hasColumn('import_order_items', 'size'),
      carton_qty: await hasColumn('import_order_items', 'carton_qty'),
      qty_per_carton: await hasColumn('import_order_items', 'qty_per_carton'),
      unit_price: await hasColumn('import_order_items', 'unit_price'),
      price_currency: await hasColumn('import_order_items', 'price_currency'),
      creditor: await hasColumn('import_order_items', 'creditor'),
    };

    await client.query('START TRANSACTION');

    const existing = await client.query('SELECT id FROM import_orders WHERE id = ?', [req.params.id]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Import order not found' });
    }

    const updateFields = [
      'order_number = ?', 'supplier_name = ?', 'supplier_country = ?', 'sender_name = ?',
      'agent_name = ?', 'shipping_method = ?', 'transport_company = ?', 'tracking_number = ?',
      'order_date = ?', 'expected_delivery_date = ?', 'shipped_date = ?', 'delivered_date = ?',
      'reached_site_date = ?', 'status = ?',
    ];
    const updateValues = [
      payload.order.order_number,
      payload.order.supplier_name,
      payload.order.supplier_country,
      payload.order.sender_name,
      payload.order.agent_name,
      payload.order.shipping_method,
      payload.order.transport_company,
      payload.order.tracking_number,
      payload.order.order_date,
      payload.order.expected_delivery_date,
      payload.order.shipped_date,
      payload.order.delivered_date,
      payload.order.reached_site_date,
      payload.order.status,
    ];

    if (supportsTestMode) {
      updateFields.push('is_test = ?');
      updateValues.push(payload.order.is_test);
    }

    Object.entries(supportedOrderColumns).forEach(([column, supported]) => {
      if (!supported) return;
      updateFields.push(`${column} = ?`);
      updateValues.push(payload.order[column]);
    });

    updateFields.push('notes = ?', 'updated_by = ?');
    updateValues.push(payload.order.notes, req.user.id, req.params.id);

    await client.query(
      `UPDATE import_orders
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    await client.query('DELETE FROM import_container_items WHERE container_id IN (SELECT id FROM import_containers WHERE import_order_id = ?)', [req.params.id]);
    await client.query('DELETE FROM import_containers WHERE import_order_id = ?', [req.params.id]);
    await client.query('DELETE FROM import_order_items WHERE import_order_id = ?', [req.params.id]);

    const savedItems = [];
    for (const item of payload.items) {
      const itemResult = await insertImportOrderItem(client, req.params.id, item, supportedItemColumns);
      savedItems.push({ ...item, id: itemResult.insertId });
    }

    for (const container of payload.containers) {
      const containerResult = await client.query(
        `INSERT INTO import_containers
           (import_order_id, container_number, seal_number, container_size, status,
            departure_date, expected_arrival_date, actual_arrival_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          container.container_number,
          container.seal_number,
          container.container_size,
          container.status,
          container.departure_date,
          container.expected_arrival_date,
          container.actual_arrival_date,
          container.notes,
        ]
      );

      await saveContainerItems(client, containerResult.insertId, container.items, savedItems);
    }

    await client.query('COMMIT');

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'import_tracking',
      entity_type: 'import_order',
      entity_id: req.params.id,
      entityName: payload.order.order_number,
      description: `Updated import order ${payload.order.order_number}`,
      metadata: {
        ...payload.order,
        items: payload.items,
        containers: payload.containers,
      },
    });

    return res.json({ success: true, message: 'Import order updated' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Import order number already exists' });
    }
    next(err);
  } finally {
    client.release();
  }
};

const remove = async (req, res, next) => {
  try {
    const existing = await query('SELECT order_number FROM import_orders WHERE id = ?', [req.params.id]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Import order not found' });
    }

    await query('DELETE FROM import_orders WHERE id = ?', [req.params.id]);

    await auditLog({
      ...getActor(req),
      actionType: 'DELETE',
      module: 'import_tracking',
      entity_type: 'import_order',
      entity_id: req.params.id,
      entityName: existing.rows[0].order_number,
      description: `Deleted import order ${existing.rows[0].order_number}`,
    });

    return res.json({ success: true, message: 'Import order deleted' });
  } catch (err) {
    next(err);
  }
};

const getReport = async (req, res, next) => {
  try {
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const params = [];
    const filters = [];

    if (req.query.date_from) {
      filters.push('io.order_date >= ?');
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      filters.push('io.order_date <= ?');
      params.push(req.query.date_to);
    }

    if (req.query.status) {
      filters.push('io.status = ?');
      params.push(String(req.query.status).toUpperCase());
    }

    if (supportsTestMode) {
      filters.push('io.is_test = ?');
      params.push(normalizeBoolean(req.query.is_test, 1));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await query(
      `SELECT io.id,
              io.order_number,
              io.supplier_name,
              io.supplier_country,
              io.agent_name,
              io.sender_name,
              io.order_date,
              io.expected_delivery_date,
              io.delivered_date,
              io.reached_site_date,
              io.status,
              ${supportsTestMode ? 'io.is_test' : '1'} AS is_test,
              COALESCE(item_totals.material_count, 0) AS material_count,
              COALESCE(container_totals.container_count, 0) AS container_count,
              COALESCE(item_totals.ordered_qty, 0) AS ordered_qty,
              COALESCE(item_totals.received_qty, 0) AS received_qty,
              COALESCE(item_totals.short_qty, 0) AS short_qty,
              COALESCE(item_totals.damaged_qty, 0) AS damaged_qty
       FROM import_orders io
       LEFT JOIN (
         SELECT import_order_id,
                COUNT(*) AS material_count,
                SUM(ordered_qty) AS ordered_qty,
                SUM(received_qty) AS received_qty,
                SUM(short_qty) AS short_qty,
                SUM(damaged_qty) AS damaged_qty
         FROM import_order_items
         GROUP BY import_order_id
       ) item_totals ON item_totals.import_order_id = io.id
       LEFT JOIN (
         SELECT import_order_id,
                COUNT(*) AS container_count
         FROM import_containers
         GROUP BY import_order_id
       ) container_totals ON container_totals.import_order_id = io.id
       ${where}
       ORDER BY io.order_date DESC, io.id DESC`,
      params
    );

    const summary = rows.rows.reduce((acc, row) => {
      acc.orders += 1;
      acc.materials += Number(row.material_count || 0);
      acc.containers += Number(row.container_count || 0);
      acc.ordered_qty += Number(row.ordered_qty || 0);
      acc.received_qty += Number(row.received_qty || 0);
      acc.short_qty += Number(row.short_qty || 0);
      acc.damaged_qty += Number(row.damaged_qty || 0);
      return acc;
    }, {
      orders: 0,
      materials: 0,
      containers: 0,
      ordered_qty: 0,
      received_qty: 0,
      short_qty: 0,
      damaged_qty: 0,
    });

    return res.json({ success: true, summary, data: rows.rows });
  } catch (err) {
    next(err);
  }
};

const createRawMaterialFromItem = async (req, res, next) => {
  const client = await getClient();

  try {
    const supportsTestMode = await hasColumn('import_orders', 'is_test');

    await client.query('START TRANSACTION');

    const itemResult = await client.query(
      `SELECT io.id AS import_order_id,
              io.order_number,
              ${supportsTestMode ? 'io.is_test' : '1'} AS is_test,
              ioi.*
       FROM import_order_items ioi
       JOIN import_orders io ON io.id = ioi.import_order_id
       WHERE io.id = ? AND ioi.id = ?
       LIMIT 1`,
      [req.params.id, req.params.itemId]
    );

    if (!itemResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Import slip item not found' });
    }

    const item = itemResult.rows[0];

    if (item.raw_material_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This slip item is already linked to a raw material',
      });
    }

    const isTest = Number(item.is_test ?? 1) === 1;
    const baseName = String(item.material_name || '').trim();

    if (!baseName) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Material name is required' });
    }

    const materialName = isTest && !baseName.startsWith('[TEST]') ? `[TEST] ${baseName}` : baseName;
    const category = String(item.category || '').trim() || (isTest ? 'TEST' : 'Imported');
    const unit = String(item.unit || '').trim() || 'pcs';
    const articleCode = String(item.article_code || '').trim() || null;
    const color = String(item.color || '').trim() || null;

    const existing = await client.query(
      `SELECT id, name
       FROM raw_materials
       WHERE name = ? AND article_code <=> ? AND color <=> ?
       LIMIT 1`,
      [materialName, articleCode, color]
    );

    if (existing.rows.length) {
      await client.query(
        'UPDATE import_order_items SET raw_material_id = ? WHERE id = ?',
        [existing.rows[0].id, item.id]
      );

      await client.query('COMMIT');

      await auditLog({
        ...getActor(req),
        actionType: 'LINK',
        module: 'import_tracking',
        entity_type: 'raw_material',
        entity_id: existing.rows[0].id,
        entityName: existing.rows[0].name,
        description: `Linked import order ${item.order_number} item to existing raw material ${existing.rows[0].name}`,
        metadata: {
          import_order_id: item.import_order_id,
          import_order_item_id: item.id,
          is_test: isTest,
        },
      });

      return res.json({
        success: true,
        message: 'Slip item linked to existing raw material',
        data: { id: existing.rows[0].id, name: existing.rows[0].name, is_test: isTest, linked_existing: true },
      });
    }

    const baseColumns = ['name', 'article_code', 'category', 'color', 'unit', 'quantity', 'min_quantity'];
    const baseValues = [materialName, articleCode, category, color, unit, 0, 10];
    const rawMaterialInsert = await appendFiscalInsertFields('raw_materials', baseColumns, baseValues);

    const inserted = await client.query(
      `INSERT INTO raw_materials (${rawMaterialInsert.columns.join(', ')})
       VALUES (${rawMaterialInsert.columns.map(() => '?').join(', ')})`,
      rawMaterialInsert.values
    );

    await client.query(
      'UPDATE import_order_items SET raw_material_id = ? WHERE id = ?',
      [inserted.insertId, item.id]
    );

    await client.query('COMMIT');

    await auditLog({
      ...getActor(req),
      actionType: 'CREATE',
      module: 'import_tracking',
      entity_type: 'raw_material',
      entity_id: inserted.insertId,
      entityName: materialName,
      description: `Created raw material ${materialName} from import order ${item.order_number}`,
      metadata: {
        import_order_id: item.import_order_id,
        import_order_item_id: item.id,
        order_number: item.order_number,
        article_code: articleCode,
        category,
        color,
        unit,
        quantity: 0,
        is_test: isTest,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Raw material created from import slip',
      data: { id: inserted.insertId, name: materialName, is_test: isTest, linked_existing: false },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

const receiveItemStock = async (req, res, next) => {
  const client = await getClient();

  try {
    const supportsTestMode = await hasColumn('import_orders', 'is_test');
    const qtyReceived = normalizeNumber(req.body.qty_received);
    const damagedQty = normalizeNumber(req.body.damaged_qty);
    const shortQty = normalizeNumber(req.body.short_qty);
    const notes = String(req.body.notes || '').trim() || null;

    if (qtyReceived <= 0) {
      return res.status(400).json({ success: false, message: 'Received quantity must be greater than 0' });
    }

    await client.query('START TRANSACTION');

    const itemResult = await client.query(
      `SELECT io.id AS import_order_id,
              io.order_number,
              ${supportsTestMode ? 'io.is_test' : '1'} AS is_test,
              ioi.*,
              rm.name AS linked_material_name,
              rm.unit AS linked_material_unit
       FROM import_order_items ioi
       JOIN import_orders io ON io.id = ioi.import_order_id
       LEFT JOIN raw_materials rm ON rm.id = ioi.raw_material_id
       WHERE io.id = ? AND ioi.id = ?
       LIMIT 1`,
      [req.params.id, req.params.itemId]
    );

    if (!itemResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Import slip item not found' });
    }

    const item = itemResult.rows[0];
    const isTest = Number(item.is_test ?? 1) === 1;
    const nextReceivedQty = Number(item.received_qty || 0) + qtyReceived;
    const nextDamagedQty = Number(item.damaged_qty || 0) + damagedQty;
    const nextShortQty = Number(item.short_qty || 0) + shortQty;

    await client.query(
      `UPDATE import_order_items
       SET received_qty = ?, damaged_qty = ?, short_qty = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
      [nextReceivedQty, nextDamagedQty, nextShortQty, notes, item.id]
    );

    await client.query('COMMIT');

    await auditLog({
      ...getActor(req),
      actionType: isTest ? 'TEST_RECEIVED' : 'IMPORT_RECEIVED_RECORDED',
      module: 'import_tracking',
      entity_type: 'import_order_item',
      entity_id: item.id,
      entityName: item.material_name,
      description: isTest
        ? `Marked test import stock received for ${item.material_name} from ${item.order_number}`
        : `Recorded ${qtyReceived} ${item.unit || ''} received for ${item.material_name} from import order ${item.order_number}`,
      metadata: {
        import_order_id: item.import_order_id,
        order_number: item.order_number,
        raw_material_id: item.raw_material_id,
        qty_received: qtyReceived,
        damaged_qty: damagedQty,
        short_qty: shortQty,
        total_received_qty: nextReceivedQty,
        is_test: isTest,
        notes,
      },
    });

    return res.json({
      success: true,
      message: isTest
        ? 'Test slip marked as received. Real stock was not changed.'
        : 'Import receipt recorded. Raw material stock was not changed.',
      data: {
        import_order_item_id: item.id,
        raw_material_id: item.raw_material_id,
        qty_received: qtyReceived,
        total_received_qty: nextReceivedQty,
        damaged_qty: nextDamagedQty,
        short_qty: nextShortQty,
        is_test: isTest,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  getReport,
  createRawMaterialFromItem,
  receiveItemStock,
};
