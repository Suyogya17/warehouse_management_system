const { query, getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');

const ACTIVE_ROLES = ['ADMIN', 'CO_ADMIN'];
const MOVEMENT_TYPES = new Set([
  'PRODUCTION_IN',
  'ORDER_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
]);

const toPositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const assertManager = (req, res) => {
  if (!ACTIVE_ROLES.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return false;
  }
  return true;
};

const getAll = async (req, res, next) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === '1';
    const result = await query(
      `SELECT w.*,
              created.name AS created_by_name,
              updated.name AS updated_by_name,
              deleted.name AS deleted_by_name
       FROM warehouses w
       LEFT JOIN users created ON created.id = w.created_by
       LEFT JOIN users updated ON updated.id = w.updated_by
       LEFT JOIN users deleted ON deleted.id = w.deleted_by
       ${includeInactive ? '' : 'WHERE w.is_active = 1 AND w.deleted_at IS NULL'}
       ORDER BY w.name`
    );

    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    if (!assertManager(req, res)) return;

    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Warehouse name is required' });
    }

    const result = await query(
      `INSERT INTO warehouses (name, created_by, updated_by)
       VALUES (?, ?, ?)`,
      [name, req.user.id, req.user.id]
    );

    await auditLog({
      userId: req.user.id,
      action: 'CREATED',
      tableName: 'warehouses',
      recordId: result.insertId,
      detail: `Created warehouse "${name}"`,
    });

    return res.status(201).json({
      success: true,
      message: 'Warehouse created',
      data: { id: result.insertId, name },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Warehouse name already exists' });
    }
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    if (!assertManager(req, res)) return;

    const name = String(req.body.name || '').trim();
    const isActive = req.body.is_active;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Warehouse name is required' });
    }

    const result = await query(
      `UPDATE warehouses
       SET name = ?, is_active = ?, updated_by = ?, deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [name, isActive === undefined ? 1 : (Number(isActive) ? 1 : 0), req.user.id, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'warehouses',
      recordId: req.params.id,
      detail: `Updated warehouse "${name}"`,
    });

    return res.json({ success: true, message: 'Warehouse updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Warehouse name already exists' });
    }
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    if (!assertManager(req, res)) return;

    const result = await query(
      `UPDATE warehouses
       SET is_active = 0, deleted_by = ?, deleted_at = NOW(), updated_by = ?
       WHERE id = ?`,
      [req.user.id, req.user.id, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'DELETED',
      tableName: 'warehouses',
      recordId: req.params.id,
      detail: `Deactivated warehouse #${req.params.id}`,
    });

    return res.json({ success: true, message: 'Warehouse deactivated' });
  } catch (err) {
    next(err);
  }
};

const getStock = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    let where = 'WHERE fg.is_deleted = 0';

    if (search) {
      where += ` AND (
        fg.name LIKE ?
        OR fg.article_code LIKE ?
        OR fg.color LIKE ?
        OR fg.size LIKE ?
        OR w.name LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const result = await query(
      `SELECT fgws.id,
              fgws.finished_good_id,
              fgws.warehouse_id,
              fgws.quantity,
              fgws.updated_at,
              fg.name AS product_name,
              fg.article_code,
              fg.color,
              fg.size,
              fg.unit,
              fg.quantity AS total_product_quantity,
              w.name AS warehouse_name,
              created.name AS created_by_name,
              updated.name AS updated_by_name
       FROM finished_good_warehouse_stock fgws
       JOIN finished_goods fg ON fg.id = fgws.finished_good_id
       JOIN warehouses w ON w.id = fgws.warehouse_id
       LEFT JOIN users created ON created.id = fgws.created_by
       LEFT JOIN users updated ON updated.id = fgws.updated_by
       ${where}
       ORDER BY fg.name, w.name`,
      params
    );

    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const getMovements = async (req, res, next) => {
  try {
    const params = [];
    const filters = [];

    if (req.query.finished_good_id) {
      filters.push('m.finished_good_id = ?');
      params.push(req.query.finished_good_id);
    }

    if (req.query.warehouse_id) {
      filters.push('m.warehouse_id = ?');
      params.push(req.query.warehouse_id);
    }

    if (req.query.movement_type) {
      filters.push('m.movement_type = ?');
      params.push(String(req.query.movement_type).toUpperCase());
    }

    const limit = Math.min(Number(req.query.limit || 100), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const result = await query(
      `SELECT m.*,
              fg.name AS product_name,
              fg.article_code,
              fg.color,
              fg.size,
              fg.unit,
              w.name AS warehouse_name,
              u.name AS created_by_name
       FROM finished_good_warehouse_movements m
       JOIN finished_goods fg ON fg.id = m.finished_good_id
       JOIN warehouses w ON w.id = m.warehouse_id
       LEFT JOIN users u ON u.id = m.created_by
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const adjust = async (req, res, next) => {
  const client = await getClient();

  try {
    if (!assertManager(req, res)) return;

    await client.query('START TRANSACTION');

    const finishedGoodId = Number(req.body.finished_good_id);
    const warehouseId = Number(req.body.warehouse_id);
    const quantity = toPositiveNumber(req.body.quantity);
    const movementType = String(req.body.movement_type || '').toUpperCase();
    const notes = String(req.body.notes || '').trim() || null;

    if (!finishedGoodId || !warehouseId || !quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'finished_good_id, warehouse_id, and quantity greater than 0 are required',
      });
    }

    if (!['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(movementType)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'movement_type must be ADJUSTMENT_IN or ADJUSTMENT_OUT',
      });
    }

    const productRes = await client.query(
      'SELECT id, name, quantity FROM finished_goods WHERE id = ? AND is_deleted = 0',
      [finishedGoodId]
    );
    const warehouseRes = await client.query(
      'SELECT id, name FROM warehouses WHERE id = ? AND is_active = 1 AND deleted_at IS NULL',
      [warehouseId]
    );

    if (!productRes.rows.length || !warehouseRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product or warehouse not found' });
    }

    const existingStock = await client.query(
      `SELECT quantity
       FROM finished_good_warehouse_stock
       WHERE finished_good_id = ? AND warehouse_id = ?
       FOR UPDATE`,
      [finishedGoodId, warehouseId]
    );
    const currentWarehouseQty = Number(existingStock.rows[0]?.quantity || 0);

    if (movementType === 'ADJUSTMENT_OUT' && currentWarehouseQty < quantity) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: 'Not enough stock in this warehouse',
        available: currentWarehouseQty,
      });
    }

    const signedQty = movementType === 'ADJUSTMENT_OUT' ? -quantity : quantity;

    await client.query(
      `INSERT INTO finished_good_warehouse_stock
         (finished_good_id, warehouse_id, quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity = quantity + VALUES(quantity),
         updated_by = VALUES(updated_by)`,
      [finishedGoodId, warehouseId, signedQty, req.user.id, req.user.id]
    );

    await client.query(
      `UPDATE finished_goods
       SET quantity = quantity + ?
       WHERE id = ?`,
      [signedQty, finishedGoodId]
    );

    await client.query(
      `INSERT INTO finished_good_warehouse_movements
         (finished_good_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, ?, 'manual', NULL, ?, ?)`,
      [finishedGoodId, warehouseId, quantity, movementType, notes, req.user.id]
    );

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: movementType,
      tableName: 'finished_good_warehouse_stock',
      recordId: finishedGoodId,
      detail: `${movementType} ${quantity} for product #${finishedGoodId} in warehouse #${warehouseId}`,
    });

    return res.json({ success: true, message: 'Warehouse stock adjusted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const transfer = async (req, res, next) => {
  const client = await getClient();

  try {
    if (!assertManager(req, res)) return;

    await client.query('START TRANSACTION');

    const finishedGoodId = Number(req.body.finished_good_id);
    const fromWarehouseId = Number(req.body.from_warehouse_id);
    const toWarehouseId = Number(req.body.to_warehouse_id);
    const quantity = toPositiveNumber(req.body.quantity);
    const notes = String(req.body.notes || '').trim() || null;

    if (!finishedGoodId || !fromWarehouseId || !toWarehouseId || !quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'finished_good_id, from_warehouse_id, to_warehouse_id, and quantity greater than 0 are required',
      });
    }

    if (fromWarehouseId === toWarehouseId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Choose two different warehouses' });
    }

    const productRes = await client.query(
      'SELECT id FROM finished_goods WHERE id = ? AND is_deleted = 0',
      [finishedGoodId]
    );
    const warehousesRes = await client.query(
      `SELECT id FROM warehouses
       WHERE id IN (?, ?) AND is_active = 1 AND deleted_at IS NULL`,
      [fromWarehouseId, toWarehouseId]
    );

    if (!productRes.rows.length || warehousesRes.rows.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product or warehouse not found' });
    }

    const fromStock = await client.query(
      `SELECT quantity
       FROM finished_good_warehouse_stock
       WHERE finished_good_id = ? AND warehouse_id = ?
       FOR UPDATE`,
      [finishedGoodId, fromWarehouseId]
    );
    const available = Number(fromStock.rows[0]?.quantity || 0);

    if (available < quantity) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: 'Not enough stock in source warehouse',
        available,
      });
    }

    await client.query(
      `UPDATE finished_good_warehouse_stock
       SET quantity = quantity - ?, updated_by = ?
       WHERE finished_good_id = ? AND warehouse_id = ?`,
      [quantity, req.user.id, finishedGoodId, fromWarehouseId]
    );

    await client.query(
      `INSERT INTO finished_good_warehouse_stock
         (finished_good_id, warehouse_id, quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity = quantity + VALUES(quantity),
         updated_by = VALUES(updated_by)`,
      [finishedGoodId, toWarehouseId, quantity, req.user.id, req.user.id]
    );

    await client.query(
      `INSERT INTO finished_good_warehouse_movements
         (finished_good_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
       VALUES
         (?, ?, ?, 'TRANSFER_OUT', 'transfer', NULL, ?, ?),
         (?, ?, ?, 'TRANSFER_IN', 'transfer', NULL, ?, ?)`,
      [
        finishedGoodId, fromWarehouseId, quantity, notes, req.user.id,
        finishedGoodId, toWarehouseId, quantity, notes, req.user.id,
      ]
    );

    await client.query('COMMIT');

    await auditLog({
      userId: req.user.id,
      action: 'TRANSFERRED',
      tableName: 'finished_good_warehouse_stock',
      recordId: finishedGoodId,
      detail: `Transferred ${quantity} of product #${finishedGoodId} from warehouse #${fromWarehouseId} to #${toWarehouseId}`,
    });

    return res.json({ success: true, message: 'Warehouse stock transferred' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getAll,
  create,
  update,
  remove,
  getStock,
  getMovements,
  adjust,
  transfer,
  MOVEMENT_TYPES,
};
