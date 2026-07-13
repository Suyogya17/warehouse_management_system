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

module.exports = { grantAccess, revokeAccess, getUserProducts, getAllPermissions };
