const router = require('express').Router();
const { register, login, getProfile, listUsers, updateUser, deleteUser } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { query } = require('../config/db');

const allowFirstUserOrAdmin = async (req, res, next) => {
  try {
    const result = await query('SELECT COUNT(*) AS count FROM users');
    if (Number(result.rows[0].count) === 0) {
      req.body.role = 'ADMIN';
      return register(req, res, next);
    }

    return authenticate(req, res, (err) => {
      if (err) return next(err);
      return authorize('ADMIN')(req, res, () => register(req, res, next));
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/register  (ADMIN only)
// If no users exist yet, this bootstraps the first ADMIN account.
router.post('/register', allowFirstUserOrAdmin);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/profile
router.get('/profile', authenticate, getProfile);

// GET /api/auth/users  (ADMIN only)
router.get('/users', authenticate, authorize('ADMIN'), listUsers);

// PUT /api/auth/users/:id  (ADMIN only)
router.put('/users/:id', authenticate, authorize('ADMIN'), updateUser);

// DELETE /api/auth/users/:id  (ADMIN only)
router.delete('/users/:id', authenticate, authorize('ADMIN'), deleteUser);

module.exports = router;
