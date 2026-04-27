const router = require('express').Router();
const { register, login, getProfile, listUsers } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// POST /api/auth/register  (ADMIN only)
// router.post('/register', authenticate, authorize('ADMIN'), register);
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/profile
router.get('/profile', authenticate, getProfile);

// GET /api/auth/users  (ADMIN only)
router.get('/users', authenticate, authorize('ADMIN'), listUsers);

module.exports = router;