const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { hasUserPagePermission } = require('../utils/userPagePermissions');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!result.length) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    req.user = result[0];
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (!req.user || !roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }
    next();
  };
};

const authorizeAdminOrPagePermission = (pageKey, action = 'can_edit') => {
  return async (req, res, next) => {
    try {
      const userRole = (req.user?.role || '').toUpperCase();

      if (userRole === 'ADMIN') return next();

      if (userRole !== 'CO_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }

      const allowed = await hasUserPagePermission(req.user.id, pageKey, action);

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to manage product show/hide.',
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports = { authenticate, authorize, authorizeAdminOrPagePermission };
