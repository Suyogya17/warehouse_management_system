const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');

const normalizeLocale = (countryCode, currencyCode) => ({
  countryCode: String(countryCode || 'NP').trim().toUpperCase().slice(0, 2),
  currencyCode: String(currencyCode || 'NPR').trim().toUpperCase().slice(0, 3),
});

// ─── REGISTER ────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'USER', country_code, currency_code } = req.body;
    const locale = normalizeLocale(country_code, currency_code);

    const exists = await query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (exists.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const userInsert = await appendFiscalInsertFields(
      'users',
      ['name', 'email', 'password', 'role', 'country_code', 'currency_code'],
      [name, email, hashed, role.toUpperCase(), locale.countryCode, locale.currencyCode]
    );
    const result = await query(
      `INSERT INTO users (${userInsert.columns.join(', ')})
       VALUES (${userInsert.columns.map(() => '?').join(', ')})`,
      userInsert.values
    );

    const userId = result.insertId;

    const user = {
      id: userId,
      name,
      email,
      role: role.toUpperCase(),
      country_code: locale.countryCode,
      currency_code: locale.currencyCode,
    };

    await auditLog({
      userId,
      action: 'CREATED',
      tableName: 'users',
      recordId: userId,
      detail: `User registered: ${email}`,
    });

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (!result.length) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const user = result[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        country_code: user.country_code,
        currency_code: user.currency_code,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        country_code: user.country_code,
        currency_code: user.currency_code,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PROFILE ────────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, country_code, currency_code, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!result.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({ success: true, data: result[0] });
  } catch (err) {
    next(err);
  }
};

// ─── LIST USERS ─────────────────────────────────────────────────────────────
const listUsers = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, country_code, currency_code, created_at FROM users ORDER BY created_at DESC'
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE USER ─────────────────────────────────────────────────────────────
const updateUser = async (req, res, next) => {
  try {
    const { name, email, password, role, country_code, currency_code } = req.body;
    const userId = req.params.id;

    const existing = await query(
      'SELECT id, email FROM users WHERE id = ?',
      [userId]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const hashed = password ? await bcrypt.hash(password, 10) : null;

    await query(
      `UPDATE users
       SET name = COALESCE(?, name),
           email = COALESCE(?, email),
           password = COALESCE(?, password),
           role = COALESCE(?, role),
           country_code = COALESCE(?, country_code),
           currency_code = COALESCE(?, currency_code)
       WHERE id = ?`,
      [
        name,
        email,
        hashed,
        role ? role.toUpperCase() : null,
        country_code ? normalizeLocale(country_code, currency_code).countryCode : null,
        currency_code ? normalizeLocale(country_code, currency_code).currencyCode : null,
        userId,
      ]
    );

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'users',
      recordId: userId,
      detail: `User updated`,
    });

    return res.json({
      success: true,
      message: 'User updated',
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE USER ─────────────────────────────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete yourself',
      });
    }

    const result = await query(
      'DELETE FROM users WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await auditLog({
      userId: req.user.id,
      action: 'DELETED',
      tableName: 'users',
      recordId: req.params.id,
      detail: `User deleted`,
    });

    return res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  getProfile,
  listUsers,
  updateUser,
  deleteUser,
};
