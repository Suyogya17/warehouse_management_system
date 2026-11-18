const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { clearCache } = require('../middleware/cacheMiddleware');
const {
  SETTINGS_TABLE,
  getDashboardRotationState,
  getRotationWindow,
  hasDashboardRotationSchema,
  loadDashboardRotationSettings,
  parseRotationTimes,
} = require('../services/dashboardRotationService');

const getActor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
};

const requireSchema = async (res) => {
  if (await hasDashboardRotationSchema()) return true;
  res.status(409).json({
    success: false,
    message: 'Dashboard rotation management is not enabled yet. Apply migration 0002_dashboard_product_rotation.sql.',
  });
  return false;
};

const getDashboardRotation = async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await getDashboardRotationState(),
    });
  } catch (error) {
    next(error);
  }
};

const updateDashboardRotation = async (req, res, next) => {
  try {
    if (!(await requireSchema(res))) return;

    const current = await loadDashboardRotationSettings();
    const rotationsPerDay = Number(req.body?.rotations_per_day);
    if (![2, 3].includes(rotationsPerDay)) {
      return res.status(400).json({
        success: false,
        message: 'Rotations per day must be 2 or 3.',
      });
    }

    const rotationTimes = parseRotationTimes(req.body?.rotation_times);
    if (rotationTimes.length !== rotationsPerDay) {
      return res.status(400).json({
        success: false,
        message: `Choose exactly ${rotationsPerDay} unique rotation times.`,
      });
    }

    const proposed = {
      ...current,
      enabled: asBoolean(req.body?.enabled, current.enabled),
      rotations_per_day: rotationsPerDay,
      rotation_times: rotationTimes,
      in_stock_only: asBoolean(req.body?.in_stock_only, current.in_stock_only),
      locked: asBoolean(req.body?.locked, current.locked),
    };
    let lockedRotationKey = null;
    if (proposed.locked) {
      lockedRotationKey = current.locked && current.locked_rotation_key
        ? current.locked_rotation_key
        : getRotationWindow(proposed, new Date(), { ignoreLock: true }).rotation_key;
    }

    await query(
      `UPDATE ${SETTINGS_TABLE}
       SET enabled = ?, rotations_per_day = ?, rotation_times = ?,
           in_stock_only = ?, locked = ?, locked_rotation_key = ?, updated_by = ?
       WHERE id = 1`,
      [
        proposed.enabled ? 1 : 0,
        proposed.rotations_per_day,
        JSON.stringify(proposed.rotation_times),
        proposed.in_stock_only ? 1 : 0,
        proposed.locked ? 1 : 0,
        lockedRotationKey,
        req.user?.id || null,
      ]
    );
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'product_display',
      entity_type: 'dashboard_product_rotation',
      entity_id: 1,
      entityName: 'Dashboard product rotation',
      description: 'Updated dashboard product rotation settings',
      metadata: {
        enabled: proposed.enabled,
        rotations_per_day: proposed.rotations_per_day,
        rotation_times: proposed.rotation_times,
        in_stock_only: proposed.in_stock_only,
        locked: proposed.locked,
      },
    });

    return res.json({
      success: true,
      message: 'Dashboard rotation settings saved.',
      data: await getDashboardRotationState(),
    });
  } catch (error) {
    next(error);
  }
};

const rotateDashboardProductsNow = async (req, res, next) => {
  try {
    if (!(await requireSchema(res))) return;

    await query(
      `UPDATE ${SETTINGS_TABLE}
       SET manual_revision = manual_revision + 1, updated_by = ?
       WHERE id = 1`,
      [req.user?.id || null]
    );

    const updated = await loadDashboardRotationSettings();
    if (updated.locked) {
      const lockedRotationKey = getRotationWindow(
        { ...updated, locked: false, locked_rotation_key: null },
        new Date(),
        { ignoreLock: true }
      ).rotation_key;
      await query(
        `UPDATE ${SETTINGS_TABLE}
         SET locked_rotation_key = ?
         WHERE id = 1`,
        [lockedRotationKey]
      );
    }
    clearCache();

    await auditLog({
      ...getActor(req),
      actionType: 'UPDATE',
      module: 'product_display',
      entity_type: 'dashboard_product_rotation',
      entity_id: 1,
      entityName: 'Dashboard product rotation',
      description: 'Rotated dashboard product cards immediately',
      metadata: { manual_rotation: true },
    });

    return res.json({
      success: true,
      message: 'A new shared product-card order is active for every dashboard.',
      data: await getDashboardRotationState(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardRotation,
  rotateDashboardProductsNow,
  updateDashboardRotation,
};
