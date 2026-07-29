const router = require('express').Router();
const ctrl = require('../controllers/permissionController');
const { authenticate, authorize, authorizeAdminOrPagePermission } = require('../middleware/authMiddleware');
const { PRODUCT_VISIBILITY_PAGE_KEY } = require('../utils/userPagePermissions');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.use(authenticate);

router.get(
  '/percentage-allocations',
  authorize('ADMIN', 'CO_ADMIN'),
  ctrl.getPercentageAllocations
);
router.put(
  '/percentage-allocations/:finished_good_id',
  authorize('ADMIN', 'CO_ADMIN'),
  ctrl.savePercentageAllocations
);

// POST /api/permissions/grant    - Grant product access to a user (ADMIN only)
router.post('/grant', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_edit'), ctrl.grantAccess);

// POST /api/permissions/revoke   - Revoke access (ADMIN only)
router.post('/revoke', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_edit'), ctrl.revokeAccess);

// GET  /api/permissions/user/:user_id - Get all products accessible to a user
router.get('/user/:user_id', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_view'), ctrl.getUserProducts);

// GET  /api/permissions          - Get all permissions (ADMIN only)
router.get(
  '/',
  authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_view'),
  cacheResponse(15000),
  ctrl.getAllPermissions
);

module.exports = router;
