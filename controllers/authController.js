const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const auditLog = require('../utils/auditLog');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const { hasColumn } = require('../utils/schemaSupport');
const { PRODUCT_VISIBILITY_PAGE_KEY, getUserPagePermissions } = require('../utils/userPagePermissions');

const DEFAULT_EXCHANGE_RATES = {
  NPR: 1,
  INR: 1.6,
};

const normalizeLocale = (countryCode, currencyCode) => ({
  countryCode: String(countryCode || 'NP').trim().toUpperCase().slice(0, 2),
  currencyCode: String(currencyCode || 'NPR').trim().toUpperCase().slice(0, 3),
});

const normalizeExchangeRate = (exchangeRate, currencyCode = 'NPR') => {
  const rate = Number(exchangeRate);
  if (Number.isFinite(rate) && rate > 0) return rate;

  return DEFAULT_EXCHANGE_RATES[String(currencyCode || 'NPR').toUpperCase()] || 1;
};

const getUserSelectColumns = async () => {
  const supportsExchangeRate = await hasColumn('users', 'exchange_rate');
  return `id, name, email, role, country_code, currency_code${
    supportsExchangeRate ? ', exchange_rate' : ''
  }, created_at`;
};

const mapPagePermissions = (rows = []) =>
  rows.reduce((acc, row) => {
    acc[row.page_key] = {
      can_view: Number(row.can_view || 0) === 1,
      can_create: Number(row.can_create || 0) === 1,
      can_edit: Number(row.can_edit || 0) === 1,
      can_delete: Number(row.can_delete || 0) === 1,
    };
    return acc;
  }, {});

const buildUserPayload = async (user) => {
  const pagePermissions = await getUserPagePermissions(user.id);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    country_code: user.country_code,
    currency_code: user.currency_code,
    exchange_rate: normalizeExchangeRate(user.exchange_rate, user.currency_code),
    page_permissions: mapPagePermissions(pagePermissions),
  };
};

// ─── REGISTER ────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'USER', country_code, currency_code, exchange_rate } = req.body;
    const locale = normalizeLocale(country_code, currency_code);
    const supportsExchangeRate = await hasColumn('users', 'exchange_rate');

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
    const userColumns = ['name', 'email', 'password', 'role', 'country_code', 'currency_code'];
    const userValues = [name, email, hashed, role.toUpperCase(), locale.countryCode, locale.currencyCode];

    if (supportsExchangeRate) {
      userColumns.push('exchange_rate');
      userValues.push(normalizeExchangeRate(exchange_rate, locale.currencyCode));
    }

    const userInsert = await appendFiscalInsertFields(
      'users',
      userColumns,
      userValues
    );
    const result = await query(
      `INSERT INTO users (${userInsert.columns.join(', ')})
       VALUES (${userInsert.columns.map(() => '?').join(', ')})`,
      userInsert.values
    );

    const userId = result.insertId;

    const user = await buildUserPayload({
      id: userId,
      name,
      email,
      role: role.toUpperCase(),
      country_code: locale.countryCode,
      currency_code: locale.currencyCode,
      exchange_rate: supportsExchangeRate ? normalizeExchangeRate(exchange_rate, locale.currencyCode) : 1,
    });

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

    const userPayload = await buildUserPayload(user);

    return res.json({
      success: true,
      token,
      user: userPayload,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PROFILE ────────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ${await getUserSelectColumns()} FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!result.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const userPayload = await buildUserPayload(result[0]);

    return res.json({ success: true, data: { ...result[0], ...userPayload } });
  } catch (err) {
    next(err);
  }
};

// ─── LIST USERS ─────────────────────────────────────────────────────────────
const listUsers = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ${await getUserSelectColumns()} FROM users ORDER BY created_at DESC`
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE USER ─────────────────────────────────────────────────────────────
const updateUser = async (req, res, next) => {
  try {
    const { name, email, password, role, country_code, currency_code, exchange_rate } = req.body;
    const userId = req.params.id;
    const supportsExchangeRate = await hasColumn('users', 'exchange_rate');
    const locale = normalizeLocale(country_code, currency_code);
    const updateFields = [
      'name = COALESCE(?, name)',
      'email = COALESCE(?, email)',
      'password = COALESCE(?, password)',
      'role = COALESCE(?, role)',
      'country_code = COALESCE(?, country_code)',
      'currency_code = COALESCE(?, currency_code)',
    ];
    const updateParams = [
      name,
      email,
      null,
      role ? role.toUpperCase() : null,
      country_code ? locale.countryCode : null,
      currency_code ? locale.currencyCode : null,
    ];

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
    updateParams[2] = hashed;

    if (supportsExchangeRate) {
      updateFields.push('exchange_rate = COALESCE(?, exchange_rate)');
      updateParams.push(exchange_rate ? normalizeExchangeRate(exchange_rate, locale.currencyCode) : null);
    }

    await query(
      `UPDATE users
       SET ${updateFields.join(',\n           ')}
       WHERE id = ?`,
      [...updateParams, userId]
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

const listPagePermissions = async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT upp.user_id, upp.page_key, upp.can_view, upp.can_create, upp.can_edit, upp.can_delete,
              u.name AS user_name, u.email, u.role
       FROM user_page_permissions upp
       JOIN users u ON u.id = upp.user_id
       WHERE upp.page_key = ?
       ORDER BY u.name`,
      [PRODUCT_VISIBILITY_PAGE_KEY]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const setPagePermission = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const enabled = Boolean(req.body.enabled);

    const users = await query('SELECT id, role FROM users WHERE id = ?', [userId]);

    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (users[0].role !== 'CO_ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'Product show/hide access can only be assigned to co-admin users.',
      });
    }

    await query(
      `INSERT INTO user_page_permissions
         (user_id, page_key, can_view, can_create, can_edit, can_delete)
       VALUES (?, ?, ?, 0, ?, 0)
       ON DUPLICATE KEY UPDATE
         can_view = VALUES(can_view),
         can_edit = VALUES(can_edit)`,
      [userId, PRODUCT_VISIBILITY_PAGE_KEY, enabled ? 1 : 0, enabled ? 1 : 0]
    );

    await auditLog({
      userId: req.user.id,
      action: enabled ? 'GRANT_PAGE_PERMISSION' : 'REVOKE_PAGE_PERMISSION',
      tableName: 'user_page_permissions',
      recordId: userId,
      detail: `${enabled ? 'Granted' : 'Revoked'} product show/hide access for user #${userId}`,
    });

    return res.json({ success: true });
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
  listPagePermissions,
  setPagePermission,
};
