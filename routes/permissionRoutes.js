const router = require('express').Router();
const ctrl = require('../controllers/permissionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

// POST /api/permissions/grant    - Grant product access to a user (ADMIN only)
router.post('/grant', authorize('ADMIN', 'CO_ADMIN'), ctrl.grantAccess);

// POST /api/permissions/revoke   - Revoke access (ADMIN only)
router.post('/revoke', authorize('ADMIN', 'CO_ADMIN'), ctrl.revokeAccess);

// GET  /api/permissions/user/:user_id - Get all products accessible to a user
router.get('/user/:user_id', authorize ('ADMIN', 'CO_ADMIN'), ctrl.getUserProducts);

// GET  /api/permissions          - Get all permissions (ADMIN only)
router.get('/', authorize('ADMIN', 'CO_ADMIN'), ctrl.getAllPermissions);

module.exports = router;