const { query } = require('../config/db');
const { appendFiscalInsertFields } = require('../utils/nepaliFiscalYear');
const { hasColumn } = require('../utils/schemaSupport');

const imagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);
const mediaType = (req) => (req.file?.mimetype?.startsWith('video/') ? 'VIDEO' : 'IMAGE');
const ADVERTISEMENT_PLACEMENTS = [
  'ABOVE_STATUS',
  'BELOW_STATUS',
  'FACEBOOK_FEED',
  'INSTAGRAM_FEED',
  'NOTICE',
];
const placement = (value) =>
  ADVERTISEMENT_PLACEMENTS.includes(String(value).toUpperCase())
    ? String(value).toUpperCase()
    : 'BELOW_STATUS';
const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const nullable = (value) => (value === undefined || value === null || value === '' ? null : value);
const ADVERTISEMENT_OPTIONAL_COLUMNS = [
  'image_url',
  'media_type',
  'placement',
  'width_percent',
  'height_px',
  'link_url',
  'display_order',
  'starts_at',
  'ends_at',
];

const getSupportedAdvertisementColumns = async () => {
  const checks = await Promise.all(
    ADVERTISEMENT_OPTIONAL_COLUMNS.map(async (column) => ({
      column,
      supported: await hasColumn('advertisements', column),
    }))
  );

  return new Set(checks.filter((check) => check.supported).map((check) => check.column));
};

const pushIfSupported = (columns, values, supportedColumns, column, value) => {
  if (!supportedColumns.has(column)) return;
  columns.push(column);
  values.push(value);
};

const getAll = async (req, res, next) => {
  try {
    const canManage = ['ADMIN', 'CO_ADMIN'].includes(req.user.role);
    const supportedColumns = await getSupportedAdvertisementColumns();
    const supportsSchedule =
      supportedColumns.has('starts_at') && supportedColumns.has('ends_at');
    const orderBy = supportedColumns.has('display_order')
      ? 'display_order, created_at DESC'
      : 'created_at DESC';
    const scheduleFilter = supportsSchedule
      ? `AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())`
      : '';
    const sql = canManage
      ? `SELECT * FROM advertisements ORDER BY ${orderBy}`
      : `SELECT * FROM advertisements
         WHERE is_active = 1
           ${scheduleFilter}
         ORDER BY ${orderBy}`;
    const rows = await query(sql);
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    const supportedColumns = await getSupportedAdvertisementColumns();
    const columns = ['title', 'message', 'is_active'];
    const values = [
      title,
      nullable(req.body.message),
      String(req.body.is_active) === 'false' || String(req.body.is_active) === '0' ? 0 : 1,
    ];

    pushIfSupported(columns, values, supportedColumns, 'image_url', imagePath(req));
    pushIfSupported(columns, values, supportedColumns, 'media_type', mediaType(req));
    pushIfSupported(columns, values, supportedColumns, 'placement', placement(req.body.placement));
    pushIfSupported(columns, values, supportedColumns, 'width_percent', clampNumber(req.body.width_percent, 50, 100, 100));
    pushIfSupported(columns, values, supportedColumns, 'height_px', clampNumber(req.body.height_px, 180, 600, 320));
    pushIfSupported(columns, values, supportedColumns, 'link_url', nullable(req.body.link_url));
    pushIfSupported(columns, values, supportedColumns, 'display_order', Number(req.body.display_order || 0));
    pushIfSupported(columns, values, supportedColumns, 'starts_at', nullable(req.body.starts_at));
    pushIfSupported(columns, values, supportedColumns, 'ends_at', nullable(req.body.ends_at));

    const advertisementInsert = await appendFiscalInsertFields(
      'advertisements',
      columns,
      values
    );
    const result = await query(
      `INSERT INTO advertisements (${advertisementInsert.columns.join(', ')})
       VALUES (${advertisementInsert.columns.map(() => '?').join(', ')})`,
      advertisementInsert.values
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    const supportedColumns = await getSupportedAdvertisementColumns();
    const nextImage = imagePath(req);
    const assignments = ['title = ?', 'message = ?', 'is_active = ?'];
    const params = [
      title,
      nullable(req.body.message),
      String(req.body.is_active) === 'false' || String(req.body.is_active) === '0' ? 0 : 1,
    ];

    const addAssignment = (column, value) => {
      if (!supportedColumns.has(column)) return;
      assignments.push(`${column} = ?`);
      params.push(value);
    };

    addAssignment('placement', placement(req.body.placement));
    addAssignment('width_percent', clampNumber(req.body.width_percent, 50, 100, 100));
    addAssignment('height_px', clampNumber(req.body.height_px, 180, 600, 320));
    addAssignment('link_url', nullable(req.body.link_url));
    addAssignment('display_order', Number(req.body.display_order || 0));
    addAssignment('starts_at', nullable(req.body.starts_at));
    addAssignment('ends_at', nullable(req.body.ends_at));

    if (nextImage && supportedColumns.has('image_url')) {
      assignments.push('image_url = ?');
      params.push(nextImage, mediaType(req));
      if (supportedColumns.has('media_type')) {
        assignments.push('media_type = ?');
      } else {
        params.pop();
      }
    }
    let sql = `UPDATE advertisements SET ${assignments.join(', ')} WHERE id = ?`;
    params.push(req.params.id);

    const result = await query(sql, params);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Advertisement not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const reorder = async (req, res, next) => {
  try {
    const orderedIds = Array.isArray(req.body.ordered_ids)
      ? req.body.ordered_ids.map(Number).filter((id) => id > 0)
      : [];
    if (!orderedIds.length) {
      return res.status(400).json({ success: false, message: 'ordered_ids is required.' });
    }
    if (!(await hasColumn('advertisements', 'display_order'))) {
      return res.json({ success: true });
    }
    await Promise.all(
      orderedIds.map((id, index) =>
        query('UPDATE advertisements SET display_order = ? WHERE id = ?', [index + 1, id])
      )
    );
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM advertisements WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Advertisement not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, create, update, reorder, remove };
