const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };