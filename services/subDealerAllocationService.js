const { getClient } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { hasColumn, hasTable } = require('../utils/schemaSupport');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const { clearCache } = require('../middleware/cacheMiddleware');

const splitParentDealerAllocations = async ({
  parentUserId,
  childUserId,
  parentSharePercentage,
  adminUserId,
}) => {
  const shareOfParent = Number(parentSharePercentage);
  if (!Number.isFinite(shareOfParent) || shareOfParent <= 0 || shareOfParent >= 100) {
    throw new Error('Shareholder share of the parent allocation must be greater than 0% and less than 100%.');
  }

  const [supportsAllocationScope, supportsControlledUsageColumn, supportsOfferSnapshots, supportsControlledPool] =
    await Promise.all([
      hasColumn('user_product_permissions', 'allocation_scope'),
      hasColumn('order_items', 'controlled_personal_quantity'),
      hasColumn('order_items', 'ordered_from_offer'),
      hasTable('product_controlled_release_pools'),
    ]);
  const supportsControlledUsage =
    supportsAllocationScope && supportsControlledUsageColumn && supportsControlledPool;
  const client = await getClient();
  let committed = false;

  try {
    await client.query('START TRANSACTION');
    const users = await client.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id IN (?, ?)
       FOR UPDATE`,
      [parentUserId, childUserId]
    );
    const parent = users.rows.find((user) => Number(user.id) === Number(parentUserId));
    const child = users.rows.find((user) => Number(user.id) === Number(childUserId));
    if (!parent || String(parent.role).toUpperCase() !== 'USER') {
      throw new Error('The selected parent dealer is not a valid USER account.');
    }
    if (!child || String(child.role).toUpperCase() !== 'USER') {
      throw new Error('The shareholder shop is not a valid USER account.');
    }

    const allocationRows = await client.query(
      `SELECT upp.finished_good_id,
              upp.allocation_percentage,
              upp.allocation_quantity,
              upp.allocation_started_at,
              ${
                supportsAllocationScope
                  ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE')"
                  : "'EXCLUSIVE'"
              } AS allocation_scope,
              fg.article_code,
              fg.name AS product_name,
              fg.inner_boxes_per_outer_box,
              COALESCE(SUM(${
                supportsControlledUsage
                  ? `CASE
                       WHEN COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED'
                         THEN oi.controlled_personal_quantity
                       ELSE oi.qty_ordered
                     END`
                  : 'oi.qty_ordered'
              }), 0) AS used_quantity
       FROM user_product_permissions upp
       JOIN finished_goods fg ON fg.id = upp.finished_good_id
       ${
         supportsControlledPool
           ? `LEFT JOIN product_controlled_release_pools pool
                ON pool.finished_good_id = upp.finished_good_id`
           : ''
       }
       LEFT JOIN orders o
         ON o.created_by = upp.user_id
        AND o.status <> 'CANCELLED'
        AND (
          (${
            supportsAllocationScope
              ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED'"
              : '0 = 1'
          } AND o.created_at >= ${
            supportsControlledPool
              ? 'COALESCE(pool.created_at, upp.allocation_started_at)'
              : 'upp.allocation_started_at'
          })
          OR
          (${
            supportsAllocationScope
              ? "COALESCE(upp.allocation_scope, 'EXCLUSIVE') <> 'CONTROLLED'"
              : '1 = 1'
          } AND o.created_at >= upp.allocation_started_at)
        )
       LEFT JOIN order_items oi
         ON oi.order_id = o.id
        AND oi.finished_good_id = upp.finished_good_id
        ${
          supportsOfferSnapshots
            ? supportsAllocationScope
              ? "AND (COALESCE(upp.allocation_scope, 'EXCLUSIVE') = 'CONTROLLED' OR COALESCE(oi.ordered_from_offer, 0) = 0)"
              : 'AND COALESCE(oi.ordered_from_offer, 0) = 0'
            : ''
        }
       WHERE upp.user_id = ?
         AND upp.allocation_percentage IS NOT NULL
         AND upp.allocation_quantity IS NOT NULL
       GROUP BY upp.finished_good_id, upp.allocation_percentage,
                upp.allocation_quantity, upp.allocation_started_at,
                ${supportsAllocationScope ? 'upp.allocation_scope,' : ''}
                fg.article_code, fg.name, fg.inner_boxes_per_outer_box`,
      [parentUserId]
    );

    const transferred = [];
    const skipped = [];
    for (const allocation of allocationRows.rows) {
      const sourcePercentage = Number(allocation.allocation_percentage || 0);
      const sourceQuantity = Number(allocation.allocation_quantity || 0);
      const usedQuantity = Number(allocation.used_quantity || 0);
      const pairsPerCarton = Number(allocation.inner_boxes_per_outer_box || 0);

      if (sourcePercentage <= 0 || sourceQuantity <= 0) {
        skipped.push({
          finished_good_id: Number(allocation.finished_good_id),
          product: allocation.article_code || allocation.product_name,
          reason: 'The parent dealer has no active allocation for this product',
        });
        continue;
      }

      const childProductPercentage = sourcePercentage * (shareOfParent / 100);
      const parentProductPercentageAfter = sourcePercentage - childProductPercentage;
      const proportionalQuantity = sourceQuantity * (shareOfParent / 100);
      const transferQuantity =
        pairsPerCarton > 0
          ? Math.floor(proportionalQuantity / pairsPerCarton) * pairsPerCarton
          : Math.floor(proportionalQuantity);
      if (transferQuantity <= 0) {
        skipped.push({
          finished_good_id: Number(allocation.finished_good_id),
          product: allocation.article_code || allocation.product_name,
          reason: `The ${shareOfParent}% share of the parent allocation is less than one complete carton`,
        });
        continue;
      }
      if (sourceQuantity - transferQuantity < usedQuantity) {
        skipped.push({
          finished_good_id: Number(allocation.finished_good_id),
          product: allocation.article_code || allocation.product_name,
          reason: 'The parent dealer has already ordered part of the quantity required for this transfer',
        });
        continue;
      }

      await client.query(
        `UPDATE user_product_permissions
         SET allocation_percentage = ?, allocation_quantity = ?
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          parentProductPercentageAfter,
          sourceQuantity - transferQuantity,
          parentUserId,
          allocation.finished_good_id,
        ]
      );
      const childUpdate = await client.query(
        `UPDATE user_product_permissions
         SET can_view = 1,
             allocation_percentage = ?,
             allocation_quantity = ?,
             allocation_started_at = NOW()
             ${supportsAllocationScope ? ', allocation_scope = ?' : ''}
         WHERE user_id = ? AND finished_good_id = ?`,
        [
          childProductPercentage,
          transferQuantity,
          ...(supportsAllocationScope ? [allocation.allocation_scope] : []),
          childUserId,
          allocation.finished_good_id,
        ]
      );
      if (!childUpdate.affectedRows) {
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
          childUserId,
          allocation.finished_good_id,
          1,
          childProductPercentage,
          transferQuantity,
          new Date(),
          ...(supportsAllocationScope ? [allocation.allocation_scope] : []),
        ];
        const insert = await appendFiscalInsertFields(
          'user_product_permissions',
          columns,
          values
        );
        await client.query(
          `INSERT INTO user_product_permissions (${insert.columns.join(', ')})
           VALUES (${insert.columns.map(() => '?').join(', ')})`,
          insert.values
        );
      }

      transferred.push({
        finished_good_id: Number(allocation.finished_good_id),
        product: allocation.article_code || allocation.product_name,
        share_of_parent_percentage: shareOfParent,
        transferred_product_percentage: childProductPercentage,
        transferred_quantity: transferQuantity,
        transferred_cartons:
          pairsPerCarton > 0 ? transferQuantity / pairsPerCarton : 0,
        parent_percentage_after: parentProductPercentageAfter,
      });
    }

    await client.query('COMMIT');
    committed = true;
    clearCache();

    try {
      await auditLog({
        userId: adminUserId,
        action: 'CREATE_SHAREHOLDER_SHOP_ALLOCATION',
        tableName: 'users',
        recordId: childUserId,
        detail: `Created shareholder allocation for ${child.name || child.email} under ${parent.name || parent.email}`,
        metadata: {
          parent_dealer_id: Number(parentUserId),
          parent_dealer_name: parent.name,
          shareholder_user_id: Number(childUserId),
          shareholder_name: child.name,
          share_of_parent_percentage: shareOfParent,
          transferred_product_count: transferred.length,
          skipped_product_count: skipped.length,
          transferred,
          skipped,
        },
      });
    } catch (auditError) {
      console.error('Failed to record shareholder allocation audit log:', auditError);
    }

    return {
      transferred_product_count: transferred.length,
      skipped_product_count: skipped.length,
      transferred,
      skipped,
    };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { splitParentDealerAllocations };
