// src/controllers/permissionController.js
const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');
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

    const updated = await query(
      `UPDATE user_product_permissions
       SET can_view = 0${
         supportsAllocations
           ? ', allocation_percentage = NULL, allocation_quantity = NULL, allocation_started_at = NULL'
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

    const rows = await query(
      `SELECT upp.finished_good_id, upp.user_id,
              upp.allocation_percentage, upp.allocation_quantity,
              upp.allocation_started_at,
              u.name AS user_name, u.email AS user_email,
              COALESCE(SUM(oi.qty_ordered), 0) AS ordered_quantity
       FROM user_product_permissions upp
       JOIN users u ON u.id = upp.user_id
       LEFT JOIN orders o
         ON o.created_by = upp.user_id
        AND o.status <> 'CANCELLED'
        AND o.created_at >= upp.allocation_started_at
       LEFT JOIN order_items oi
         ON oi.order_id = o.id
        AND oi.finished_good_id = upp.finished_good_id
        ${supportsOfferSnapshots ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
       WHERE upp.allocation_percentage IS NOT NULL
         AND upp.allocation_quantity IS NOT NULL
       GROUP BY upp.finished_good_id, upp.user_id,
                upp.allocation_percentage, upp.allocation_quantity,
                upp.allocation_started_at, u.name, u.email
       ORDER BY upp.finished_good_id, upp.allocation_percentage DESC, u.name`
    );

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
        };
      }),
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
      `SELECT id, name, article_code, color, quantity
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

    if (normalizedTargets.length) {
      const users = await query(
        `SELECT id
         FROM users
         WHERE role = 'USER'
           AND id IN (${normalizedTargets.map(() => '?').join(',')})`,
        normalizedTargets.map((target) => target.user_id)
      );
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
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          target.allocation_percentage,
          target.allocation_quantity,
          target.user_id,
          finishedGoodId,
        ]
      );
      if (!updated.affectedRows) {
        const permissionInsert = await appendFiscalInsertFields(
          'user_product_permissions',
          [
            'user_id',
            'finished_good_id',
            'can_view',
            'allocation_percentage',
            'allocation_quantity',
            'allocation_started_at',
          ],
          [
            target.user_id,
            finishedGoodId,
            1,
            target.allocation_percentage,
            target.allocation_quantity,
            new Date(),
          ]
        );
        await query(
          `INSERT INTO user_product_permissions (${permissionInsert.columns.join(', ')})
           VALUES (${permissionInsert.columns.map(() => '?').join(', ')})`,
          permissionInsert.values
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
    });

    return res.json({
      success: true,
      data: {
        finished_good_id: finishedGoodId,
        percentage_total: percentageTotal,
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
  savePercentageAllocations,
};
