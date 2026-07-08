const router = require('express').Router();
const ctrl = require('../controllers/permissionController');
const { authenticate, authorize, authorizeAdminOrPagePermission } = require('../middleware/authMiddleware');
const { PRODUCT_VISIBILITY_PAGE_KEY } = require('../utils/userPagePermissions');

router.use(authenticate);

// POST /api/permissions/grant    - Grant product access to a user (ADMIN only)
router.post('/grant', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_edit'), ctrl.grantAccess);

// POST /api/permissions/revoke   - Revoke access (ADMIN only)
router.post('/revoke', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_edit'), ctrl.revokeAccess);

// GET  /api/permissions/user/:user_id - Get all products accessible to a user
router.get('/user/:user_id', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_view'), ctrl.getUserProducts);

// GET  /api/permissions          - Get all permissions (ADMIN only)
router.get('/', authorizeAdminOrPagePermission(PRODUCT_VISIBILITY_PAGE_KEY, 'can_view'), ctrl.getAllPermissions);

module.exports = router;
