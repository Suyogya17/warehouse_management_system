// src/controllers/permissionController.js
const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn, hasTable } = require('../utils/schemaSupport');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const { clearCache } = require('../middleware/cacheMiddleware');

const syncFinishedGoodVisibility = async (finishedGoodId) => {
  const result = await query(
    `SELECT COUNT(*) AS active_count
     FROM user_product_permissions upp
     JOIN users u ON u.id = upp.user_id
     WHERE upp.finished_good_id = ?
       AND upp.can_view = 1
       AND u.role IN ('USER', 'MEMBER', 'ELDER')`,
    [finishedGoodId]
  );

  const activeCount = Number(result[0]?.active_count || 0);

  await query(
    `UPDATE finished_goods
     SET is_visible = ?
     WHERE id = ?`,
    [activeCount > 0 ? 1 : 0, finishedGoodId]
  );
};

// ─── GRANT ACCESS ─────────────────────────────────────────────────────────────
const grantAccess = async (req, res, next) => {
  try {
    const { user_id, finished_good_ids } = req.body; // finished_good_ids is an array

    if (!user_id || !finished_good_ids || !Array.isArray(finished_good_ids)) {
      return res.status(400).json({ success: false, message: 'user_id and finished_good_ids[] required' });
    }

    for (const fg_id of finished_good_ids) {
      const updated = await query(
        `UPDATE user_product_permissions
         SET can_view = 1
         WHERE user_id = ? AND finished_good_id = ?`,
        [user_id, fg_id]
      );

      if (!updated.affectedRows) {
        const permissionInsert = await appendFiscalInsertFields(
          'user_product_permissions',
          ['user_id', 'finished_good_id', 'can_view'],
          [user_id, fg_id, 1]
        );
        await query(
          `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
           VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
          permissionInsert.values
        );
      }

      await syncFinishedGoodVisibility(fg_id);
    }

    clearCache();

    await auditLog({
      userId: req.user.id,
      action: 'GRANT_ACCESS',
      tableName: 'user_product_permissions',
      recordId: user_id,
      detail: `Granted access to ${finished_good_ids.length} products for user #${user_id}`,
    });

    return res.json({ success: true, message: 'Access granted' });
  } catch (err) {
    next(err);
  }
};

// ─── REVOKE ACCESS ────────────────────────────────────────────────────────────
const revokeAccess = async (req, res, next) => {
  try {
    const { user_id, finished_good_id } = req.body;
    const supportsAllocations = await hasColumn(
      'user_product_permissions',
      'allocation_quantity'
    );
    const supportsAllocationScope = supportsAllocations
      ? await hasColumn('user_product_permissions', 'allocation_scope')
      : false;

    const updated = await query(
      `UPDATE user_product_permissions
       SET can_view = 0${
         supportsAllocations
           ? `, allocation_percentage = NULL, allocation_quantity = NULL, allocation_started_at = NULL${supportsAllocationScope ? ', allocation_scope = NULL' : ''}`
           : ''
       }
       WHERE user_id = ? AND finished_good_id = ?`,
      [user_id, finished_good_id]
    );

    if (!updated.affectedRows) {
      const permissionInsert = await appendFiscalInsertFields(
        'user_product_permissions',
        ['user_id', 'finished_good_id', 'can_view'],
        [user_id, finished_good_id, 0]
      );
      await query(
        `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
         VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
        permissionInsert.values
      );
    }

    await syncFinishedGoodVisibility(finished_good_id);
    clearCache();

    await auditLog({
      userId: req.user.id,
      action: 'REVOKE_ACCESS',
      tableName: 'user_product_permissions',
      recordId: user_id,
      detail: `Revoked access to product #${finished_good_id} for user #${user_id}`,
    });

    return res.json({ success: true, message: 'Access revoked' });
  } catch (err) {
    next(err);
  }
};

// ─── GET USER'S ACCESSIBLE PRODUCTS ───────────────────────────────────────────
const getUserProducts = async (req, res, next) => {
  try {
    const { user_id } = req.params;

    const result = await query(
      `SELECT fg.*
       FROM finished_goods fg
       JOIN user_product_permissions upp ON upp.finished_good_id = fg.id
       WHERE upp.user_id = ?
         AND upp.can_view = 1
         AND fg.is_visible = 1
       ORDER BY fg.name`,
      [user_id]
    );


    return res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET ALL PERMISSIONS (for admin UI) ──────────────────────────────────────
const getAllPermissions = async (req, res, next) => {
  try {
    const compact = req.query.compact === '1';
    if (compact) {
      const result = await query(
        `SELECT id, user_id, finished_good_id, can_view
         FROM user_product_permissions
         ORDER BY id`
      );

      return res.json({ success: true, data: result.rows });
    }

    const supportsImage = await hasColumn('finished_goods', 'image_url');
    const supportsVisibility = await hasColumn('finished_goods', 'is_visible');
    const result = await query(
      `SELECT upp.*, u.name AS user_name, u.email, u.role AS user_role, u.country_code AS user_country_code,
              fg.name AS product_name, fg.article_code, fg.sole_code, fg.color,
              fg.size, fg.quantity, fg.min_quantity,
              ${supportsImage ? 'fg.image_url' : 'CAST(NULL AS CHAR) AS image_url'},
              ${supportsVisibility ? 'fg.is_visible' : '1 AS is_visible'}
       FROM user_product_permissions upp
       JOIN users u ON u.id = upp.user_id
       JOIN finished_goods fg ON fg.id = upp.finished_good_id
       ORDER BY u.name, fg.name`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const getPercentageAllocations = async (req, res, next) => {
  try {
    const supportsAllocations = await hasColumn(
      'user_product_permissions',
      'allocation_percentage'
    );
    if (!supportsAllocations) {
      return res.status(400).json({
        success: false,
        message:
          'Product percentage allocations require sql/add-product-percentage-allocations.sql.',
      });
    }
    const supportsOfferSnapshots = await hasColumn(
      'order_items',
      'ordered_from_offer'
    );
    const supportsAllocationScope = await hasColumn(
      'user_product_permissions',
      'allocation_scope'
    );
    const supportsControlledPool = await hasTable(
      'product_controlled_release_pools'
    );
    const supportsControlledUsage =
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));

    const rows = await query(
      `SELECT upp.finished_good_id, upp.user_id,
              upp.allocation_percentage, upp.allocation_quantity,
              upp.allocation_started_at,
              ${supportsAllocationScope ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE')" : "'EXCLUSIVE'"} AS allocation_scope,
              u.name AS user_name, u.email AS user_email,
              COALESCE(SUM(${
                supportsAllocationScope && supportsControlledUsage
                  ? `CASE
                       WHEN COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED'
                         THEN oi.controlled_personal_quantity
                       ELSE oi.qty_ordered
                     END`
                  : 'oi.qty_ordered'
              }), 0) AS ordered_quantity
       FROM user_product_permissions upp
       JOIN users u ON u.id = upp.user_id
       ${supportsControlledPool ? 'LEFT JOIN product_controlled_release_pools controlled_pool ON controlled_pool.finished_good_id = upp.finished_good_id' : ''}
       LEFT JOIN orders o
         ON o.created_by = upp.user_id
        AND o.status <> 'CANCELLED'
        AND ${
          supportsAllocationScope
            ? `(
                 (
                   COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED'
                   AND ${supportsControlledPool ? 'o.created_at >= controlled_pool.created_at' : '1 = 1'}
                 )
                 OR (
                   COALESCE(upp.allocation_scope, 'EXCLUSIVE') <> 'CONTROLLED'
                   AND o.created_at >= upp.allocation_started_at
                 )
               )`
            : 'o.created_at >= upp.allocation_started_at'
        }
       LEFT JOIN order_items oi
         ON oi.order_id = o.id
        AND oi.finished_good_id = upp.finished_good_id
        ${supportsOfferSnapshots ? supportsAllocationScope ? "AND (COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED' OR COALESCE(oi.ordered_from_offer, 0) = 0)" : 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
       WHERE upp.allocation_percentage IS NOT NULL
         AND upp.allocation_quantity IS NOT NULL
       GROUP BY upp.finished_good_id, upp.user_id,
                upp.allocation_percentage, upp.allocation_quantity,
                upp.allocation_started_at${supportsAllocationScope ? ', upp.allocation_scope' : ''}, u.name, u.email
       ORDER BY upp.finished_good_id, upp.allocation_percentage DESC, u.name`
    );

    let controlledPoolByProduct = new Map();
    if (supportsControlledPool && supportsControlledUsage) {
      const poolRows = await query(
        `SELECT pool.finished_good_id, pool.public_quantity,
                COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED'
                  THEN oi.controlled_public_quantity ELSE 0 END), 0) AS public_used_quantity
         FROM product_controlled_release_pools pool
         LEFT JOIN order_items oi ON oi.finished_good_id = pool.finished_good_id
         LEFT JOIN orders o ON o.id = oi.order_id
           AND o.created_at >= pool.created_at
         GROUP BY pool.finished_good_id, pool.public_quantity`
      );
      controlledPoolByProduct = new Map(
        poolRows.rows.map((row) => [
          Number(row.finished_good_id),
          {
            public_quantity: Number(row.public_quantity || 0),
            public_used_quantity: Number(row.public_used_quantity || 0),
          },
        ])
      );
    }

    return res.json({
      success: true,
      data: rows.map((row) => {
        const allocationQuantity = Number(row.allocation_quantity);
        const orderedQuantity = Number(row.ordered_quantity || 0);
        return {
          ...row,
          finished_good_id: Number(row.finished_good_id),
          user_id: Number(row.user_id),
          allocation_percentage: Number(row.allocation_percentage),
          allocation_quantity: allocationQuantity,
          ordered_quantity: orderedQuantity,
          remaining_quantity: Math.max(
            0,
            allocationQuantity - orderedQuantity
          ),
          public_quantity:
            controlledPoolByProduct.get(Number(row.finished_good_id))
              ?.public_quantity || 0,
          public_used_quantity:
            controlledPoolByProduct.get(Number(row.finished_good_id))
              ?.public_used_quantity || 0,
          public_remaining_quantity: Math.max(
            0,
            Number(
              controlledPoolByProduct.get(Number(row.finished_good_id))
                ?.public_quantity || 0
            ) -
              Number(
                controlledPoolByProduct.get(Number(row.finished_good_id))
                  ?.public_used_quantity || 0
              )
          ),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};

const getPercentageAllocationHistory = async (req, res, next) => {
  try {
    const supportsMetadata = await hasColumn('audit_logs', 'metadata');
    if (!supportsMetadata) {
      return res.json({
        success: true,
        history_available: false,
        migration_required: 'sql/add-activity-log-fields.sql',
        data: [],
      });
    }

    const result = await query(
      `SELECT al.id, al.action, al.record_id AS finished_good_id,
              al.detail, al.metadata, al.created_at,
              u.name AS changed_by_name, u.email AS changed_by_email,
              fg.name AS current_product_name,
              fg.article_code AS current_article_code,
              fg.sole_code AS current_sole_code,
              fg.color AS current_color
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN finished_goods fg ON fg.id = al.record_id
       WHERE al.table_name = 'user_product_permissions'
         AND al.action IN (
           'SAVE_PRODUCT_PERCENTAGE_ALLOCATION',
           'REMOVE_PRODUCT_PERCENTAGE_ALLOCATION'
         )
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT 500`
    );

    const historyRows = result.rows.map((row) => {
      let metadata = {};
      try {
        metadata =
          typeof row.metadata === 'string'
            ? JSON.parse(row.metadata || '{}')
            : row.metadata || {};
      } catch {
        metadata = {};
      }

      return {
        id: Number(row.id),
        action: row.action,
        finished_good_id: Number(row.finished_good_id),
        created_at: row.created_at,
        changed_by_name: row.changed_by_name,
        changed_by_email: row.changed_by_email,
        product_name:
          metadata.product_name || row.current_product_name || null,
        article_code:
          metadata.article_code || row.current_article_code || null,
        sole_code: metadata.sole_code || row.current_sole_code || null,
        color: metadata.color || row.current_color || null,
        total_quantity: Number(metadata.total_quantity || 0),
        pairs_per_carton: Number(metadata.pairs_per_carton || 0),
        total_cartons: Number(metadata.total_cartons || 0),
        assigned_quantity: Number(metadata.assigned_quantity || 0),
        assigned_cartons: Number(metadata.assigned_cartons || 0),
        unassigned_quantity: Number(metadata.unassigned_quantity || 0),
        unassigned_cartons: Number(metadata.unassigned_cartons || 0),
        percentage_total: Number(metadata.percentage_total || 0),
        allocation_scope: String(
          metadata.allocation_scope || 'EXCLUSIVE'
        ).toUpperCase(),
        targets: Array.isArray(metadata.targets) ? metadata.targets : [],
        has_snapshot: Number(metadata.snapshot_version || 0) > 0,
        detail: row.detail,
      };
    });

    const chronologicalRows = [...historyRows].sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime() || left.id - right.id
    );
    const latestByProduct = new Map();
    chronologicalRows.forEach((row) => {
      const previous = latestByProduct.get(row.finished_good_id);
      if (previous) previous.period_ended_at = row.created_at;
      latestByProduct.set(row.finished_good_id, row);
    });

    const completeRows = historyRows.filter((row) => row.has_snapshot);
    const productIds = [
      ...new Set(completeRows.map((row) => row.finished_good_id)),
    ].filter((id) => Number.isInteger(id) && id > 0);
    const earliestSnapshot = completeRows.reduce((earliest, row) => {
      const timestamp = new Date(row.created_at).getTime();
      return Number.isFinite(timestamp) && timestamp < earliest
        ? timestamp
        : earliest;
    }, Number.POSITIVE_INFINITY);

    let orderedRows = [];
    if (productIds.length && Number.isFinite(earliestSnapshot)) {
      const supportsOfferSnapshots = await hasColumn(
        'order_items',
        'ordered_from_offer'
      );
      const supportsControlledUsage = await hasColumn(
        'order_items',
        'controlled_personal_quantity'
      );
      const orderResult = await query(
        `SELECT oi.finished_good_id, o.created_by AS user_id,
                o.created_at, SUM(oi.qty_ordered) AS ordered_quantity,
                ${supportsControlledUsage ? 'SUM(oi.controlled_personal_quantity)' : '0'} AS controlled_personal_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'CANCELLED'
           AND o.created_at >= ?
           AND oi.finished_good_id IN (${productIds.map(() => '?').join(',')})
           ${supportsOfferSnapshots ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
         GROUP BY oi.finished_good_id, o.created_by, o.id, o.created_at
         ORDER BY o.created_at`,
        [new Date(earliestSnapshot), ...productIds]
      );
      orderedRows = orderResult.rows;
    }

    const ordersByProductUser = new Map();
    orderedRows.forEach((row) => {
      const key = `${Number(row.finished_good_id)}::${Number(row.user_id)}`;
      if (!ordersByProductUser.has(key)) ordersByProductUser.set(key, []);
      ordersByProductUser.get(key).push({
        created_at: row.created_at,
        ordered_quantity: Number(row.ordered_quantity || 0),
        controlled_personal_quantity: Number(
          row.controlled_personal_quantity || 0
        ),
      });
    });

    completeRows.forEach((row) => {
      const periodStart = new Date(row.created_at).getTime();
      const periodEnd = row.period_ended_at
        ? new Date(row.period_ended_at).getTime()
        : Number.POSITIVE_INFINITY;
      row.targets = row.targets.map((target) => {
        const key = `${row.finished_good_id}::${Number(target.user_id)}`;
        const orderedQuantity = (ordersByProductUser.get(key) || []).reduce(
          (sum, order) => {
            const orderedAt = new Date(order.created_at).getTime();
            return orderedAt >= periodStart && orderedAt < periodEnd
              ? sum +
                  (row.allocation_scope === 'CONTROLLED'
                    ? order.controlled_personal_quantity
                    : order.ordered_quantity)
              : sum;
          },
          0
        );
        const allocationQuantity = Number(target.allocation_quantity || 0);
        const remainingQuantity = Math.max(
          0,
          allocationQuantity - orderedQuantity
        );
        return {
          ...target,
          ordered_quantity: orderedQuantity,
          ordered_cartons:
            row.pairs_per_carton > 0
              ? orderedQuantity / row.pairs_per_carton
              : 0,
          remaining_quantity: remainingQuantity,
          remaining_cartons:
            row.pairs_per_carton > 0
              ? remainingQuantity / row.pairs_per_carton
              : 0,
        };
      });
    });

    return res.json({
      success: true,
      history_available: true,
      legacy_count: historyRows.length - completeRows.length,
      data: completeRows,
    });
  } catch (err) {
    next(err);
  }
};

const savePercentageAllocations = async (req, res, next) => {
  try {
    const finishedGoodId = Number(req.params.finished_good_id);
    const targets = Array.isArray(req.body.targets) ? req.body.targets : [];
    if (!Number.isInteger(finishedGoodId) || finishedGoodId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid finished good id required.',
      });
    }

    const supportsAllocations = await hasColumn(
      'user_product_permissions',
      'allocation_percentage'
    );
    if (!supportsAllocations) {
      return res.status(400).json({
        success: false,
        message:
          'Product percentage allocations require sql/add-product-percentage-allocations.sql.',
      });
    }
    const supportsAllocationScope = await hasColumn(
      'user_product_permissions',
      'allocation_scope'
    );
    const allocationScope = String(
      req.body.allocation_scope || 'EXCLUSIVE'
    ).trim().toUpperCase();
    if (!['EXCLUSIVE', 'PRIVATE', 'CONTROLLED'].includes(allocationScope)) {
      return res.status(400).json({
        success: false,
        message: 'Allocation mode must be EXCLUSIVE, PRIVATE, or CONTROLLED.',
      });
    }
    if (allocationScope === 'PRIVATE' && !supportsAllocationScope) {
      return res.status(409).json({
        success: false,
        message:
          'Private quantity allocation requires sql/add-private-product-allocations.sql.',
      });
    }
    const publicQuantity = Math.max(
      0,
      Math.floor(Number(req.body.public_quantity || 0))
    );
    const supportsControlledPool = await hasTable(
      'product_controlled_release_pools'
    );
    const supportsControlledUsage =
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));
    if (
      allocationScope === 'CONTROLLED' &&
      (!supportsAllocationScope ||
        !supportsControlledPool ||
        !supportsControlledUsage)
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Controlled release requires sql/add-private-product-allocations.sql.',
      });
    }

    const normalizedTargets = targets.map((target) => ({
      user_id: Number(target.user_id),
      allocation_percentage: Number(target.allocation_percentage),
      allocation_quantity: Number(target.allocation_quantity),
    }));
    const uniqueUserIds = new Set(
      normalizedTargets.map((target) => target.user_id)
    );
    if (
      uniqueUserIds.size !== normalizedTargets.length ||
      normalizedTargets.some(
        (target) =>
          !Number.isInteger(target.user_id) ||
          target.user_id <= 0 ||
          !Number.isFinite(target.allocation_percentage) ||
          target.allocation_percentage <= 0 ||
          target.allocation_percentage > 100 ||
          !Number.isInteger(target.allocation_quantity) ||
          target.allocation_quantity <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Each selected user needs a valid percentage and a whole-number quantity greater than zero.',
      });
    }
    const percentageTotal = normalizedTargets.reduce(
      (sum, target) => sum + target.allocation_percentage,
      0
    );
    if (percentageTotal > 100.00001) {
      return res.status(400).json({
        success: false,
        message: 'Selected user percentages cannot exceed 100%.',
      });
    }

    const productRows = await query(
      `SELECT id, name, article_code, sole_code, color, quantity,
              inner_boxes_per_outer_box
       FROM finished_goods
       WHERE id = ? AND is_deleted = 0`,
      [finishedGoodId]
    );
    if (!productRows.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }
    const assignedQuantity = normalizedTargets.reduce(
      (sum, target) => sum + Number(target.allocation_quantity || 0),
      0
    );
    const supportsWarehouseDelivery = await hasColumn(
      'order_item_warehouse_allocations',
      'allocation_status'
    );
    const reservationRows = await query(
      `SELECT COALESCE(SUM(${
        supportsWarehouseDelivery
          ? `GREATEST(
              0,
              oi.qty_ordered - COALESCE(delivered.delivered_quantity, 0)
            )`
          : 'oi.qty_ordered'
      }), 0) AS reserved_quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${
         supportsWarehouseDelivery
           ? `LEFT JOIN (
                SELECT order_item_id, SUM(quantity) AS delivered_quantity
                FROM order_item_warehouse_allocations
                WHERE allocation_status = 'DEDUCTED'
                GROUP BY order_item_id
              ) delivered ON delivered.order_item_id = oi.id`
           : ''
       }
       WHERE oi.finished_good_id = ?
         AND o.status IN ('PENDING', 'CONFIRMED', 'PACKED')`,
      [finishedGoodId]
    );
    const availableQuantity = Math.max(
      0,
      Number(productRows.rows[0].quantity || 0) -
        Number(reservationRows.rows?.[0]?.reserved_quantity || 0)
    );
    let controlledUsageByUser = new Map();
    let controlledPublicUsed = 0;
    if (allocationScope === 'CONTROLLED') {
      const usageRows = await query(
        `SELECT o.created_by AS user_id,
                COALESCE(SUM(oi.controlled_personal_quantity), 0) AS personal_used,
                COALESCE(SUM(oi.controlled_public_quantity), 0) AS public_used
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN product_controlled_release_pools pool
           ON pool.finished_good_id = oi.finished_good_id
          AND o.created_at >= pool.created_at
         WHERE oi.finished_good_id = ?
           AND o.status <> 'CANCELLED'
         GROUP BY o.created_by`,
        [finishedGoodId]
      );
      controlledUsageByUser = new Map(
        usageRows.rows.map((row) => [
          Number(row.user_id),
          Number(row.personal_used || 0),
        ])
      );
      controlledPublicUsed = usageRows.rows.reduce(
        (sum, row) => sum + Number(row.public_used || 0),
        0
      );
      const belowUsedTarget = normalizedTargets.find(
        (target) =>
          target.allocation_quantity <
          Number(controlledUsageByUser.get(target.user_id) || 0)
      );
      if (belowUsedTarget) {
        return res.status(409).json({
          success: false,
          message:
            'A user allocation cannot be reduced below the quantity that user has already ordered.',
        });
      }
      if (publicQuantity < controlledPublicUsed) {
        return res.status(409).json({
          success: false,
          message:
            'Public release cannot be reduced below the quantity already ordered publicly.',
        });
      }
    }
    const controlledRemainingQuantity =
      allocationScope === 'CONTROLLED'
        ? normalizedTargets.reduce(
            (sum, target) =>
              sum +
              Math.max(
                0,
                target.allocation_quantity -
                  Number(controlledUsageByUser.get(target.user_id) || 0)
              ),
            0
          ) + Math.max(0, publicQuantity - controlledPublicUsed)
        : assignedQuantity;
    if (controlledRemainingQuantity > availableQuantity) {
      return res.status(409).json({
        success: false,
        message: `Only ${availableQuantity} unreserved pairs are available to allocate or release.`,
      });
    }

    let targetUsers = [];
    if (normalizedTargets.length) {
      const users = await query(
        `SELECT id, name, email
         FROM users
         WHERE role = 'USER'
           AND id IN (${normalizedTargets.map(() => '?').join(',')})`,
        normalizedTargets.map((target) => target.user_id)
      );
      targetUsers = users.rows;
      if (users.rows.length !== normalizedTargets.length) {
        return res.status(400).json({
          success: false,
          message: 'Allocations can only be assigned to valid USER accounts.',
        });
      }
    }

    await query(
      `UPDATE user_product_permissions
       SET allocation_percentage = NULL,
           allocation_quantity = NULL,
           allocation_started_at = NULL
           ${supportsAllocationScope ? ', allocation_scope = NULL' : ''}
       WHERE finished_good_id = ?`,
      [finishedGoodId]
    );

    for (const target of normalizedTargets) {
      const updated = await query(
        `UPDATE user_product_permissions
         SET can_view = 1,
             allocation_percentage = ?,
             allocation_quantity = ?,
             allocation_started_at = NOW()
             ${supportsAllocationScope ? ', allocation_scope = ?' : ''}
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          target.allocation_percentage,
          target.allocation_quantity,
          ...(supportsAllocationScope ? [allocationScope] : []),
          target.user_id,
          finishedGoodId,
        ]
      );
      if (!updated.affectedRows) {
        const allocationColumns = [
          'user_id',
          'finished_good_id',
          'can_view',
          'allocation_percentage',
          'allocation_quantity',
          'allocation_started_at',
          ...(supportsAllocationScope ? ['allocation_scope'] : []),
        ];
        const allocationValues = [
          target.user_id,
          finishedGoodId,
          1,
          target.allocation_percentage,
          target.allocation_quantity,
          new Date(),
          ...(supportsAllocationScope ? [allocationScope] : []),
        ];
        const permissionInsert = await appendFiscalInsertFields(
          'user_product_permissions',
          allocationColumns,
          allocationValues
        );
        await query(
          `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
           VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
          permissionInsert.values
        );
      }
    }

    if (supportsControlledPool) {
      if (allocationScope === 'CONTROLLED') {
        await query(
          `INSERT INTO product_controlled_release_pools
             (finished_good_id, public_quantity)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE public_quantity = VALUES(public_quantity)`,
          [finishedGoodId, publicQuantity]
        );
      } else {
        await query(
          'DELETE FROM product_controlled_release_pools WHERE finished_good_id = ?',
          [finishedGoodId]
        );
      }
    }

    if (normalizedTargets.length) {
      await query(
        'UPDATE finished_goods SET is_visible = 1 WHERE id = ?',
        [finishedGoodId]
      );
    } else {
      await syncFinishedGoodVisibility(finishedGoodId);
    }
    clearCache();

    const product = productRows.rows[0];
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const totalQuantity = Number(product.quantity || 0);
    const totalCartons =
      pairsPerCarton > 0 ? Math.ceil(totalQuantity / pairsPerCarton) : 0;
    const assignedCartons =
      pairsPerCarton > 0
        ? normalizedTargets.reduce(
            (sum, target) =>
              sum +
              Math.floor(
                Number(target.allocation_quantity || 0) / pairsPerCarton
              ),
            0
          )
        : 0;
    const userById = new Map(
      targetUsers.map((user) => [Number(user.id), user])
    );
    await auditLog({
      userId: req.user.id,
      action: normalizedTargets.length
        ? 'SAVE_PRODUCT_PERCENTAGE_ALLOCATION'
        : 'REMOVE_PRODUCT_PERCENTAGE_ALLOCATION',
      tableName: 'user_product_permissions',
      recordId: finishedGoodId,
      detail: normalizedTargets.length
        ? `Allocated ${product.article_code || product.name} to ${normalizedTargets.length} users (${percentageTotal}% total)`
        : `Removed percentage allocation from ${product.article_code || product.name}`,
      metadata: {
        snapshot_version: 1,
        product_name: product.name,
        article_code: product.article_code,
        sole_code: product.sole_code,
        color: product.color,
        total_quantity: totalQuantity,
        pairs_per_carton: pairsPerCarton,
        total_cartons: totalCartons,
        assigned_quantity: assignedQuantity,
        assigned_cartons: assignedCartons,
        unassigned_quantity: Math.max(0, totalQuantity - assignedQuantity),
        unassigned_cartons: Math.max(0, totalCartons - assignedCartons),
        percentage_total: percentageTotal,
        allocation_scope: allocationScope,
        public_quantity: publicQuantity,
        public_used_quantity: controlledPublicUsed,
        targets: normalizedTargets.map((target) => {
          const targetUser = userById.get(Number(target.user_id));
          return {
            user_id: target.user_id,
            user_name: targetUser?.name || null,
            user_email: targetUser?.email || null,
            allocation_percentage: target.allocation_percentage,
            allocation_quantity: target.allocation_quantity,
            allocation_cartons:
              pairsPerCarton > 0
                ? Math.floor(target.allocation_quantity / pairsPerCarton)
                : 0,
          };
        }),
      },
    });

    return res.json({
      success: true,
      data: {
        finished_good_id: finishedGoodId,
        percentage_total: percentageTotal,
        allocation_scope: allocationScope,
        public_quantity: publicQuantity,
        targets: normalizedTargets,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  grantAccess,
  revokeAccess,
  getUserProducts,
  getAllPermissions,
  getPercentageAllocations,
  getPercentageAllocationHistory,
  savePercentageAllocations,
};
