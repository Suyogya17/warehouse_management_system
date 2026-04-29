const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');
const auditLog   = require('../utils/auditLog');

// ─── REGISTER ────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'USER' } = req.body;

    // Check duplicate email
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at`,
      [name, email, hashed, role.toUpperCase()]
    );

    const user = result.rows[0];
    await auditLog({ userId: user.id, action: 'CREATED', tableName: 'users', recordId: user.id, detail: `New user registered: ${email}` });

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── LIST ALL USERS (ADMIN only) ─────────────────────────────────────────────
const listUsers = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const userId = req.params.id;

    const existing = await query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (email && email !== existing.rows[0].email) {
      const duplicate = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }
    }

    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const result = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           password = COALESCE($3, password),
           role = COALESCE($4, role)
       WHERE id = $5
       RETURNING id, name, email, role, created_at`,
      [name || null, email || null, hashed, role ? role.toUpperCase() : null, userId]
    );

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'users',
      recordId: result.rows[0].id,
      detail: `Updated user: ${result.rows[0].email}`,
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'DELETED',
      tableName: 'users',
      recordId: result.rows[0].id,
      detail: `Deleted user: ${result.rows[0].email}`,
    });

    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getProfile, listUsers, updateUser, deleteUser };
