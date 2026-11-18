const crypto = require('crypto');
const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const SETTINGS_TABLE = 'dashboard_product_rotation_settings';
const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;
const DEFAULT_ROTATION_TIMES = ['06:00', '14:00', '22:00'];

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  rotations_per_day: 3,
  rotation_times: DEFAULT_ROTATION_TIMES,
  in_stock_only: true,
  locked: false,
  locked_rotation_key: null,
  manual_revision: 0,
});

const pad = (value) => String(value).padStart(2, '0');

const parseRotationTimes = (value) => {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value.split(',');
    }
  }

  if (!Array.isArray(parsed)) return [...DEFAULT_ROTATION_TIMES];

  return [...new Set(parsed.map((time) => String(time || '').trim()))]
    .filter((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    .sort();
};

const normalizeSettings = (row = {}) => {
  const rotationsPerDay = Number(row.rotations_per_day) === 2 ? 2 : 3;
  const parsedTimes = parseRotationTimes(row.rotation_times);
  const fallbackTimes = rotationsPerDay === 2
    ? ['08:00', '20:00']
    : [...DEFAULT_ROTATION_TIMES];
  const rotationTimes = parsedTimes.length === rotationsPerDay
    ? parsedTimes
    : fallbackTimes;

  return {
    enabled: Number(row.enabled ?? DEFAULT_SETTINGS.enabled) === 1,
    rotations_per_day: rotationsPerDay,
    rotation_times: rotationTimes,
    in_stock_only: Number(row.in_stock_only ?? DEFAULT_SETTINGS.in_stock_only) === 1,
    locked: Number(row.locked ?? DEFAULT_SETTINGS.locked) === 1,
    locked_rotation_key: row.locked_rotation_key || null,
    manual_revision: Math.max(0, Number(row.manual_revision || 0)),
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null,
  };
};

const getNepalClock = (date = new Date()) => {
  const shifted = new Date(date.getTime() + NEPAL_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
};

const formatDateKey = ({ year, month, day }) =>
  `${year}-${pad(month)}-${pad(day)}`;

const shiftDateKey = (clock, days) => {
  const utc = Date.UTC(clock.year, clock.month - 1, clock.day + days);
  const shifted = new Date(utc);
  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
};

const nepalLocalToUtcIso = (dateKey, time) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hours, minutes) -
      NEPAL_OFFSET_MINUTES * 60 * 1000
  ).toISOString();
};

const getRotationWindow = (settingsInput, date = new Date(), options = {}) => {
  const settings = normalizeSettings(settingsInput);
  const clock = getNepalClock(date);
  const todayKey = formatDateKey(clock);
  const minuteOfDay = clock.hours * 60 + clock.minutes;
  const times = settings.rotation_times;
  const timeMinutes = times.map((time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  });

  let activeIndex = -1;
  for (let index = 0; index < timeMinutes.length; index += 1) {
    if (timeMinutes[index] <= minuteOfDay) activeIndex = index;
  }

  const activeDateKey = activeIndex >= 0 ? todayKey : shiftDateKey(clock, -1);
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : times.length - 1;
  const scheduledKey = `${activeDateKey}-slot-${resolvedActiveIndex + 1}`;
  const liveKey = `${scheduledKey}-revision-${settings.manual_revision}`;
  const rotationKey = options.ignoreLock
    ? liveKey
    : settings.locked && settings.locked_rotation_key
      ? settings.locked_rotation_key
      : liveKey;

  let nextRotationAt = null;
  if (settings.enabled && !settings.locked) {
    const nextIndex = timeMinutes.findIndex((value) => value > minuteOfDay);
    if (nextIndex >= 0) {
      nextRotationAt = nepalLocalToUtcIso(todayKey, times[nextIndex]);
    } else {
      nextRotationAt = nepalLocalToUtcIso(shiftDateKey(clock, 1), times[0]);
    }
  }

  return {
    rotation_key: rotationKey,
    scheduled_rotation_key: scheduledKey,
    next_rotation_at: nextRotationAt,
    timezone: 'Asia/Kathmandu',
  };
};

const createDeterministicOrder = (productIds = [], rotationKey = '') =>
  [...new Set(productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    .map((id) => ({
      id,
      rank: crypto
        .createHash('sha256')
        .update(`${rotationKey}:${id}`)
        .digest('hex'),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank) || left.id - right.id)
    .map(({ id }) => id);

const hasDashboardRotationSchema = () => hasTable(SETTINGS_TABLE);

const loadDashboardRotationSettings = async () => {
  if (!(await hasDashboardRotationSchema())) {
    return { ...normalizeSettings(DEFAULT_SETTINGS), management_available: false };
  }

  const rows = await query(
    `SELECT enabled, rotations_per_day, rotation_times, in_stock_only,
            locked, locked_rotation_key, manual_revision, updated_at, updated_by
     FROM ${SETTINGS_TABLE}
     WHERE id = 1
     LIMIT 1`
  );

  return {
    ...normalizeSettings(rows[0] || DEFAULT_SETTINGS),
    management_available: true,
  };
};

const loadRotatableProductIds = async (settings) => {
  const [supportsIsDeleted, supportsIsVisible, supportsQuantity] = await Promise.all([
    hasColumn('finished_goods', 'is_deleted'),
    hasColumn('finished_goods', 'is_visible'),
    hasColumn('finished_goods', 'quantity'),
  ]);
  const conditions = [];
  if (supportsIsDeleted) conditions.push('is_deleted = 0');
  if (supportsIsVisible) conditions.push('is_visible = 1');
  if (settings.in_stock_only && supportsQuantity) {
    conditions.push('COALESCE(quantity, 0) > 0');
  }

  const rows = await query(
    `SELECT id
     FROM finished_goods
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY id ASC`
  );
  return rows.map((row) => Number(row.id));
};

const getDashboardRotationState = async (date = new Date()) => {
  const settings = await loadDashboardRotationSettings();
  const window = getRotationWindow(settings, date);
  const productIds = await loadRotatableProductIds(settings);
  const orderedIds = settings.enabled
    ? createDeterministicOrder(productIds, window.rotation_key)
    : productIds;

  return {
    settings: {
      enabled: settings.enabled,
      rotations_per_day: settings.rotations_per_day,
      rotation_times: settings.rotation_times,
      in_stock_only: settings.in_stock_only,
      locked: settings.locked,
      updated_at: settings.updated_at,
      updated_by: settings.updated_by,
    },
    management_available: settings.management_available,
    rotation_key: window.rotation_key,
    next_rotation_at: window.next_rotation_at,
    timezone: window.timezone,
    ordered_ids: orderedIds,
  };
};

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_TABLE,
  createDeterministicOrder,
  getDashboardRotationState,
  getRotationWindow,
  hasDashboardRotationSchema,
  loadDashboardRotationSettings,
  normalizeSettings,
  parseRotationTimes,
};
