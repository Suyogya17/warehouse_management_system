const { query, getClient } = require('../config/db');
const path = require('path');
const { hasColumn, hasTable } = require('../utils/schemaSupport');
const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const {
  storeChatAttachment,
  removeStoredChatAttachment,
  resolveChatAttachmentPath,
} = require('../services/chatAttachmentService');

const ADMIN_ROLES = new Set(['ADMIN', 'CO_ADMIN']);
const CUSTOMER_ROLES = new Set(['USER', 'MEMBER', 'ELDER']);
const MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 4000;
const REFERENCE_TYPES = new Set(['PRODUCT', 'ORDER']);
const REFERENCE_LIMIT = 40;
const ONLINE_WINDOW_SECONDS = 120;

const normalizedRole = (user) => String(user?.role || '').toUpperCase();
const isAdmin = (user) => ADMIN_ROLES.has(normalizedRole(user));

const mapMessage = (row) => {
  const deleted = Boolean(row.deleted_at);
  return {
    id: Number(row.id),
    conversation_id: Number(row.conversation_id),
    sender_id: row.sender_id == null ? null : Number(row.sender_id),
    sender_name: row.sender_name || 'Deleted user',
    sender_role: row.sender_role || '',
    message: deleted ? 'Message deleted' : row.message_text,
    created_at: row.created_at,
    edited_at: deleted ? null : row.edited_at || null,
    deleted_at: row.deleted_at || null,
    is_deleted: deleted,
    reference: null,
    attachments: [],
  };
};

const parseSnapshot = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
};

const mapAttachment = (row) => ({
  id: Number(row.id),
  message_id: Number(row.message_id),
  original_name: row.original_name,
  mime_type: row.mime_type,
  size_bytes: Number(row.size_bytes || 0),
  is_image: String(row.mime_type || '').startsWith('image/'),
  is_audio: String(row.mime_type || '').startsWith('audio/'),
  has_thumbnail: Boolean(row.thumbnail_name),
  created_at: row.created_at,
});

const mapConversation = (row) => ({
  id: Number(row.id),
  conversation_type: row.conversation_type || 'CUSTOMER_SUPPORT',
  user_id: Number(row.user_id),
  user_name: row.user_name,
  user_email: row.user_email,
  user_role: row.user_role,
  country_code: row.country_code || '',
  status: row.status,
  assigned_admin_id:
    row.assigned_admin_id == null ? null : Number(row.assigned_admin_id),
  assigned_admin_name: row.assigned_admin_name || '',
  last_message_at: row.last_message_at,
  last_message: row.last_message || '',
  last_sender_name: row.last_sender_name || '',
  unread_count: Number(row.unread_count || 0),
  created_at: row.created_at,
});

const offlinePresence = Object.freeze({ is_online: false });

const loadPresenceForUsers = async (userIds) => {
  const ids = [...new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length || !(await hasTable('chat_presence'))) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT user_id,
            CASE
              WHEN active_status_enabled = 1
               AND last_seen_at >= DATE_SUB(NOW(6), INTERVAL ${ONLINE_WINDOW_SECONDS} SECOND)
              THEN 1 ELSE 0
            END AS is_online
     FROM chat_presence
     WHERE user_id IN (${placeholders})`,
    ids
  );
  return new Map(
    rows.map((row) => [Number(row.user_id), { is_online: Boolean(row.is_online) }])
  );
};

const addPresence = async (records, userIdKey = 'user_id') => {
  const presenceByUser = await loadPresenceForUsers(
    records.map((record) => record?.[userIdKey])
  );
  return records.map((record) => ({
    ...record,
    presence: presenceByUser.get(Number(record?.[userIdKey])) || offlinePresence,
  }));
};

const loadSupportPresence = async () => {
  if (!(await hasTable('chat_presence'))) return offlinePresence;
  const rows = await query(
    `SELECT EXISTS(
       SELECT 1
       FROM chat_presence presence
       JOIN users staff ON staff.id = presence.user_id
       WHERE UPPER(staff.role) IN ('ADMIN', 'CO_ADMIN')
         AND presence.active_status_enabled = 1
         AND presence.last_seen_at >= DATE_SUB(NOW(6), INTERVAL ${ONLINE_WINDOW_SECONDS} SECOND)
     ) AS is_online`
  );
  return { is_online: Boolean(rows[0]?.is_online) };
};

const getMyPresence = async (req, res, next) => {
  try {
    if (!(await hasTable('chat_presence'))) {
      return res.json({
        success: true,
        data: { available: false, active_status_enabled: false },
      });
    }
    const rows = await query(
      `SELECT active_status_enabled
       FROM chat_presence
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    );
    return res.json({
      success: true,
      data: {
        available: true,
        active_status_enabled: rows[0]
          ? Boolean(rows[0].active_status_enabled)
          : true,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateMyPresence = async (req, res, next) => {
  try {
    if (!(await hasTable('chat_presence'))) {
      return res.status(400).json({
        success: false,
        message: 'Active status requires sql/add-chat-presence.sql.',
      });
    }
    if (typeof req.body.enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Choose whether active status is on or off.' });
    }
    const enabled = req.body.enabled ? 1 : 0;
    await query(
      `INSERT INTO chat_presence (user_id, active_status_enabled, last_seen_at)
       VALUES (?, ?, IF(? = 1, NOW(6), NULL))
       ON DUPLICATE KEY UPDATE
         active_status_enabled = VALUES(active_status_enabled),
         last_seen_at = IF(VALUES(active_status_enabled) = 1, NOW(6), last_seen_at)`,
      [req.user.id, enabled, enabled]
    );
    return res.json({
      success: true,
      data: { available: true, active_status_enabled: Boolean(enabled) },
    });
  } catch (error) {
    next(error);
  }
};

const heartbeatPresence = async (req, res, next) => {
  try {
    if (!(await hasTable('chat_presence'))) {
      return res.json({ success: true, data: { available: false } });
    }
    await query(
      `INSERT INTO chat_presence (user_id, active_status_enabled, last_seen_at)
       VALUES (?, 1, NOW(6))
       ON DUPLICATE KEY UPDATE
         last_seen_at = IF(active_status_enabled = 1, NOW(6), last_seen_at)`,
      [req.user.id]
    );
    return res.json({ success: true, data: { available: true } });
  } catch (error) {
    next(error);
  }
};

const conversationSelect = `
  SELECT
    c.id,
    c.user_id,
    c.assigned_admin_id,
    c.status,
    c.last_message_at,
    c.created_at,
    customer.name AS user_name,
    customer.email AS user_email,
    customer.role AS user_role,
    customer.country_code,
    assigned.name AS assigned_admin_name,
    latest.message_text AS last_message,
    latest_sender.name AS last_sender_name
  FROM chat_conversations c
  JOIN users customer ON customer.id = c.user_id
  LEFT JOIN users assigned ON assigned.id = c.assigned_admin_id
  LEFT JOIN chat_messages latest ON latest.id = (
    SELECT cm.id
    FROM chat_messages cm
    WHERE cm.conversation_id = c.id
    ORDER BY cm.id DESC
    LIMIT 1
  )
  LEFT JOIN users latest_sender ON latest_sender.id = latest.sender_id
`;

const getMessages = async (conversationId, afterId = 0, changedAfter = '') => {
  const safeAfterId = Math.max(0, Number(afterId) || 0);
  const safeChangedAfter = String(changedAfter || '').trim().slice(0, 32);
  const [supportsEditedAt, supportsDeletedAt] = await Promise.all([
    hasColumn('chat_messages', 'edited_at'),
    hasColumn('chat_messages', 'deleted_at'),
  ]);
  const messageStateColumns = `,
              ${supportsEditedAt ? 'm.edited_at' : 'NULL AS edited_at'},
              ${supportsDeletedAt ? 'm.deleted_at' : 'NULL AS deleted_at'}`;
  const supportsMutationSync =
    safeAfterId && safeChangedAfter && supportsEditedAt && supportsDeletedAt;
  const rows = safeAfterId
    ? await query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.message_text, m.created_at${messageStateColumns},
              sender.name AS sender_name, sender.role AS sender_role
       FROM chat_messages m
       LEFT JOIN users sender ON sender.id = m.sender_id
       WHERE m.conversation_id = ? AND (
         m.id > ?${
           supportsMutationSync
             ? ' OR m.edited_at > ? OR m.deleted_at > ?'
             : ''
         }
       )
      ORDER BY m.id ASC
       LIMIT ?`,
      supportsMutationSync
        ? [conversationId, safeAfterId, safeChangedAfter, safeChangedAfter, MESSAGE_LIMIT]
        : [conversationId, safeAfterId, MESSAGE_LIMIT]
    )
    : await query(
    `SELECT * FROM (
       SELECT m.id, m.conversation_id, m.sender_id, m.message_text, m.created_at${messageStateColumns},
              sender.name AS sender_name, sender.role AS sender_role
       FROM chat_messages m
       LEFT JOIN users sender ON sender.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.id DESC
       LIMIT ?
     ) recent
     ORDER BY recent.id ASC`,
    [conversationId, MESSAGE_LIMIT]
  );
  const messages = rows.map(mapMessage);
  if (!messages.length) return messages;

  const messageIds = messages
    .filter((message) => !message.is_deleted)
    .map((message) => message.id);
  if (!messageIds.length) return messages;
  const placeholders = messageIds.map(() => '?').join(',');
  const [supportsReferences, supportsAttachments] = await Promise.all([
    hasTable('chat_message_references'),
    hasTable('chat_attachments'),
  ]);
  const [referenceRows, attachmentRows] = await Promise.all([
    supportsReferences
      ? query(
          `SELECT id, message_id, reference_type, reference_id, snapshot_json, created_at
           FROM chat_message_references
           WHERE message_id IN (${placeholders})`,
          messageIds
        )
      : Promise.resolve([]),
    supportsAttachments
      ? query(
          `SELECT id, message_id, original_name, mime_type, size_bytes,
                  thumbnail_name, created_at
           FROM chat_attachments
           WHERE message_id IN (${placeholders})
           ORDER BY id`,
          messageIds
        )
      : Promise.resolve([]),
  ]);

  const messageById = new Map(messages.map((message) => [message.id, message]));
  referenceRows.forEach((row) => {
    const message = messageById.get(Number(row.message_id));
    if (!message) return;
    message.reference = {
      id: Number(row.id),
      type: row.reference_type,
      reference_id: Number(row.reference_id),
      snapshot: parseSnapshot(row.snapshot_json),
      created_at: row.created_at,
    };
  });
  attachmentRows.forEach((row) => {
    const message = messageById.get(Number(row.message_id));
    if (message) message.attachments.push(mapAttachment(row));
  });

  return messages;
};

const getChatSyncCursor = async () => {
  const rows = await query(
    "SELECT DATE_FORMAT(NOW(6), '%Y-%m-%d %H:%i:%s.%f') AS sync_cursor"
  );
  return rows[0]?.sync_cursor || '';
};

const getReadState = async (conversationId) => {
  const rows = await query(
    `SELECT cr.user_id, cr.last_read_message_id, cr.read_at,
            reader.name AS reader_name, reader.role AS reader_role
     FROM chat_reads cr
     JOIN users reader ON reader.id = cr.user_id
     WHERE cr.conversation_id = ?`,
    [conversationId]
  );

  return rows.map((row) => ({
    user_id: Number(row.user_id),
    name: row.reader_name,
    role: row.reader_role,
    last_read_message_id: Number(row.last_read_message_id || 0),
    read_at: row.read_at,
  }));
};

const getCustomerConversation = async (userId) => {
  const rows = await query(
    `${conversationSelect}
     WHERE c.user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapConversation(rows[0]) : null;
};

const assertCustomerRole = (req, res) => {
  if (CUSTOMER_ROLES.has(normalizedRole(req.user))) return true;
  res.status(403).json({ success: false, message: 'This endpoint is for customer conversations.' });
  return false;
};

const assertAdminRole = (req, res) => {
  if (isAdmin(req.user)) return true;
  res.status(403).json({ success: false, message: 'Admin or co-admin access is required.' });
  return false;
};

const assertStaffChatSchema = async () => {
  const [supportsType, supportsPairKey, supportsParticipants] = await Promise.all([
    hasColumn('chat_conversations', 'conversation_type'),
    hasColumn('chat_conversations', 'staff_pair_key'),
    hasTable('chat_conversation_participants'),
  ]);
  if (supportsType && supportsPairKey && supportsParticipants) return;
  const error = new Error('Staff chat requires sql/add-staff-direct-chat.sql.');
  error.statusCode = 400;
  throw error;
};

const assertStaffParticipant = async (conversationId, userId, executor = query) => {
  const rows = await executor(
    `SELECT c.id
     FROM chat_conversations c
     JOIN chat_conversation_participants participant
       ON participant.conversation_id = c.id
      AND participant.user_id = ?
     WHERE c.id = ? AND c.conversation_type = 'STAFF_DIRECT'
     LIMIT 1`,
    [userId, conversationId]
  );
  if (rows[0]) return true;
  const error = new Error('Staff conversation not found or access denied.');
  error.statusCode = 404;
  throw error;
};

const assertCustomerSupportConversation = async (conversationId) => {
  const rows = await query(
    `SELECT id FROM chat_conversations
     WHERE id = ? AND user_id IS NOT NULL
     LIMIT 1`,
    [conversationId]
  );
  if (rows[0]) return true;
  const error = new Error('Customer conversation not found.');
  error.statusCode = 404;
  throw error;
};

const mapStaffConversation = (row) => mapConversation({
  ...row,
  conversation_type: 'STAFF_DIRECT',
  user_id: row.other_user_id,
  user_name: row.other_user_name,
  user_email: row.other_user_email,
  user_role: row.other_user_role,
  country_code: row.other_country_code,
});

const staffConversationSelect = `
  SELECT c.id, c.status, c.last_message_at, c.created_at,
         other_user.id AS other_user_id,
         other_user.name AS other_user_name,
         other_user.email AS other_user_email,
         other_user.role AS other_user_role,
         other_user.country_code AS other_country_code,
         latest.message_text AS last_message,
         latest_sender.name AS last_sender_name
  FROM chat_conversations c
  JOIN chat_conversation_participants mine
    ON mine.conversation_id = c.id
  JOIN chat_conversation_participants other_participant
    ON other_participant.conversation_id = c.id
   AND other_participant.user_id <> mine.user_id
  JOIN users other_user ON other_user.id = other_participant.user_id
  LEFT JOIN chat_messages latest ON latest.id = (
    SELECT latest_message.id
    FROM chat_messages latest_message
    WHERE latest_message.conversation_id = c.id
    ORDER BY latest_message.id DESC
    LIMIT 1
  )
  LEFT JOIN users latest_sender ON latest_sender.id = latest.sender_id
`;

const listStaffUsers = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const search = String(req.query.search || '').trim();
    const params = [req.user.id, req.user.id];
    let searchClause = '';
    if (search) {
      searchClause = 'AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.country_code,
              (
                SELECT staff_conversation.id
                FROM chat_conversations staff_conversation
                JOIN chat_conversation_participants mine
                  ON mine.conversation_id = staff_conversation.id
                 AND mine.user_id = ?
                JOIN chat_conversation_participants other_participant
                  ON other_participant.conversation_id = staff_conversation.id
                 AND other_participant.user_id = u.id
                WHERE staff_conversation.conversation_type = 'STAFF_DIRECT'
                LIMIT 1
              ) AS conversation_id
       FROM users u
       WHERE UPPER(u.role) IN ('ADMIN', 'CO_ADMIN')
         AND u.id <> ?
         ${searchClause}
       ORDER BY u.name, u.id
       LIMIT 200`,
      params
    );
    const staffUsers = rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        email: row.email,
        role: row.role,
        country_code: row.country_code || '',
        conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
      }));
    return res.json({
      success: true,
      data: await addPresence(staffUsers, 'id'),
    });
  } catch (error) {
    next(error);
  }
};

const listStaffConversations = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const rows = await query(
      `${staffConversationSelect.replace(
        'c.created_at,',
        `c.created_at,
         (SELECT COUNT(*)
          FROM chat_messages unread_message
          WHERE unread_message.conversation_id = c.id
            AND unread_message.sender_id <> ?
            AND unread_message.id > COALESCE(
              (SELECT chat_read.last_read_message_id
               FROM chat_reads chat_read
               WHERE chat_read.conversation_id = c.id
                 AND chat_read.user_id = ?),
              0
            )) AS unread_count,`
      )}
       WHERE c.conversation_type = 'STAFF_DIRECT' AND mine.user_id = ?
       ORDER BY c.last_message_at DESC, c.id DESC
       LIMIT 200`,
      [req.user.id, req.user.id, req.user.id]
    );
    const conversations = rows.map(mapStaffConversation);
    return res.json({ success: true, data: await addPresence(conversations) });
  } catch (error) {
    next(error);
  }
};

const createStaffConversation = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const otherUserId = Number(req.body.user_id);
    if (!Number.isInteger(otherUserId) || otherUserId <= 0 || otherUserId === Number(req.user.id)) {
      return res.status(400).json({ success: false, message: 'Select another admin or co-admin.' });
    }
    const staffUsers = await query(
      `SELECT id FROM users
       WHERE id = ? AND UPPER(role) IN ('ADMIN', 'CO_ADMIN')
       LIMIT 1`,
      [otherUserId]
    );
    if (!staffUsers[0]) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }
    const participantIds = [Number(req.user.id), otherUserId].sort((a, b) => a - b);
    const pairKey = `${participantIds[0]}:${participantIds[1]}`;
    const client = await getClient();
    let conversationId;
    try {
      await client.query('START TRANSACTION');
      const created = await client.query(
        `INSERT INTO chat_conversations
           (conversation_type, user_id, assigned_admin_id, staff_pair_key, status)
         VALUES ('STAFF_DIRECT', NULL, NULL, ?, 'OPEN')
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = 'OPEN'`,
        [pairKey]
      );
      conversationId = Number(created.insertId);
      for (const participantId of participantIds) {
        await client.query(
          `INSERT IGNORE INTO chat_conversation_participants (conversation_id, user_id)
           VALUES (?, ?)`,
          [conversationId, participantId]
        );
      }
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }

    const rows = await query(
      `${staffConversationSelect}
       WHERE c.id = ? AND c.conversation_type = 'STAFF_DIRECT' AND mine.user_id = ?
       LIMIT 1`,
      [conversationId, req.user.id]
    );
    const [conversation] = await addPresence([mapStaffConversation(rows[0])]);
    return res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

const listChatUsers = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const search = String(req.query.search || '').trim();
    const params = [];
    let searchClause = '';

    if (search) {
      searchClause = 'AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.country_code,
              c.id AS conversation_id, c.status AS conversation_status,
              c.last_message_at
       FROM users u
       LEFT JOIN chat_conversations c ON c.user_id = u.id
       WHERE UPPER(u.role) IN ('USER', 'MEMBER', 'ELDER')
         ${searchClause}
       ORDER BY u.name ASC, u.id ASC
       LIMIT 200`,
      params
    );

    const chatUsers = rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        email: row.email,
        role: row.role,
        country_code: row.country_code || '',
        conversation_id:
          row.conversation_id == null ? null : Number(row.conversation_id),
        conversation_status: row.conversation_status || '',
        last_message_at: row.last_message_at,
      }));
    return res.json({
      success: true,
      data: await addPresence(chatUsers, 'id'),
    });
  } catch (error) {
    next(error);
  }
};

const createAdminConversation = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const userId = Number(req.body.user_id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Select a valid user.' });
    }

    const users = await query(
      `SELECT id
       FROM users
       WHERE id = ? AND UPPER(role) IN ('USER', 'MEMBER', 'ELDER')
       LIMIT 1`,
      [userId]
    );
    if (!users[0]) {
      return res.status(404).json({ success: false, message: 'Chat user not found.' });
    }

    await query(
      `INSERT INTO chat_conversations (user_id, assigned_admin_id, status)
       VALUES (?, ?, 'OPEN')
       ON DUPLICATE KEY UPDATE
         assigned_admin_id = COALESCE(assigned_admin_id, VALUES(assigned_admin_id))`,
      [userId, req.user.id]
    );

    const rows = await query(
      `${conversationSelect}
       WHERE c.user_id = ?
       LIMIT 1`,
      [userId]
    );

    const [conversation] = await addPresence([mapConversation(rows[0])]);
    return res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

const getMyConversation = async (req, res, next) => {
  try {
    if (!assertCustomerRole(req, res)) return;
    const conversation = await getCustomerConversation(req.user.id);
    const syncCursor = conversation ? await getChatSyncCursor() : '';
    const [messages, readState] = conversation
      ? await Promise.all([
          getMessages(conversation.id, req.query.after_id, req.query.changed_after),
          getReadState(conversation.id),
        ])
      : [[], []];

    const supportPresence = await loadSupportPresence();
    return res.json({
      success: true,
      data: {
        conversation,
        messages,
        read_state: readState,
        sync_cursor: syncCursor,
        support_presence: supportPresence,
      },
    });
  } catch (error) {
    next(error);
  }
};

const sendMyMessage = async (req, res, next) => {
  if (!assertCustomerRole(req, res)) return;
  const message = String(req.body.message || '').trim();

  if (!message) {
    return res.status(400).json({ success: false, message: 'Write a message before sending.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: `Messages can contain up to ${MAX_MESSAGE_LENGTH} characters.` });
  }

  let client;
  try {
    client = await getClient();
    await client.query('START TRANSACTION');
    await client.query(
      `INSERT INTO chat_conversations (user_id, status, last_message_at)
       VALUES (?, 'OPEN', NOW())
       ON DUPLICATE KEY UPDATE status = 'OPEN', last_message_at = NOW()`,
      [req.user.id]
    );
    const conversations = await client.query(
      'SELECT id FROM chat_conversations WHERE user_id = ? FOR UPDATE',
      [req.user.id]
    );
    const conversationId = conversations[0].id;
    const result = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
       VALUES (?, ?, ?)`,
      [conversationId, req.user.id, message]
    );
    await client.query(
      `INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id, read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = NOW()`,
      [conversationId, req.user.id, result.insertId]
    );
    await client.query('COMMIT');

    const messages = await getMessages(conversationId, Number(result.insertId) - 1);
    return res.status(201).json({ success: true, data: messages[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client?.release();
  }
};

const listConversations = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'ALL').toUpperCase();
    const conditions = [];
    const params = [req.user.id];

    if (['OPEN', 'CLOSED'].includes(status)) {
      conditions.push('c.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(customer.name LIKE ? OR customer.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await query(
      `${conversationSelect.replace(
        'c.created_at,',
        `c.created_at,
         (SELECT COUNT(*)
          FROM chat_messages unread_message
          LEFT JOIN users unread_sender ON unread_sender.id = unread_message.sender_id
          WHERE unread_message.conversation_id = c.id
            AND unread_message.id > COALESCE(
              (SELECT cr.last_read_message_id
               FROM chat_reads cr
               WHERE cr.conversation_id = c.id AND cr.user_id = ?),
              0
            )
            AND COALESCE(unread_sender.role, '') NOT IN ('ADMIN', 'CO_ADMIN')) AS unread_count,`
      )}
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY (c.status = 'OPEN') DESC, c.last_message_at DESC, c.id DESC
       LIMIT 200`,
      params
    );

    const conversations = rows.map(mapConversation);
    return res.json({ success: true, data: await addPresence(conversations) });
  } catch (error) {
    next(error);
  }
};

const getAdminConversation = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid conversation.' });
    }

    const rows = await query(
      `${conversationSelect}
       WHERE c.id = ?
       LIMIT 1`,
      [conversationId]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const syncCursor = await getChatSyncCursor();
    const [messages, readState] = await Promise.all([
      getMessages(conversationId, req.query.after_id, req.query.changed_after),
      getReadState(conversationId),
    ]);
    const [conversation] = await addPresence([mapConversation(rows[0])]);
    return res.json({
      success: true,
      data: {
        conversation,
        messages,
        read_state: readState,
        sync_cursor: syncCursor,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getStaffConversation = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid staff conversation.' });
    }
    await assertStaffParticipant(conversationId, req.user.id);
    const rows = await query(
      `${staffConversationSelect}
       WHERE c.id = ? AND c.conversation_type = 'STAFF_DIRECT' AND mine.user_id = ?
       LIMIT 1`,
      [conversationId, req.user.id]
    );
    const syncCursor = await getChatSyncCursor();
    const [messages, readState] = await Promise.all([
      getMessages(conversationId, req.query.after_id, req.query.changed_after),
      getReadState(conversationId),
    ]);
    const [conversation] = await addPresence([mapStaffConversation(rows[0])]);
    return res.json({
      success: true,
      data: {
        conversation,
        messages,
        read_state: readState,
        sync_cursor: syncCursor,
      },
    });
  } catch (error) {
    next(error);
  }
};

const sendStaffMessage = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const conversationId = Number(req.params.id);
    const message = String(req.body.message || '').trim();
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid staff conversation.' });
    }
    if (!message) {
      return res.status(400).json({ success: false, message: 'Write a message before sending.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: `Messages can contain up to ${MAX_MESSAGE_LENGTH} characters.` });
    }

    const client = await getClient();
    let messageId;
    try {
      await client.query('START TRANSACTION');
      await assertStaffParticipant(conversationId, req.user.id, client.query);
      const result = await client.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
         VALUES (?, ?, ?)`,
        [conversationId, req.user.id, message]
      );
      messageId = Number(result.insertId);
      await client.query(
        `UPDATE chat_conversations SET status = 'OPEN', last_message_at = NOW()
         WHERE id = ?`,
        [conversationId]
      );
      await client.query(
        `INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id, read_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = NOW()`,
        [conversationId, req.user.id, messageId]
      );
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }
    const created = await getUpdatedMessage(conversationId, messageId);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const sendAdminMessage = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const conversationId = Number(req.params.id);
    const message = String(req.body.message || '').trim();
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid conversation.' });
    }
    if (!message) {
      return res.status(400).json({ success: false, message: 'Write a message before sending.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: `Messages can contain up to ${MAX_MESSAGE_LENGTH} characters.` });
    }

    const client = await getClient();
    let result;
    try {
      await client.query('START TRANSACTION');
      const conversations = await client.query(
        'SELECT id FROM chat_conversations WHERE id = ? AND user_id IS NOT NULL FOR UPDATE',
        [conversationId]
      );
      if (!conversations[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Conversation not found.' });
      }

      result = await client.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
         VALUES (?, ?, ?)`,
        [conversationId, req.user.id, message]
      );
      await client.query(
        `UPDATE chat_conversations
         SET last_message_at = NOW()
         WHERE id = ?`,
        [conversationId]
      );
      await client.query(
        `INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id, read_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = NOW()`,
        [conversationId, req.user.id, result.insertId]
      );
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }

    const messages = await getMessages(conversationId, Number(result.insertId) - 1);
    return res.status(201).json({ success: true, data: messages[0] });
  } catch (error) {
    next(error);
  }
};

const assertChatMessageEditingSchema = async () => {
  const [supportsEditedAt, supportsDeletedAt] = await Promise.all([
    hasColumn('chat_messages', 'edited_at'),
    hasColumn('chat_messages', 'deleted_at'),
  ]);
  if (supportsEditedAt && supportsDeletedAt) return;
  const error = new Error(
    'Chat message editing requires sql/add-chat-message-editing.sql.'
  );
  error.statusCode = 400;
  throw error;
};

const getUpdatedMessage = async (conversationId, messageId) => {
  const messages = await getMessages(conversationId, Math.max(0, messageId - 1));
  return messages.find((message) => Number(message.id) === Number(messageId)) || null;
};

const editMessage = async (req, res, next) => {
  try {
    await assertChatMessageEditingSchema();
    const messageId = Number(req.params.messageId);
    const message = String(req.body.message || '').trim();
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid message.' });
    }
    if (!message) {
      return res.status(400).json({ success: false, message: 'A message cannot be empty.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: `Messages can contain up to ${MAX_MESSAGE_LENGTH} characters.` });
    }

    const client = await getClient();
    let conversationId;
    try {
      await client.query('START TRANSACTION');
      const rows = await client.query(
        `SELECT id, conversation_id, sender_id, deleted_at
         FROM chat_messages
         WHERE id = ?
         FOR UPDATE`,
        [messageId]
      );
      const existing = rows[0];
      if (!existing) {
        const error = new Error('Message not found.');
        error.statusCode = 404;
        throw error;
      }
      if (Number(existing.sender_id) !== Number(req.user.id)) {
        const error = new Error('You can edit only your own messages.');
        error.statusCode = 403;
        throw error;
      }
      if (existing.deleted_at) {
        const error = new Error('A deleted message cannot be edited.');
        error.statusCode = 400;
        throw error;
      }
      conversationId = Number(existing.conversation_id);
      await client.query(
        `UPDATE chat_messages
         SET message_text = ?, edited_at = NOW(6)
         WHERE id = ?`,
        [message, messageId]
      );
      await client.query(
        'UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?',
        [conversationId]
      );
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }

    const updated = await getUpdatedMessage(conversationId, messageId);
    return res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    await assertChatMessageEditingSchema();
    const messageId = Number(req.params.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid message.' });
    }
    const [supportsReferences, supportsAttachments] = await Promise.all([
      hasTable('chat_message_references'),
      hasTable('chat_attachments'),
    ]);

    const client = await getClient();
    let conversationId;
    let storedAttachments = [];
    try {
      await client.query('START TRANSACTION');
      const rows = await client.query(
        `SELECT id, conversation_id, sender_id, deleted_at
         FROM chat_messages
         WHERE id = ?
         FOR UPDATE`,
        [messageId]
      );
      const existing = rows[0];
      if (!existing) {
        const error = new Error('Message not found.');
        error.statusCode = 404;
        throw error;
      }
      if (Number(existing.sender_id) !== Number(req.user.id)) {
        const error = new Error('You can delete only your own messages.');
        error.statusCode = 403;
        throw error;
      }
      conversationId = Number(existing.conversation_id);

      if (!existing.deleted_at) {
        if (supportsAttachments) {
          storedAttachments = await client.query(
            `SELECT stored_name AS storedName, thumbnail_name AS thumbnailName
             FROM chat_attachments
             WHERE message_id = ?`,
            [messageId]
          );
          await client.query('DELETE FROM chat_attachments WHERE message_id = ?', [messageId]);
        }
        if (supportsReferences) {
          await client.query('DELETE FROM chat_message_references WHERE message_id = ?', [messageId]);
        }
        await client.query(
          `UPDATE chat_messages
           SET message_text = 'Message deleted', edited_at = NULL, deleted_at = NOW(6)
           WHERE id = ?`,
          [messageId]
        );
        await client.query(
          'UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?',
          [conversationId]
        );
      }
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK').catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }

    await Promise.all(
      storedAttachments.map((attachment) => removeStoredChatAttachment(attachment))
    );
    const updated = await getUpdatedMessage(conversationId, messageId);
    return res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const assertChatExtrasSchema = async (tableName) => {
  if (await hasTable(tableName)) return;
  const error = new Error(
    'Chat references and attachments require sql/add-chat-references-and-attachments.sql.'
  );
  error.statusCode = 400;
  throw error;
};

const getReferenceProducts = async (req) => {
  const admin = isAdmin(req.user);
  const baseQuery = {
    ...req.query,
    offer_view: '0',
    ...(admin ? { include_hidden: '1' } : {}),
  };
  const search = String(req.query.search || '').trim();
  const exactId = Math.max(0, Number(req.query.reference_id) || 0);
  const loadOptions = {
    search,
    productId: exactId,
    // Offer audience checks are applied after the base product query. Load a
    // bounded candidate set so personalized offers are not accidentally
    // hidden merely because they were outside the first visible rows.
    limit: exactId ? 1 : 200,
  };
  const normalProducts = await loadAvailabilityForRequest(
    { ...req, query: baseQuery },
    loadOptions
  );
  let products = normalProducts;

  if (CUSTOMER_ROLES.has(normalizedRole(req.user))) {
    const offerProducts = await loadAvailabilityForRequest(
      {
        ...req,
        query: { ...baseQuery, offer_view: '1' },
      },
      loadOptions
    );
    const byId = new Map(normalProducts.map((product) => [Number(product.id), product]));
    offerProducts.forEach((product) => byId.set(Number(product.id), product));
    products = [...byId.values()];
  }

  return products
    .filter((product) => {
      if (exactId) return Number(product.id) === exactId;
      if (!search) return true;
      const normalizedSearch = search.toLowerCase();
      return [
        product.id,
        product.name,
        product.article_code,
        product.sole_code,
        product.color,
        product.size,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    })
    .slice(0, exactId ? 1 : REFERENCE_LIMIT)
    .map((product) => ({
      id: Number(product.id),
      name: product.name,
      article_code: product.article_code,
      sole_code: product.sole_code,
      color: product.color,
      size: product.size,
      image_url: product.image_url,
      display_stock: Number(product.display_stock ?? product.available_qty ?? 0),
      unit: product.unit || 'pairs',
      is_offer:
        Number(product.offer_enabled) === 1 &&
        (!product.offer_ends_at || new Date(product.offer_ends_at).getTime() >= Date.now()),
    }));
};

const getReferenceOrders = async (req) => {
  const params = [];
  const conditions = [];
  if (!isAdmin(req.user)) {
    conditions.push('o.created_by = ?');
    params.push(req.user.id);
  }

  const exactId = Math.max(0, Number(req.query.reference_id) || 0);
  const search = String(req.query.search || '').trim();
  if (exactId) {
    conditions.push('o.id = ?');
    params.push(exactId);
  } else if (search) {
    const pattern = `%${search}%`;
    conditions.push(`(
      CAST(o.id AS CHAR) = ? OR o.delivery_note_number LIKE ? OR
      o.customer_name LIKE ? OR o.status LIKE ?
    )`);
    params.push(search, pattern, pattern, pattern);
  }

  const rows = await query(
    `SELECT o.id, o.customer_name, o.status, o.delivery_note_number, o.created_at,
            COUNT(oi.id) AS item_count,
            COALESCE(SUM(oi.qty_ordered), 0) AS total_quantity,
            GROUP_CONCAT(
              CONCAT(COALESCE(fg.article_code, fg.name),
                     CASE WHEN NULLIF(TRIM(fg.color), '') IS NULL
                          THEN '' ELSE CONCAT(' · ', fg.color) END)
              ORDER BY oi.id SEPARATOR ', '
            ) AS item_summary
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN finished_goods fg ON fg.id = oi.finished_good_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ?`,
    [...params, exactId ? 1 : REFERENCE_LIMIT]
  );

  return rows.map((order) => ({
    id: Number(order.id),
    customer_name: order.customer_name,
    status: order.status,
    delivery_note_number: order.delivery_note_number,
    created_at: order.created_at,
    item_count: Number(order.item_count || 0),
    total_quantity: Number(order.total_quantity || 0),
    item_summary: order.item_summary || '',
  }));
};

const getConversationCustomer = async (conversationId) => {
  const id = Number(conversationId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const supportsConversationType = await hasColumn('chat_conversations', 'conversation_type');
  const rows = await query(
    `SELECT ${supportsConversationType ? 'conversation.conversation_type,' : "'CUSTOMER_SUPPORT' AS conversation_type,"}
            customer.id, customer.name, customer.email, customer.role,
            customer.country_code, customer.currency_code
     FROM chat_conversations conversation
     LEFT JOIN users customer ON customer.id = conversation.user_id
     WHERE conversation.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const getProductReferenceRequest = async (req, conversationId) => {
  if (!isAdmin(req.user)) return req;
  const customer = await getConversationCustomer(conversationId);
  if (customer?.conversation_type === 'STAFF_DIRECT') {
    await assertStaffChatSchema();
    await assertStaffParticipant(Number(conversationId), req.user.id);
    return req;
  }
  if (!customer || !CUSTOMER_ROLES.has(normalizedRole(customer))) {
    const error = new Error('Select a valid customer conversation before sharing a product.');
    error.statusCode = 404;
    throw error;
  }
  return { ...req, user: customer };
};

const getReferenceOptions = async (req, res, next) => {
  try {
    const type = String(req.query.type || 'PRODUCT').trim().toUpperCase();
    if (!REFERENCE_TYPES.has(type)) {
      return res.status(400).json({ success: false, message: 'Reference type must be PRODUCT or ORDER.' });
    }
    if (!isAdmin(req.user) && !CUSTOMER_ROLES.has(normalizedRole(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const referenceRequest = type === 'PRODUCT'
      ? await getProductReferenceRequest(req, req.query.conversation_id)
      : req;
    const data = type === 'PRODUCT'
      ? await getReferenceProducts(referenceRequest)
      : await getReferenceOrders(req);
    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getReferenceSnapshot = async (req, type, referenceId, conversationId) => {
  const referenceRequest = {
    ...(type === 'PRODUCT'
      ? await getProductReferenceRequest(req, conversationId)
      : req),
    query: { ...req.query, reference_id: referenceId, search: '' },
  };
  const options = type === 'PRODUCT'
    ? await getReferenceProducts(referenceRequest)
    : await getReferenceOrders(referenceRequest);
  if (!options[0]) {
    const error = new Error(
      type === 'PRODUCT'
        ? 'Product not found or you do not have permission to share it.'
        : 'Order not found or you do not have permission to share it.'
    );
    error.statusCode = 404;
    throw error;
  }
  return options[0];
};

const createRelatedMessage = async ({
  req,
  conversationId,
  message,
  persistRelated,
}) => {
  const customer = !isAdmin(req.user);
  if (
    !customer &&
    (!Number.isInteger(Number(conversationId)) || Number(conversationId) <= 0)
  ) {
    const error = new Error('Invalid conversation.');
    error.statusCode = 400;
    throw error;
  }
  const client = await getClient();
  let messageId;
  try {
    await client.query('START TRANSACTION');
    let resolvedConversationId = Number(conversationId || 0);

    if (customer) {
      await client.query(
        `INSERT INTO chat_conversations (user_id, status, last_message_at)
         VALUES (?, 'OPEN', NOW())
         ON DUPLICATE KEY UPDATE status = 'OPEN', last_message_at = NOW()`,
        [req.user.id]
      );
      const conversations = await client.query(
        'SELECT id FROM chat_conversations WHERE user_id = ? FOR UPDATE',
        [req.user.id]
      );
      resolvedConversationId = Number(conversations[0]?.id || 0);
    } else {
      const conversations = await client.query(
        'SELECT id FROM chat_conversations WHERE id = ? FOR UPDATE',
        [resolvedConversationId]
      );
      if (!conversations[0]) {
        const error = new Error('Conversation not found.');
        error.statusCode = 404;
        throw error;
      }
    }

    const result = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
       VALUES (?, ?, ?)`,
      [resolvedConversationId, req.user.id, String(message || '').slice(0, MAX_MESSAGE_LENGTH)]
    );
    messageId = Number(result.insertId);
    await persistRelated(client, messageId);
    await client.query(
      `UPDATE chat_conversations SET last_message_at = NOW() WHERE id = ?`,
      [resolvedConversationId]
    );
    await client.query(
      `INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id, read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = NOW()`,
      [resolvedConversationId, req.user.id, messageId]
    );
    await client.query('COMMIT');

    const created = await getMessages(resolvedConversationId, messageId - 1);
    return created.find((item) => item.id === messageId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const sendReference = async (req, res, next, conversationId = null) => {
  try {
    await assertChatExtrasSchema('chat_message_references');
    const type = String(req.body.reference_type || '').trim().toUpperCase();
    const referenceId = Number(req.body.reference_id);
    const caption = String(req.body.message || '').trim();
    if (!REFERENCE_TYPES.has(type) || !Number.isInteger(referenceId) || referenceId <= 0) {
      return res.status(400).json({ success: false, message: 'Select a valid product or order.' });
    }
    const snapshot = await getReferenceSnapshot(
      req,
      type,
      referenceId,
      conversationId
    );
    const defaultMessage = type === 'PRODUCT'
      ? `Shared product ${snapshot.article_code || snapshot.name}`
      : `Shared order #${snapshot.id}`;
    const created = await createRelatedMessage({
      req,
      conversationId,
      message: caption || defaultMessage,
      persistRelated: (client, messageId) => client.query(
        `INSERT INTO chat_message_references
           (message_id, reference_type, reference_id, snapshot_json)
         VALUES (?, ?, ?, ?)`,
        [messageId, type, referenceId, JSON.stringify(snapshot)]
      ),
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const sendMyReference = (req, res, next) => {
  if (!assertCustomerRole(req, res)) return;
  return sendReference(req, res, next);
};

const sendAdminReference = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const conversationId = Number(req.params.id);
    await assertCustomerSupportConversation(conversationId);
    return sendReference(req, res, next, conversationId);
  } catch (error) {
    next(error);
  }
};

const sendStaffReference = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const conversationId = Number(req.params.id);
    await assertStaffParticipant(conversationId, req.user.id);
    return sendReference(req, res, next, conversationId);
  } catch (error) {
    next(error);
  }
};

const sendAttachment = async (req, res, next, conversationId = null) => {
  let storedFile;
  try {
    await assertChatExtrasSchema('chat_attachments');
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Select a file to attach.' });
    }
    const caption = String(req.body.message || '').trim();
    if (caption.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: `Messages can contain up to ${MAX_MESSAGE_LENGTH} characters.` });
    }
    storedFile = await storeChatAttachment(req.file);
    const originalName = path.basename(String(req.file.originalname || 'attachment')).slice(0, 255);
    const voiceMessage = String(storedFile.mimeType || '').startsWith('audio/');
    const created = await createRelatedMessage({
      req,
      conversationId,
      message: caption || (voiceMessage ? 'Voice message' : `Shared attachment: ${originalName}`),
      persistRelated: (client, messageId) => client.query(
        `INSERT INTO chat_attachments
           (message_id, uploaded_by, original_name, stored_name, thumbnail_name,
            mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          messageId,
          req.user.id,
          originalName,
          storedFile.storedName,
          storedFile.thumbnailName,
          storedFile.mimeType,
          storedFile.sizeBytes,
        ]
      ),
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (storedFile) await removeStoredChatAttachment(storedFile);
    if (!storedFile && req.file && !error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const sendMyAttachment = (req, res, next) => {
  if (!assertCustomerRole(req, res)) return;
  return sendAttachment(req, res, next);
};

const sendAdminAttachment = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const conversationId = Number(req.params.id);
    await assertCustomerSupportConversation(conversationId);
    return sendAttachment(req, res, next, conversationId);
  } catch (error) {
    next(error);
  }
};

const sendStaffAttachment = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    await assertStaffChatSchema();
    const conversationId = Number(req.params.id);
    await assertStaffParticipant(conversationId, req.user.id);
    return sendAttachment(req, res, next, conversationId);
  } catch (error) {
    next(error);
  }
};

const downloadAttachment = async (req, res, next) => {
  try {
    await assertChatExtrasSchema('chat_attachments');
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attachment.' });
    }
    const params = [attachmentId];
    const supportsConversationType = await hasColumn('chat_conversations', 'conversation_type');
    let accessClause;
    if (isAdmin(req.user) && supportsConversationType) {
      accessClause = `AND (
        c.conversation_type = 'CUSTOMER_SUPPORT'
        OR (
          c.conversation_type = 'STAFF_DIRECT'
          AND EXISTS (
            SELECT 1 FROM chat_conversation_participants participant
            WHERE participant.conversation_id = c.id AND participant.user_id = ?
          )
        )
      )`;
      params.push(req.user.id);
    } else if (isAdmin(req.user)) {
      accessClause = '';
    } else {
      accessClause = 'AND c.user_id = ?';
      params.push(req.user.id);
    }
    const rows = await query(
      `SELECT a.*, c.user_id
       FROM chat_attachments a
       JOIN chat_messages m ON m.id = a.message_id
       JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE a.id = ? ${accessClause}
       LIMIT 1`,
      params
    );
    const attachment = rows[0];
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found or access denied.' });
    }

    const wantsThumbnail = req.query.variant === 'thumbnail';
    const filePath = resolveChatAttachmentPath(attachment, wantsThumbnail);
    if (!filePath) {
      return res.status(404).json({ success: false, message: 'Attachment file is unavailable.' });
    }
    const originalSafeName = String(attachment.original_name || 'attachment')
      .replace(/[\r\n"]/g, '')
      .slice(0, 180);
    const safeName = String(attachment.mime_type) === 'image/webp'
      ? `${path.basename(originalSafeName, path.extname(originalSafeName)) || 'image'}.webp`
      : originalSafeName;
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `${wantsThumbnail || /^(image|audio)\//.test(String(attachment.mime_type)) ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader(
      'Content-Type',
      wantsThumbnail && attachment.thumbnail_name ? 'image/webp' : attachment.mime_type
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const conversationId = admin
      ? Number(req.params.id)
      : Number((await getCustomerConversation(req.user.id))?.id || 0);

    if (!conversationId) return res.json({ success: true, data: { unread_count: 0 } });

    if (admin) {
      const supportsConversationType = await hasColumn('chat_conversations', 'conversation_type');
      const exists = await query(
        `SELECT id${supportsConversationType ? ', conversation_type' : ''}
         FROM chat_conversations WHERE id = ? LIMIT 1`,
        [conversationId]
      );
      if (!exists[0]) return res.status(404).json({ success: false, message: 'Conversation not found.' });
      if (supportsConversationType && exists[0].conversation_type === 'STAFF_DIRECT') {
        await assertStaffParticipant(conversationId, req.user.id);
      }
    } else if (!CUSTOMER_ROLES.has(normalizedRole(req.user))) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const latest = await query(
      'SELECT MAX(id) AS last_message_id FROM chat_messages WHERE conversation_id = ?',
      [conversationId]
    );
    const lastMessageId = latest[0]?.last_message_id;
    if (lastMessageId) {
      await query(
        `INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id, read_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = NOW()`,
        [conversationId, req.user.id, lastMessageId]
      );
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    if (!assertAdminRole(req, res)) return;
    const conversationId = Number(req.params.id);
    const status = String(req.body.status || '').toUpperCase();
    if (!['OPEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be OPEN or CLOSED.' });
    }
    const result = await query(
      'UPDATE chat_conversations SET status = ? WHERE id = ? AND user_id IS NOT NULL',
      [status, conversationId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    let rows;
    if (isAdmin(req.user)) {
      const customerRows = await query(
        `SELECT COUNT(*) AS unread_count
         FROM chat_messages m
         JOIN chat_conversations c ON c.id = m.conversation_id
         LEFT JOIN users sender ON sender.id = m.sender_id
         WHERE m.id > COALESCE(
           (SELECT cr.last_read_message_id
            FROM chat_reads cr
            WHERE cr.conversation_id = c.id AND cr.user_id = ?),
           0
         )
           AND COALESCE(sender.role, '') NOT IN ('ADMIN', 'CO_ADMIN')`,
        [req.user.id]
      );
      let staffUnread = 0;
      const supportsStaffChat =
        (await hasColumn('chat_conversations', 'conversation_type')) &&
        (await hasTable('chat_conversation_participants'));
      if (supportsStaffChat) {
        const staffRows = await query(
          `SELECT COUNT(*) AS unread_count
           FROM chat_messages message
           JOIN chat_conversations conversation
             ON conversation.id = message.conversation_id
            AND conversation.conversation_type = 'STAFF_DIRECT'
           JOIN chat_conversation_participants participant
             ON participant.conversation_id = conversation.id
            AND participant.user_id = ?
           WHERE message.sender_id <> ?
             AND message.id > COALESCE(
               (SELECT chat_read.last_read_message_id
                FROM chat_reads chat_read
                WHERE chat_read.conversation_id = conversation.id
                  AND chat_read.user_id = ?),
               0
             )`,
          [req.user.id, req.user.id, req.user.id]
        );
        staffUnread = Number(staffRows[0]?.unread_count || 0);
      }
      rows = [{
        unread_count: Number(customerRows[0]?.unread_count || 0) + staffUnread,
      }];
    } else if (CUSTOMER_ROLES.has(normalizedRole(req.user))) {
      rows = await query(
        `SELECT COUNT(*) AS unread_count
         FROM chat_messages m
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = ?
           AND m.sender_id <> ?
           AND m.id > COALESCE(
             (SELECT cr.last_read_message_id
              FROM chat_reads cr
              WHERE cr.conversation_id = c.id AND cr.user_id = ?),
             0
           )`,
        [req.user.id, req.user.id, req.user.id]
      );
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    return res.json({ success: true, data: { unread_count: Number(rows[0]?.unread_count || 0) } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyPresence,
  updateMyPresence,
  heartbeatPresence,
  listChatUsers,
  listStaffUsers,
  listStaffConversations,
  createStaffConversation,
  createAdminConversation,
  getMyConversation,
  sendMyMessage,
  editMessage,
  deleteMessage,
  listConversations,
  getAdminConversation,
  getStaffConversation,
  sendAdminMessage,
  sendStaffMessage,
  getReferenceOptions,
  sendMyReference,
  sendAdminReference,
  sendStaffReference,
  sendMyAttachment,
  sendAdminAttachment,
  sendStaffAttachment,
  downloadAttachment,
  markRead,
  updateStatus,
  getUnreadCount,
};
