const { query } = require('../config/db');
const { hasTable } = require('./schemaSupport');

const PRODUCT_VISIBILITY_PAGE_KEY = 'product_visibility';

const getUserPagePermissions = async (userId) => {
  const supportsPagePermissions = await hasTable('user_page_permissions');

  if (!supportsPagePermissions) return [];

  return query(
    `SELECT page_key, can_view, can_create, can_edit, can_delete
     FROM user_page_permissions
     WHERE user_id = ?`,
    [userId]
  );
};

const hasUserPagePermission = async (userId, pageKey, action = 'can_view') => {
  const allowedActions = new Set(['can_view', 'can_create', 'can_edit', 'can_delete']);
  const column = allowedActions.has(action) ? action : 'can_view';
  const supportsPagePermissions = await hasTable('user_page_permissions');

  if (!supportsPagePermissions) return false;

  const rows = await query(
    `SELECT ${column} AS allowed
     FROM user_page_permissions
     WHERE user_id = ? AND page_key = ?
     LIMIT 1`,
    [userId, pageKey]
  );

  return Number(rows[0]?.allowed || 0) === 1;
};

module.exports = {
  PRODUCT_VISIBILITY_PAGE_KEY,
  getUserPagePermissions,
  hasUserPagePermission,
};
