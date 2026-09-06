// src/controllers/permissionController.js
const { query, getClient } = require('../config/db');
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
    const previousResult = await query(
      `SELECT can_view, allocation_percentage, allocation_quantity,
              allocation_started_at
       FROM user_product_permissions
       WHERE user_id = ? AND finished_good_id = ?
       LIMIT 1`,
      [user_id, finished_good_id]
    );
    const previousPermission = previousResult.rows[0] || null;

    const updated = await query(
      `UPDATE user_product_permissions
       SET can_view = 0
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
      metadata: {
        finished_good_id: Number(finished_good_id),
        previous_can_view: previousPermission
          ? Number(previousPermission.can_view || 0)
          : null,
        allocation_preserved:
          previousPermission?.allocation_quantity !== null &&
          previousPermission?.allocation_quantity !== undefined,
        allocation_percentage:
          previousPermission?.allocation_percentage ?? null,
        allocation_quantity: previousPermission?.allocation_quantity ?? null,
        allocation_started_at:
          previousPermission?.allocation_started_at ?? null,
      },
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
    const supportsParentDealer = await hasColumn('users', 'parent_dealer_id');
    const supportsParentShare = await hasColumn(
      'users',
      'parent_allocation_share_percent'
    );

    const rows = await query(
      `SELECT upp.finished_good_id, upp.user_id,
              upp.allocation_percentage, upp.allocation_quantity,
              upp.allocation_started_at,
              ${supportsAllocationScope ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE')" : "'EXCLUSIVE'"} AS allocation_scope,
              u.name AS user_name, u.email AS user_email,
              ${
                supportsParentDealer
                  ? `u.parent_dealer_id,
                     ${supportsParentShare ? 'u.parent_allocation_share_percent,' : 'NULL AS parent_allocation_share_percent,'}
                     parent_user.name AS parent_dealer_name,
                     parent_user.email AS parent_dealer_email,`
                  : `NULL AS parent_dealer_id,
                     NULL AS parent_allocation_share_percent,
                     NULL AS parent_dealer_name,
                     NULL AS parent_dealer_email,`
              }
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
       ${supportsParentDealer ? 'LEFT JOIN users parent_user ON parent_user.id = u.parent_dealer_id' : ''}
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
                ${supportsParentDealer ? `, u.parent_dealer_id${supportsParentShare ? ', u.parent_allocation_share_percent' : ''}, parent_user.name, parent_user.email` : ''}
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
           'REMOVE_PRODUCT_PERCENTAGE_ALLOCATION',
           'RESTORE_PRODUCT_PERCENTAGE_ALLOCATION'
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
    const supportsAllocationPublication =
      (await hasColumn('finished_goods', 'allocation_publication_status')) &&
      (await hasColumn('finished_goods', 'allocation_publish_at'));
    if (!supportsAllocationPublication) {
      return res.status(409).json({
        success: false,
        message:
          'Allocation draft/show controls require sql/add-allocation-publication-status.sql.',
      });
    }
    const publicationStatus = String(
      req.body.publication_status || 'ACTIVE'
    ).trim().toUpperCase();
    if (!['DRAFT', 'ACTIVE', 'SCHEDULED'].includes(publicationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Publication status must be Draft, Active, or Scheduled.',
      });
    }
    const requestedPublishAt = req.body.publish_at
      ? new Date(req.body.publish_at)
      : null;
    if (
      publicationStatus === 'SCHEDULED' &&
      (!requestedPublishAt ||
        Number.isNaN(requestedPublishAt.getTime()) ||
        requestedPublishAt.getTime() <= Date.now())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Choose a future date and time for the scheduled allocation.',
      });
    }
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
      const supportsParentDealer = await hasColumn('users', 'parent_dealer_id');
      const users = await query(
        `SELECT id, name, email,
                ${supportsParentDealer ? 'parent_dealer_id' : 'NULL AS parent_dealer_id'}
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

      const linkedShareholders = users.rows.filter(
        (user) => Number(user.parent_dealer_id || 0) > 0
      );
      if (linkedShareholders.length) {
        const existingRows = await query(
          `SELECT user_id, allocation_percentage, allocation_quantity
           FROM user_product_permissions
           WHERE finished_good_id = ?
             AND user_id IN (${linkedShareholders.map(() => '?').join(',')})`,
          [finishedGoodId, ...linkedShareholders.map((user) => user.id)]
        );
        const existingByUser = new Map(
          existingRows.rows.map((row) => [Number(row.user_id), row])
        );
        const changedShareholder = normalizedTargets.find((target) => {
          const user = linkedShareholders.find(
            (candidate) => Number(candidate.id) === Number(target.user_id)
          );
          if (!user) return false;
          const existing = existingByUser.get(Number(target.user_id));
          return (
            !existing ||
            Math.abs(
              Number(existing.allocation_percentage || 0) -
                Number(target.allocation_percentage || 0)
            ) > 0.0001 ||
            Number(existing.allocation_quantity || 0) !==
              Number(target.allocation_quantity || 0)
          );
        });
        if (changedShareholder) {
          const shareholder = linkedShareholders.find(
            (user) => Number(user.id) === Number(changedShareholder.user_id)
          );
          return res.status(409).json({
            success: false,
            message: `${shareholder?.name || shareholder?.email || 'A shareholder shop'} is linked to a parent dealer. Do not enter a global percentage for this account. Allocate its quantity from the parent dealer using Shareholder Shop creation or Transfer balance.`,
          });
        }
      }
    }

    const previousStartRows = normalizedTargets.length
      ? await query(
          `SELECT user_id, allocation_started_at
           FROM user_product_permissions
           WHERE finished_good_id = ?
             AND user_id IN (${normalizedTargets.map(() => '?').join(',')})
             AND allocation_quantity IS NOT NULL`,
          [finishedGoodId, ...normalizedTargets.map((target) => target.user_id)]
        )
      : { rows: [] };
    const previousStartByUser = new Map(
      previousStartRows.rows.map((row) => [
        Number(row.user_id),
        row.allocation_started_at,
      ])
    );
    normalizedTargets.forEach((target) => {
      target.allocation_started_at =
        previousStartByUser.get(target.user_id) || new Date();
    });

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
             allocation_started_at = ?
             ${supportsAllocationScope ? ', allocation_scope = ?' : ''}
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          target.allocation_percentage,
          target.allocation_quantity,
          target.allocation_started_at,
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
          target.allocation_started_at,
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

    await query(
      `UPDATE finished_goods
       SET allocation_publication_status = ?, allocation_publish_at = ?
       WHERE id = ?`,
      [
        normalizedTargets.length ? publicationStatus : 'DRAFT',
        normalizedTargets.length && publicationStatus === 'SCHEDULED'
          ? requestedPublishAt
          : null,
        finishedGoodId,
      ]
    );
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
        publication_status: normalizedTargets.length
          ? publicationStatus
          : 'DRAFT',
        publish_at:
          normalizedTargets.length && publicationStatus === 'SCHEDULED'
            ? requestedPublishAt.toISOString()
            : null,
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
            allocation_started_at: target.allocation_started_at,
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

const parseAuditMetadata = (value) => {
  try {
    return typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
  } catch {
    return {};
  }
};

const updatePercentageAllocationPublication = async (req, res, next) => {
  try {
    const finishedGoodId = Number(req.params.finished_good_id);
    const publicationStatus = String(
      req.body?.publication_status || ''
    ).trim().toUpperCase();
    if (!Number.isInteger(finishedGoodId) || finishedGoodId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid finished good id required.',
      });
    }
    if (!['DRAFT', 'ACTIVE'].includes(publicationStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Publication status must be Draft or Active.',
      });
    }
    const supportsPublication =
      (await hasColumn('finished_goods', 'allocation_publication_status')) &&
      (await hasColumn('finished_goods', 'allocation_publish_at'));
    if (!supportsPublication) {
      return res.status(409).json({
        success: false,
        message:
          'Allocation show/hide controls require sql/add-allocation-publication-status.sql.',
      });
    }
    const productResult = await query(
      `SELECT fg.id, fg.name, fg.article_code, fg.sole_code, fg.color,
              fg.allocation_publication_status,
              COUNT(upp.user_id) AS allocation_count
       FROM finished_goods fg
       LEFT JOIN user_product_permissions upp
         ON upp.finished_good_id = fg.id
        AND upp.allocation_quantity IS NOT NULL
       WHERE fg.id = ? AND fg.is_deleted = 0
       GROUP BY fg.id, fg.name, fg.article_code, fg.sole_code, fg.color,
                fg.allocation_publication_status`,
      [finishedGoodId]
    );
    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (Number(product.allocation_count || 0) <= 0) {
      return res.status(409).json({
        success: false,
        message: 'Save a product allocation before changing its visibility.',
      });
    }
    const previousStatus = String(
      product.allocation_publication_status || 'DRAFT'
    ).toUpperCase();
    await query(
      `UPDATE finished_goods
       SET allocation_publication_status = ?, allocation_publish_at = NULL
       WHERE id = ?`,
      [publicationStatus, finishedGoodId]
    );
    clearCache();
    await auditLog({
      userId: req.user.id,
      action:
        publicationStatus === 'ACTIVE'
          ? 'SHOW_PRODUCT_ALLOCATION'
          : 'HIDE_PRODUCT_ALLOCATION',
      tableName: 'finished_goods',
      recordId: finishedGoodId,
      detail: `${publicationStatus === 'ACTIVE' ? 'Showed' : 'Hid'} allocated product ${product.article_code || product.name} ${publicationStatus === 'ACTIVE' ? 'to' : 'from'} assigned dealers`,
      metadata: {
        finished_good_id: finishedGoodId,
        product_name: product.name,
        article_code: product.article_code,
        sole_code: product.sole_code,
        color: product.color,
        previous_publication_status: previousStatus,
        publication_status: publicationStatus,
        allocation_preserved: true,
      },
    });
    return res.json({
      success: true,
      message:
        publicationStatus === 'ACTIVE'
          ? 'Product is now visible to its assigned dealers.'
          : 'Product is hidden from dealers. Its saved allocation is preserved.',
      data: {
        finished_good_id: finishedGoodId,
        publication_status: publicationStatus,
      },
    });
  } catch (err) {
    next(err);
  }
};

const restorePercentageAllocations = async (req, res, next) => {
  const client = await getClient();
  let committed = false;
  try {
    const finishedGoodId = Number(req.params.finished_good_id);
    const requestedReconcileOrderIds = [
      ...new Set(
        (Array.isArray(req.body?.reconcile_order_ids)
          ? req.body.reconcile_order_ids
          : []
        )
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];
    const requestedSnapshotAuditId = Number(req.body?.snapshot_audit_id || 0);
    const requestedShortageUserId = Number(req.body?.shortage_user_id || 0);
    if (
      requestedSnapshotAuditId &&
      (!Number.isInteger(requestedSnapshotAuditId) ||
        requestedSnapshotAuditId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid allocation history version required.',
      });
    }
    if (
      requestedShortageUserId &&
      (!Number.isInteger(requestedShortageUserId) ||
        requestedShortageUserId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid dealer required for the shortage adjustment.',
      });
    }
    if (!Number.isInteger(finishedGoodId) || finishedGoodId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid finished good id required.',
      });
    }

    const [supportsMetadata, supportsAllocations, supportsAllocationScope] =
      await Promise.all([
        hasColumn('audit_logs', 'metadata'),
        hasColumn('user_product_permissions', 'allocation_quantity'),
        hasColumn('user_product_permissions', 'allocation_scope'),
      ]);
    const supportsPublication =
      (await hasColumn('finished_goods', 'allocation_publication_status')) &&
      (await hasColumn('finished_goods', 'allocation_publish_at'));
    if (!supportsMetadata || !supportsAllocations || !supportsPublication) {
      return res.status(409).json({
        success: false,
        message: 'Allocation restoration requires the allocation and activity-log migrations.',
      });
    }

    await client.query('START TRANSACTION');
    const productResult = await client.query(
      `SELECT id, name, article_code, sole_code, color, quantity,
              inner_boxes_per_outer_box
       FROM finished_goods
       WHERE id = ? AND is_deleted = 0
       FOR UPDATE`,
      [finishedGoodId]
    );
    const product = productResult.rows[0];
    if (!product) {
      const error = new Error('Product not found.');
      error.statusCode = 404;
      throw error;
    }

    const currentResult = await client.query(
      `SELECT COUNT(*) AS allocation_count
       FROM user_product_permissions
       WHERE finished_good_id = ?
         AND allocation_quantity IS NOT NULL`,
      [finishedGoodId]
    );
    if (Number(currentResult.rows[0]?.allocation_count || 0) > 0) {
      const error = new Error(
        'This product already has an active or draft allocation. Edit the existing allocation instead.'
      );
      error.statusCode = 409;
      throw error;
    }

    const snapshotResult = await client.query(
      `SELECT id, action, metadata, created_at
       FROM audit_logs
       WHERE table_name = 'user_product_permissions'
         AND record_id = ?
         AND action IN (
           'SAVE_PRODUCT_PERCENTAGE_ALLOCATION',
           'RESTORE_PRODUCT_PERCENTAGE_ALLOCATION',
           'REMOVE_PRODUCT_PERCENTAGE_ALLOCATION'
         )
         AND metadata IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      [finishedGoodId]
    );
    const timelineRows = [...snapshotResult.rows].reverse();
    const completeSnapshots = timelineRows.filter((row) => {
      const metadata = parseAuditMetadata(row.metadata);
      return Number(metadata.snapshot_version || 0) > 0 &&
        Array.isArray(metadata.targets) && metadata.targets.length > 0;
    });
    const snapshotRow = requestedSnapshotAuditId
      ? completeSnapshots.find(
          (row) => Number(row.id) === requestedSnapshotAuditId
        )
      : completeSnapshots[completeSnapshots.length - 1];
    if (!snapshotRow) {
      const error = new Error(
        requestedSnapshotAuditId
          ? 'The selected allocation-history version is unavailable or does not contain a complete snapshot.'
          : 'No complete previous allocation snapshot is available for this product.'
      );
      error.statusCode = 404;
      throw error;
    }

    const snapshot = parseAuditMetadata(snapshotRow.metadata);
    const snapshotTime = new Date(snapshotRow.created_at).getTime();
    const lastRemoval = [...timelineRows]
      .reverse()
      .find(
        (row) =>
          row.action === 'REMOVE_PRODUCT_PERCENTAGE_ALLOCATION' &&
          new Date(row.created_at).getTime() < snapshotTime
      );
    const lifecycleBoundary = lastRemoval
      ? new Date(lastRemoval.created_at).getTime()
      : Number.NEGATIVE_INFINITY;
    const lifecycleSnapshots = completeSnapshots.filter((row) => {
      const createdAt = new Date(row.created_at).getTime();
      return createdAt > lifecycleBoundary && createdAt <= snapshotTime;
    });
    const allocationStartByUser = new Map();
    lifecycleSnapshots.forEach((row) => {
      const metadata = parseAuditMetadata(row.metadata);
      metadata.targets.forEach((target) => {
        const userId = Number(target.user_id);
        if (!Number.isInteger(userId) || userId <= 0) return;
        const explicitStart = target.allocation_started_at
          ? new Date(target.allocation_started_at)
          : null;
        const start =
          explicitStart && !Number.isNaN(explicitStart.getTime())
            ? explicitStart
            : new Date(row.created_at);
        const current = allocationStartByUser.get(userId);
        if (!current || start.getTime() < current.getTime()) {
          allocationStartByUser.set(userId, start);
        }
      });
    });
    const allocationScope = String(
      snapshot.allocation_scope || 'EXCLUSIVE'
    ).toUpperCase();
    if (allocationScope !== 'EXCLUSIVE' && !supportsAllocationScope) {
      const error = new Error(
        'The previous allocation requires the private-allocation migration before it can be restored.'
      );
      error.statusCode = 409;
      throw error;
    }
    if (
      allocationScope === 'CONTROLLED' &&
      !(await hasTable('product_controlled_release_pools'))
    ) {
      const error = new Error(
        'The previous controlled allocation cannot be restored until the controlled-release migration is installed.'
      );
      error.statusCode = 409;
      throw error;
    }
    const restoredTargets = new Map(
      snapshot.targets.map((target) => [
        Number(target.user_id),
        {
          user_id: Number(target.user_id),
          allocation_percentage: Number(target.allocation_percentage || 0),
          allocation_quantity: Math.max(
            0,
            Math.floor(Number(target.allocation_quantity || 0))
          ),
          allocation_started_at:
            allocationStartByUser.get(Number(target.user_id)) ||
            snapshotRow.created_at,
        },
      ])
    );

    const transferResult = requestedSnapshotAuditId
      ? { rows: [] }
      : await client.query(
          `SELECT metadata, created_at
           FROM audit_logs
           WHERE table_name = 'user_product_permissions'
             AND record_id = ?
             AND action = 'TRANSFER_PRODUCT_ALLOCATION_BALANCE'
             AND created_at >= ?
           ORDER BY created_at, id`,
          [finishedGoodId, snapshotRow.created_at]
        );
    transferResult.rows.forEach((row) => {
      const transfer = parseAuditMetadata(row.metadata);
      const sourceUserId = Number(transfer.source_user_id);
      if (restoredTargets.has(sourceUserId)) {
        restoredTargets.get(sourceUserId).allocation_quantity = Math.max(
          0,
          Math.floor(Number(transfer.source_after_quantity || 0))
        );
      }
      (Array.isArray(transfer.destinations) ? transfer.destinations : []).forEach(
        (destination) => {
          const userId = Number(destination.user_id);
          if (!Number.isInteger(userId) || userId <= 0) return;
          const existing = restoredTargets.get(userId);
          restoredTargets.set(userId, {
            user_id: userId,
            allocation_percentage: existing?.allocation_percentage || 0,
            allocation_quantity: Math.max(
              0,
              Math.floor(Number(destination.after_quantity || 0))
            ),
            allocation_started_at:
              existing?.allocation_started_at || row.created_at,
          });
        }
      );
    });

    const restorableTargets = [...restoredTargets.values()]
      .filter(
        (target) =>
          Number.isInteger(target.user_id) &&
          target.user_id > 0 &&
          target.allocation_quantity > 0
      );
    const restoredAssignedQuantity = restorableTargets.reduce(
      (sum, target) => sum + target.allocation_quantity,
      0
    );
    const snapshotPercentageTotal =
      Number(snapshot.percentage_total || 0) ||
      snapshot.targets.reduce(
        (sum, target) => sum + Number(target.allocation_percentage || 0),
        0
      );
    const restoredPercentageTotal = Math.max(
      0,
      snapshotPercentageTotal ||
        (restoredAssignedQuantity /
          Math.max(1, Number(snapshot.total_quantity || product.quantity || 1))) *
          100
    );
    const targets = restorableTargets.map((target) => ({
        ...target,
        allocation_percentage:
          restoredAssignedQuantity > 0
            ? (target.allocation_quantity / restoredAssignedQuantity) *
              restoredPercentageTotal
            : 0,
      }));
    if (!targets.length) {
      const error = new Error('The previous allocation has no restorable dealer balances.');
      error.statusCode = 409;
      throw error;
    }

    const userResult = await client.query(
      `SELECT id, name, email
       FROM users
       WHERE id IN (${targets.map(() => '?').join(',')})
         AND role IN ('USER', 'ELDER', 'MEMBER')`,
      targets.map((target) => target.user_id)
    );
    const validUserIds = new Set(userResult.rows.map((row) => Number(row.id)));
    const restoredUserById = new Map(
      userResult.rows.map((row) => [Number(row.id), row])
    );
    if (targets.some((target) => !validUserIds.has(target.user_id))) {
      const error = new Error(
        'One or more dealers from the previous allocation no longer exist.'
      );
      error.statusCode = 409;
      throw error;
    }

    const supportsOfferSnapshots = await hasColumn(
      'order_items',
      'ordered_from_offer'
    );
    const supportsControlledUsage =
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));
    let reconciledOrders = [];
    if (requestedReconcileOrderIds.length) {
      if (allocationScope === 'CONTROLLED') {
        const error = new Error(
          'Legacy reservation reconciliation is only available for percentage/private allocations.'
        );
        error.statusCode = 409;
        throw error;
      }
      const reconcileResult = await client.query(
        `SELECT o.id AS order_id, o.created_by AS user_id, o.status,
                o.created_at, u.name AS dealer_name, u.email AS dealer_email,
                SUM(oi.qty_ordered) AS quantity,
                ${supportsOfferSnapshots
                  ? 'MAX(COALESCE(oi.ordered_from_offer, 0))'
                  : '0'} AS was_offer
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.id IN (${requestedReconcileOrderIds.map(() => '?').join(',')})
           AND oi.finished_good_id = ?
           AND o.status <> 'CANCELLED'
         GROUP BY o.id, o.created_by, o.status, o.created_at, u.name, u.email`,
        [...requestedReconcileOrderIds, finishedGoodId]
      );
      if (reconcileResult.rows.length !== requestedReconcileOrderIds.length) {
        const error = new Error(
          'One or more selected reservations no longer belong to this product or were cancelled.'
        );
        error.statusCode = 409;
        throw error;
      }
      const targetByUser = new Map(
        targets.map((target) => [Number(target.user_id), target])
      );
      const invalidReservation = reconcileResult.rows.find(
        (row) => !targetByUser.has(Number(row.user_id))
      );
      if (invalidReservation) {
        const error = new Error(
          `Order #${invalidReservation.order_id} belongs to ${invalidReservation.dealer_name || invalidReservation.dealer_email || 'a dealer'} who is not part of this saved allocation version.`
        );
        error.statusCode = 409;
        throw error;
      }
      reconciledOrders = reconcileResult.rows.map((row) => ({
        order_id: Number(row.order_id),
        user_id: Number(row.user_id),
        dealer_name: row.dealer_name || null,
        dealer_email: row.dealer_email || null,
        quantity: Number(row.quantity || 0),
        was_offer: Number(row.was_offer || 0) === 1,
        created_at: row.created_at,
      }));
      for (const order of reconciledOrders) {
        const target = targetByUser.get(order.user_id);
        if (
          new Date(order.created_at).getTime() <
          new Date(target.allocation_started_at).getTime()
        ) {
          target.allocation_started_at = order.created_at;
        }
      }
      if (supportsOfferSnapshots) {
        await client.query(
          `UPDATE order_items
           SET ordered_from_offer = 0
           WHERE finished_good_id = ?
             AND order_id IN (${requestedReconcileOrderIds.map(() => '?').join(',')})`,
          [finishedGoodId, ...requestedReconcileOrderIds]
        );
      }
    }
    const earliestStart = targets.reduce(
      (earliest, target) =>
        new Date(target.allocation_started_at).getTime() < earliest
          ? new Date(target.allocation_started_at).getTime()
          : earliest,
      Number.POSITIVE_INFINITY
    );
    const orderResult = await client.query(
      `SELECT o.id AS order_id, o.created_by AS user_id, o.created_at,
              oi.qty_ordered,
              ${
                supportsControlledUsage
                  ? 'oi.controlled_personal_quantity'
                  : '0 AS controlled_personal_quantity'
              },
              ${
                supportsControlledUsage
                  ? 'oi.controlled_public_quantity'
                  : '0 AS controlled_public_quantity'
              }
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.finished_good_id = ?
         AND o.status <> 'CANCELLED'
         AND o.created_at >= ?
         ${
           supportsOfferSnapshots
             ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0'
             : ''
         }`,
      [finishedGoodId, new Date(earliestStart)]
    );
    const restoredTargetByUser = new Map(
      targets.map((target) => [Number(target.user_id), target])
    );
    const requestedReconcileOrderIdSet = new Set(requestedReconcileOrderIds);
    const countedReconcileOrderIds = new Set();
    const orderedByUser = new Map();
    let publicUsedQuantity = 0;
    orderResult.rows.forEach((order) => {
      if (allocationScope === 'CONTROLLED' && supportsControlledUsage) {
        publicUsedQuantity += Number(order.controlled_public_quantity || 0);
      }
      // Use the final target records because reconciliation can move a
      // dealer's allocation start backwards to include a selected legacy
      // order. The original restoredTargets map still contains the snapshot
      // start date and would incorrectly exclude that order again.
      const target = restoredTargetByUser.get(Number(order.user_id));
      if (
        !target ||
        new Date(order.created_at).getTime() <
          new Date(target.allocation_started_at).getTime()
      ) {
        return;
      }
      const usedQuantity =
        allocationScope === 'CONTROLLED' && supportsControlledUsage
          ? Number(order.controlled_personal_quantity || 0)
          : Number(order.qty_ordered || 0);
      orderedByUser.set(
        Number(order.user_id),
        Number(orderedByUser.get(Number(order.user_id)) || 0) + usedQuantity
      );
      if (requestedReconcileOrderIdSet.has(Number(order.order_id))) {
        countedReconcileOrderIds.add(Number(order.order_id));
      }
    });

    // A selected legacy order is an explicit administrator decision that this
    // product line consumed the dealer's restored allocation. Count it exactly
    // once even when legacy timestamps or offer flags keep it out of the normal
    // order query. This is safe because the selected order/product/dealer was
    // validated above and the whole restore remains transactional.
    reconciledOrders.forEach((order) => {
      if (countedReconcileOrderIds.has(order.order_id)) return;
      orderedByUser.set(
        order.user_id,
        Number(orderedByUser.get(order.user_id) || 0) + order.quantity
      );
      countedReconcileOrderIds.add(order.order_id);
    });

    const supportsWarehouseDelivery = await hasColumn(
      'order_item_warehouse_allocations',
      'allocation_status'
    );
    const reservationResult = await client.query(
      `SELECT COALESCE(SUM(${supportsWarehouseDelivery
        ? `GREATEST(0, oi.qty_ordered - COALESCE(delivered.delivered_quantity, 0))`
        : 'oi.qty_ordered'}), 0) AS reserved_quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${supportsWarehouseDelivery
         ? `LEFT JOIN (
              SELECT order_item_id, SUM(quantity) AS delivered_quantity
              FROM order_item_warehouse_allocations
              WHERE allocation_status = 'DEDUCTED'
              GROUP BY order_item_id
            ) delivered ON delivered.order_item_id = oi.id`
         : ''}
       WHERE oi.finished_good_id = ?
         AND o.status IN ('PENDING', 'CONFIRMED', 'PACKED')`,
      [finishedGoodId]
    );
    const availableQuantity = Math.max(
      0,
      Number(product.quantity || 0) -
        Number(reservationResult.rows[0]?.reserved_quantity || 0)
    );
    const calculatePersonalRemaining = () =>
      targets.reduce(
        (sum, target) =>
          sum +
          Math.max(
            0,
            target.allocation_quantity -
              Number(orderedByUser.get(target.user_id) || 0)
          ),
        0
      );
    let personalRemaining = calculatePersonalRemaining();
    let shortageAdjustment = null;
    const restoredPublicQuantity =
      allocationScope === 'CONTROLLED'
        ? Math.max(0, Math.floor(Number(snapshot.public_quantity || 0)))
        : 0;
    const publicRemaining = Math.max(
      0,
      restoredPublicQuantity - publicUsedQuantity
    );

    // Older installations reset allocation_started_at whenever an allocation
    // was edited. If that happened, genuine orders from the same allocation
    // can fall just before the saved snapshot and appear unused. Reconcile only
    // against real, non-cancelled regular orders from the restored dealers,
    // newest first, until the physical-stock difference is accounted for.
    if (
      allocationScope !== 'CONTROLLED' &&
      personalRemaining + publicRemaining > availableQuantity
    ) {
      const latestTargetStart = targets.reduce(
        (latest, target) =>
          Math.max(latest, new Date(target.allocation_started_at).getTime()),
        0
      );
      const previousOrderResult = await client.query(
        `SELECT o.created_by AS user_id, o.created_at,
                SUM(oi.qty_ordered) AS qty_ordered
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.finished_good_id = ?
           AND o.status <> 'CANCELLED'
           AND o.created_at < ?
           AND o.created_by IN (${targets.map(() => '?').join(',')})
           ${
             supportsOfferSnapshots
               ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0'
               : ''
           }
         GROUP BY o.id, o.created_by, o.created_at
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 500`,
        [
          finishedGoodId,
          new Date(latestTargetStart),
          ...targets.map((target) => target.user_id),
        ]
      );

      for (const order of previousOrderResult.rows) {
        if (personalRemaining + publicRemaining <= availableQuantity) break;
        const userId = Number(order.user_id);
        const target = targets.find((row) => row.user_id === userId);
        if (!target) continue;
        if (
          new Date(order.created_at).getTime() >=
          new Date(target.allocation_started_at).getTime()
        ) {
          continue;
        }
        const usedBefore = Number(orderedByUser.get(userId) || 0);
        const usableBefore = Math.max(
          0,
          target.allocation_quantity - usedBefore
        );
        if (usableBefore <= 0) continue;
        orderedByUser.set(
          userId,
          usedBefore + Number(order.qty_ordered || 0)
        );
        target.allocation_started_at = order.created_at;
        personalRemaining = calculatePersonalRemaining();
      }
    }

    if (
      requestedShortageUserId &&
      personalRemaining + publicRemaining > availableQuantity
    ) {
      if (allocationScope === 'CONTROLLED') {
        const error = new Error(
          'Available-balance restoration is not supported for controlled public allocations.'
        );
        error.statusCode = 409;
        throw error;
      }
      const shortageQuantity =
        personalRemaining + publicRemaining - availableQuantity;
      const shortageTarget = targets.find(
        (target) => target.user_id === requestedShortageUserId
      );
      if (!shortageTarget) {
        const error = new Error(
          'The selected dealer is not part of this saved allocation version.'
        );
        error.statusCode = 409;
        throw error;
      }
      const dealerOrderedQuantity = Number(
        orderedByUser.get(shortageTarget.user_id) || 0
      );
      const dealerRemainingQuantity = Math.max(
        0,
        shortageTarget.allocation_quantity - dealerOrderedQuantity
      );
      if (dealerRemainingQuantity < shortageQuantity) {
        const dealer = restoredUserById.get(shortageTarget.user_id);
        const error = new Error(
          `${dealer?.name || dealer?.email || 'The selected dealer'} has only ${dealerRemainingQuantity} unconsumed allocated pairs, so the ${shortageQuantity}-pair shortage cannot be removed from that dealer.`
        );
        error.statusCode = 409;
        throw error;
      }
      const beforeQuantity = shortageTarget.allocation_quantity;
      shortageTarget.allocation_quantity -= shortageQuantity;
      const adjustedAssignedQuantity = targets.reduce(
        (sum, target) => sum + target.allocation_quantity,
        0
      );
      targets.forEach((target) => {
        target.allocation_percentage = adjustedAssignedQuantity
          ? (target.allocation_quantity / adjustedAssignedQuantity) *
            restoredPercentageTotal
          : 0;
      });
      personalRemaining = calculatePersonalRemaining();
      const dealer = restoredUserById.get(shortageTarget.user_id);
      shortageAdjustment = {
        user_id: shortageTarget.user_id,
        dealer_name: dealer?.name || null,
        dealer_email: dealer?.email || null,
        shortage_quantity: shortageQuantity,
        allocation_before_quantity: beforeQuantity,
        allocation_after_quantity: shortageTarget.allocation_quantity,
      };
    }

    if (personalRemaining + publicRemaining > availableQuantity) {
      const reservationBreakdownResult = await client.query(
        `SELECT o.id AS order_id, o.status, o.created_at,
                u.id AS user_id, u.name AS dealer_name, u.email AS dealer_email,
                SUM(oi.qty_ordered) AS ordered_quantity,
                ${supportsOfferSnapshots
                  ? 'MAX(COALESCE(oi.ordered_from_offer, 0))'
                  : '0'} AS is_offer,
                SUM(${supportsWarehouseDelivery
                  ? 'COALESCE(delivered.delivered_quantity, 0)'
                  : '0'}) AS delivered_quantity,
                SUM(${supportsWarehouseDelivery
                  ? 'GREATEST(0, oi.qty_ordered - COALESCE(delivered.delivered_quantity, 0))'
                  : 'oi.qty_ordered'}) AS reserved_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN users u ON u.id = o.created_by
         ${supportsWarehouseDelivery
           ? `LEFT JOIN (
                SELECT order_item_id, SUM(quantity) AS delivered_quantity
                FROM order_item_warehouse_allocations
                WHERE allocation_status = 'DEDUCTED'
                GROUP BY order_item_id
              ) delivered ON delivered.order_item_id = oi.id`
           : ''}
         WHERE oi.finished_good_id = ?
           AND o.status IN ('PENDING', 'CONFIRMED', 'PACKED')
         GROUP BY o.id, o.status, o.created_at, u.id, u.name, u.email
         HAVING reserved_quantity > 0
         ORDER BY o.created_at DESC, o.id DESC`,
        [finishedGoodId]
      );
      const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
      const reservationBreakdown = reservationBreakdownResult.rows.map(
        (row) => ({
          order_id: Number(row.order_id),
          status: row.status,
          created_at: row.created_at,
          user_id: Number(row.user_id || 0) || null,
          dealer_name: row.dealer_name || row.dealer_email || 'Unknown dealer',
          dealer_email: row.dealer_email || null,
          is_offer: Number(row.is_offer || 0) === 1,
          eligible_for_reconciliation: targets.some(
            (target) => Number(target.user_id) === Number(row.user_id)
          ),
          ordered_quantity: Number(row.ordered_quantity || 0),
          delivered_quantity: Number(row.delivered_quantity || 0),
          reserved_quantity: Number(row.reserved_quantity || 0),
          reserved_cartons:
            pairsPerCarton > 0
              ? Number(row.reserved_quantity || 0) / pairsPerCarton
              : null,
        })
      );
      const candidateResult = await client.query(
        `SELECT o.id AS order_id, o.status, o.created_at,
                u.id AS user_id, u.name AS dealer_name, u.email AS dealer_email,
                SUM(oi.qty_ordered) AS ordered_quantity,
                ${supportsOfferSnapshots
                  ? 'MAX(COALESCE(oi.ordered_from_offer, 0))'
                  : '0'} AS is_offer,
                SUM(${supportsWarehouseDelivery
                  ? 'COALESCE(delivered.delivered_quantity, 0)'
                  : '0'}) AS delivered_quantity,
                SUM(CASE WHEN o.status IN ('PENDING', 'CONFIRMED', 'PACKED')
                  THEN ${supportsWarehouseDelivery
                    ? 'GREATEST(0, oi.qty_ordered - COALESCE(delivered.delivered_quantity, 0))'
                    : 'oi.qty_ordered'} ELSE 0 END) AS reserved_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN users u ON u.id = o.created_by
         ${supportsWarehouseDelivery
           ? `LEFT JOIN (
                SELECT order_item_id, SUM(quantity) AS delivered_quantity
                FROM order_item_warehouse_allocations
                WHERE allocation_status = 'DEDUCTED'
                GROUP BY order_item_id
              ) delivered ON delivered.order_item_id = oi.id`
           : ''}
         WHERE oi.finished_good_id = ?
           AND o.status <> 'CANCELLED'
           AND o.created_by IN (${targets.map(() => '?').join(',')})
         GROUP BY o.id, o.status, o.created_at, u.id, u.name, u.email
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 200`,
        [finishedGoodId, ...targets.map((target) => target.user_id)]
      );
      const targetByUser = new Map(
        targets.map((target) => [Number(target.user_id), target])
      );
      const reconciliationCandidates = candidateResult.rows
        .filter((row) => {
          const target = targetByUser.get(Number(row.user_id));
          if (!target) return false;
          return (
            Number(row.is_offer || 0) === 1 ||
            new Date(row.created_at).getTime() <
              new Date(target.allocation_started_at).getTime()
          );
        })
        .map((row) => ({
          order_id: Number(row.order_id),
          status: row.status,
          created_at: row.created_at,
          user_id: Number(row.user_id),
          dealer_name: row.dealer_name || row.dealer_email || 'Unknown dealer',
          dealer_email: row.dealer_email || null,
          is_offer: Number(row.is_offer || 0) === 1,
          eligible_for_reconciliation: true,
          ordered_quantity: Number(row.ordered_quantity || 0),
          delivered_quantity: Number(row.delivered_quantity || 0),
          reserved_quantity: Number(row.reserved_quantity || 0),
          ordered_cartons:
            pairsPerCarton > 0
              ? Number(row.ordered_quantity || 0) / pairsPerCarton
              : null,
          delivered_cartons:
            pairsPerCarton > 0
              ? Number(row.delivered_quantity || 0) / pairsPerCarton
              : null,
          reserved_cartons:
            pairsPerCarton > 0
              ? Number(row.reserved_quantity || 0) / pairsPerCarton
              : null,
        }));
      const reservationSummary = reservationBreakdown.length
        ? ` Active reservations: ${reservationBreakdown
            .slice(0, 6)
            .map(
              (row) =>
                `Order #${row.order_id} — ${row.dealer_name} — ${
                  row.reserved_cartons === null
                    ? `${row.reserved_quantity} pairs`
                    : `${row.reserved_cartons} CTN (${row.reserved_quantity} pairs)`
                }`
            )
            .join('; ')}${reservationBreakdown.length > 6 ? '; and more' : ''}.`
        : ' No active order reservation currently explains the difference.';
      const error = new Error(
        `Cannot safely restore this allocation. It needs ${personalRemaining + publicRemaining} unreserved pairs, but only ${availableQuantity} are available.${reservationSummary}`
      );
      error.statusCode = 409;
      error.details = {
        finished_good_id: finishedGoodId,
        pairs_per_carton: pairsPerCarton,
        required_quantity: personalRemaining + publicRemaining,
        available_quantity: availableQuantity,
        shortage_quantity:
          personalRemaining + publicRemaining - availableQuantity,
        restored_targets: targets.map((target) => ({
          user_id: target.user_id,
          dealer_name:
            restoredUserById.get(target.user_id)?.name ||
            restoredUserById.get(target.user_id)?.email ||
            `User #${target.user_id}`,
          dealer_email:
            restoredUserById.get(target.user_id)?.email || null,
          allocation_percentage: target.allocation_percentage,
          allocation_quantity: target.allocation_quantity,
          ordered_quantity: Number(orderedByUser.get(target.user_id) || 0),
          remaining_quantity: Math.max(
            0,
            target.allocation_quantity -
              Number(orderedByUser.get(target.user_id) || 0)
          ),
        })),
        reservation_breakdown: reservationBreakdown,
        reconciliation_candidates: reconciliationCandidates,
      };
      throw error;
    }

    for (const target of targets) {
      const updated = await client.query(
        `UPDATE user_product_permissions
         SET can_view = 1,
             allocation_percentage = ?, allocation_quantity = ?,
             allocation_started_at = ?${
               supportsAllocationScope ? ', allocation_scope = ?' : ''
             }
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          target.allocation_percentage,
          target.allocation_quantity,
          target.allocation_started_at,
          ...(supportsAllocationScope ? [allocationScope] : []),
          target.user_id,
          finishedGoodId,
        ]
      );
      if (!updated.affectedRows) {
        const columns = [
          'user_id',
          'finished_good_id',
          'can_view',
          'allocation_percentage',
          'allocation_quantity',
          'allocation_started_at',
          ...(supportsAllocationScope ? ['allocation_scope'] : []),
        ];
        const values = [
          target.user_id,
          finishedGoodId,
          1,
          target.allocation_percentage,
          target.allocation_quantity,
          target.allocation_started_at,
          ...(supportsAllocationScope ? [allocationScope] : []),
        ];
        const permissionInsert = await appendFiscalInsertFields(
          'user_product_permissions',
          columns,
          values
        );
        await client.query(
          `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
           VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
          permissionInsert.values
        );
      }
    }

    if (allocationScope === 'CONTROLLED' && (await hasTable('product_controlled_release_pools'))) {
      await client.query(
        `INSERT INTO product_controlled_release_pools
           (finished_good_id, public_quantity)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE public_quantity = VALUES(public_quantity)`,
        [finishedGoodId, restoredPublicQuantity]
      );
    }
    await client.query(
      `UPDATE finished_goods
       SET allocation_publication_status = 'DRAFT', allocation_publish_at = NULL
       WHERE id = ?`,
      [finishedGoodId]
    );
    await client.query('COMMIT');
    committed = true;
    clearCache();

    await auditLog({
      userId: req.user.id,
      action: 'RESTORE_PRODUCT_PERCENTAGE_ALLOCATION',
      tableName: 'user_product_permissions',
      recordId: finishedGoodId,
      detail: `Restored the previous allocation for ${product.article_code || product.name} as draft`,
      metadata: {
        snapshot_version: 1,
        restored_from_audit_id: Number(snapshotRow.id),
        product_name: product.name,
        article_code: product.article_code,
        sole_code: product.sole_code,
        color: product.color,
        total_quantity: Number(snapshot.total_quantity || product.quantity || 0),
        pairs_per_carton: Number(product.inner_boxes_per_outer_box || 0),
        total_cartons: Number(snapshot.total_cartons || 0),
        assigned_quantity: targets.reduce(
          (sum, target) => sum + target.allocation_quantity,
          0
        ),
        assigned_cartons:
          Number(product.inner_boxes_per_outer_box || 0) > 0
            ? targets.reduce(
                (sum, target) => sum + target.allocation_quantity,
                0
              ) / Number(product.inner_boxes_per_outer_box)
            : 0,
        unassigned_quantity: Math.max(
          0,
          Number(snapshot.total_quantity || product.quantity || 0) -
            targets.reduce(
              (sum, target) => sum + target.allocation_quantity,
              0
            )
        ),
        percentage_total: targets.reduce(
          (sum, target) => sum + target.allocation_percentage,
          0
        ),
        allocation_scope: allocationScope,
        publication_status: 'DRAFT',
        public_quantity: restoredPublicQuantity,
        reconciled_orders: reconciledOrders,
        shortage_adjustment: shortageAdjustment,
        targets,
      },
    });

    return res.json({
      success: true,
      message: `Previous allocation restored as draft. ${personalRemaining + publicRemaining} pairs remain available to the restored dealers.${reconciledOrders.length ? ` ${reconciledOrders.length} legacy reservation${reconciledOrders.length === 1 ? ' was' : 's were'} reconciled.` : ''}${shortageAdjustment ? ` The ${shortageAdjustment.shortage_quantity}-pair stock shortage was removed from ${shortageAdjustment.dealer_name || shortageAdjustment.dealer_email || `user #${shortageAdjustment.user_id}`}'s restored balance.` : ''}`,
      data: {
        finished_good_id: finishedGoodId,
        restored_from_audit_id: Number(snapshotRow.id),
        publication_status: 'DRAFT',
        targets,
        remaining_quantity: personalRemaining + publicRemaining,
        shortage_adjustment: shortageAdjustment,
      },
    });
  } catch (err) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    next(err);
  } finally {
    client.release();
  }
};

const transferPercentageAllocationBalance = async (req, res, next) => {
  const client = await getClient();
  let committed = false;

  const fail = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };

  try {
    const finishedGoodId = Number(req.params.finished_good_id);
    const sourceUserId = Number(req.body?.source_user_id);
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    const transfers = Array.isArray(req.body?.transfers)
      ? req.body.transfers.map((transfer) => ({
          user_id: Number(transfer.user_id),
          quantity: Number(transfer.quantity),
        }))
      : [];

    if (!Number.isInteger(finishedGoodId) || finishedGoodId <= 0) {
      fail(400, 'Select a valid product.');
    }
    if (!Number.isInteger(sourceUserId) || sourceUserId <= 0) {
      fail(400, 'Select a valid source dealer.');
    }
    if (!transfers.length) {
      fail(400, 'Allocate the transferred quantity to at least one dealer.');
    }
    const destinationIds = transfers.map((transfer) => transfer.user_id);
    if (
      new Set(destinationIds).size !== destinationIds.length ||
      transfers.some(
        (transfer) =>
          !Number.isInteger(transfer.user_id) ||
          transfer.user_id <= 0 ||
          transfer.user_id === sourceUserId ||
          !Number.isInteger(transfer.quantity) ||
          transfer.quantity <= 0
      )
    ) {
      fail(400, 'Each destination dealer needs one valid whole-pair quantity.');
    }

    const supportsAllocations = await hasColumn(
      'user_product_permissions',
      'allocation_quantity'
    );
    const supportsAllocationScope = supportsAllocations
      ? await hasColumn('user_product_permissions', 'allocation_scope')
      : false;
    if (!supportsAllocations || !supportsAllocationScope) {
      fail(
        409,
        'Allocation transfers require sql/add-private-product-allocations.sql.'
      );
    }
    const supportsControlledPool = await hasTable(
      'product_controlled_release_pools'
    );
    const supportsControlledUsage =
      (await hasColumn('order_items', 'controlled_personal_quantity')) &&
      (await hasColumn('order_items', 'controlled_public_quantity'));
    const supportsOfferSnapshots = await hasColumn(
      'order_items',
      'ordered_from_offer'
    );

    await client.query('START TRANSACTION');
    const productResult = await client.query(
      `SELECT id, name, article_code, sole_code, color, quantity,
              inner_boxes_per_outer_box
       FROM finished_goods
       WHERE id = ? AND is_deleted = 0
       FOR UPDATE`,
      [finishedGoodId]
    );
    const product = productResult.rows[0];
    if (!product) fail(404, 'Product not found.');

    const allocationResult = await client.query(
      `SELECT upp.id, upp.user_id, upp.can_view,
              upp.allocation_percentage, upp.allocation_quantity,
              upp.allocation_started_at,
              COALESCE(upp.allocation_scope, 'EXCLUSIVE') AS allocation_scope,
              u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM user_product_permissions upp
       JOIN users u ON u.id = upp.user_id
       WHERE upp.finished_good_id = ?
       FOR UPDATE`,
      [finishedGoodId]
    );
    const allocationByUser = new Map(
      allocationResult.rows.map((row) => [Number(row.user_id), row])
    );
    const source = allocationByUser.get(sourceUserId);
    if (!source || source.allocation_quantity === null) {
      fail(409, 'The source dealer is not assigned to this product.');
    }

    const allocationScope = String(source.allocation_scope || 'EXCLUSIVE')
      .trim()
      .toUpperCase();
    const mixedScope = allocationResult.rows.some(
      (row) =>
        row.allocation_quantity !== null &&
        String(row.allocation_scope || 'EXCLUSIVE').toUpperCase() !==
          allocationScope
    );
    if (mixedScope) {
      fail(409, 'This product has mixed allocation modes. Save one mode before transferring.');
    }

    let sourceUsedQuantity = 0;
    if (allocationScope === 'CONTROLLED') {
      if (!supportsControlledPool || !supportsControlledUsage) {
        fail(
          409,
          'Controlled allocation usage requires sql/add-private-product-allocations.sql.'
        );
      }
      const usageResult = await client.query(
        `SELECT COALESCE(SUM(oi.controlled_personal_quantity), 0) AS used_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN product_controlled_release_pools pool
           ON pool.finished_good_id = oi.finished_good_id
          AND o.created_at >= pool.created_at
         WHERE oi.finished_good_id = ?
           AND o.created_by = ?
           AND o.status <> 'CANCELLED'`,
        [finishedGoodId, sourceUserId]
      );
      sourceUsedQuantity = Number(usageResult.rows[0]?.used_quantity || 0);
    } else {
      const usageResult = await client.query(
        `SELECT COALESCE(SUM(oi.qty_ordered), 0) AS used_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.finished_good_id = ?
           AND o.created_by = ?
           AND o.status <> 'CANCELLED'
           AND o.created_at >= ?
           ${supportsOfferSnapshots ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}`,
        [
          finishedGoodId,
          sourceUserId,
          source.allocation_started_at || new Date(0),
        ]
      );
      sourceUsedQuantity = Number(usageResult.rows[0]?.used_quantity || 0);
    }

    const sourceBeforeQuantity = Number(source.allocation_quantity || 0);
    const sourceAvailableQuantity = Math.max(
      0,
      sourceBeforeQuantity - sourceUsedQuantity
    );
    const transferQuantity = transfers.reduce(
      (sum, transfer) => sum + transfer.quantity,
      0
    );
    if (transferQuantity > sourceAvailableQuantity) {
      fail(
        409,
        `Only ${sourceAvailableQuantity} unused pairs can be transferred from ${source.user_name || source.user_email}.`
      );
    }

    const destinationResult = await client.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id IN (${destinationIds.map(() => '?').join(',')})`,
      destinationIds
    );
    if (
      destinationResult.rows.length !== destinationIds.length ||
      destinationResult.rows.some(
        (user) => String(user.role || '').toUpperCase() !== 'USER'
      )
    ) {
      fail(400, 'Allocation balance can only be transferred to valid dealer accounts.');
    }
    const destinationUserById = new Map(
      destinationResult.rows.map((user) => [Number(user.id), user])
    );

    const activeRows = allocationResult.rows.filter(
      (row) => row.allocation_quantity !== null
    );
    const totalAssignedBefore = activeRows.reduce(
      (sum, row) => sum + Number(row.allocation_quantity || 0),
      0
    );
    const percentageTotalBefore = activeRows.reduce(
      (sum, row) => sum + Number(row.allocation_percentage || 0),
      0
    );
    const nextQuantities = new Map(
      activeRows.map((row) => [
        Number(row.user_id),
        Number(row.allocation_quantity || 0),
      ])
    );
    nextQuantities.set(
      sourceUserId,
      sourceBeforeQuantity - transferQuantity
    );
    transfers.forEach((transfer) => {
      nextQuantities.set(
        transfer.user_id,
        Number(nextQuantities.get(transfer.user_id) || 0) + transfer.quantity
      );
    });

    const percentageBase = percentageTotalBefore > 0
      ? percentageTotalBefore
      : 100;
    const percentageFor = (quantity) =>
      totalAssignedBefore > 0
        ? (Number(quantity || 0) / totalAssignedBefore) * percentageBase
        : 0;

    for (const [userId, quantity] of nextQuantities.entries()) {
      const existing = allocationByUser.get(Number(userId));
      if (quantity <= 0) {
        if (existing) {
          await client.query(
            `UPDATE user_product_permissions
             SET allocation_percentage = NULL,
                 allocation_quantity = NULL,
                 allocation_started_at = NULL,
                 allocation_scope = NULL
             WHERE id = ?`,
            [existing.id]
          );
        }
        continue;
      }

      const nextPercentage = percentageFor(quantity);
      if (existing) {
        await client.query(
          `UPDATE user_product_permissions
           SET can_view = 1,
               allocation_percentage = ?,
               allocation_quantity = ?,
               allocation_started_at = COALESCE(allocation_started_at, NOW()),
               allocation_scope = ?
           WHERE id = ?`,
          [nextPercentage, quantity, allocationScope, existing.id]
        );
      } else {
        const permissionInsert = await appendFiscalInsertFields(
          'user_product_permissions',
          [
            'user_id',
            'finished_good_id',
            'can_view',
            'allocation_percentage',
            'allocation_quantity',
            'allocation_started_at',
            'allocation_scope',
          ],
          [
            userId,
            finishedGoodId,
            1,
            nextPercentage,
            quantity,
            new Date(),
            allocationScope,
          ]
        );
        await client.query(
          `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
           VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
          permissionInsert.values
        );
      }
    }

    await client.query('COMMIT');
    committed = true;
    clearCache();

    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const transferDetails = transfers.map((transfer) => {
      const user = destinationUserById.get(transfer.user_id);
      const beforeQuantity = Number(
        allocationByUser.get(transfer.user_id)?.allocation_quantity || 0
      );
      return {
        user_id: transfer.user_id,
        user_name: user?.name || null,
        user_email: user?.email || null,
        transferred_quantity: transfer.quantity,
        transferred_cartons:
          pairsPerCarton > 0 ? transfer.quantity / pairsPerCarton : 0,
        before_quantity: beforeQuantity,
        after_quantity: beforeQuantity + transfer.quantity,
      };
    });
    try {
      await auditLog({
        userId: req.user.id,
        action: 'TRANSFER_PRODUCT_ALLOCATION_BALANCE',
        tableName: 'user_product_permissions',
        recordId: finishedGoodId,
        detail: `Transferred ${transferQuantity} unused pairs of ${product.article_code || product.name} from ${source.user_name || source.user_email} to ${transfers.length} dealer(s)`,
        metadata: {
          snapshot_version: 1,
          product_name: product.name,
          article_code: product.article_code,
          sole_code: product.sole_code,
          color: product.color,
          allocation_scope: allocationScope,
          pairs_per_carton: pairsPerCarton,
          source_user_id: sourceUserId,
          source_user_name: source.user_name,
          source_user_email: source.user_email,
          source_before_quantity: sourceBeforeQuantity,
          source_used_quantity: sourceUsedQuantity,
          source_available_quantity: sourceAvailableQuantity,
          source_after_quantity: sourceBeforeQuantity - transferQuantity,
          transferred_quantity: transferQuantity,
          transferred_cartons:
            pairsPerCarton > 0 ? transferQuantity / pairsPerCarton : 0,
          destinations: transferDetails,
          reason: reason || null,
        },
      });
    } catch (auditError) {
      console.error('Product allocation transfer audit failed:', auditError);
    }

    return res.json({
      success: true,
      message: `${transferQuantity} unused pairs were transferred successfully.`,
      data: {
        finished_good_id: finishedGoodId,
        source_user_id: sourceUserId,
        source_before_quantity: sourceBeforeQuantity,
        source_used_quantity: sourceUsedQuantity,
        source_after_quantity: sourceBeforeQuantity - transferQuantity,
        transferred_quantity: transferQuantity,
        destinations: transferDetails,
      },
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

module.exports = {
  grantAccess,
  revokeAccess,
  getUserProducts,
  getAllPermissions,
  getPercentageAllocations,
  getPercentageAllocationHistory,
  savePercentageAllocations,
  updatePercentageAllocationPublication,
  restorePercentageAllocations,
  transferPercentageAllocationBalance,
};
