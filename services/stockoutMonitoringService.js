const { query } = require('../config/db');
const { hasTable } = require('../utils/schemaSupport');

const STOCKOUT_WARNING_THRESHOLD = 2;
const STOCKOUT_CRITICAL_THRESHOLD = 5;

const getStockoutSeverity = (cyclesSinceCheck) => {
  const cycles = Math.max(0, Number(cyclesSinceCheck || 0));
  if (cycles >= STOCKOUT_CRITICAL_THRESHOLD) return 'CRITICAL';
  if (cycles >= STOCKOUT_WARNING_THRESHOLD) return 'WARNING';
  return 'MONITORING';
};

const hasStockoutMonitoringSchema = async () => {
  const [hasEvents, hasChecks] = await Promise.all([
    hasTable('finished_good_stockout_events'),
    hasTable('finished_good_physical_checks'),
  ]);
  return hasEvents && hasChecks;
};

const buildInClause = (values = []) => ({
  clause: `(${values.map(() => '?').join(',') || '-1'})`,
  params: values,
});

const loadStockoutMonitoring = async (productIds = []) => {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))];
  if (!ids.length || !(await hasStockoutMonitoringSchema())) return new Map();

  const { clause, params } = buildInClause(ids);
  const [eventRows, checkRows] = await Promise.all([
    query(
      `SELECT stockout_event.finished_good_id,
              COUNT(*) AS total_stockout_count,
              MAX(stockout_event.id) AS last_stockout_event_id,
              MAX(stockout_event.occurred_at) AS last_stockout_at,
              SUM(
                CASE
                  WHEN stockout_event.id > COALESCE(latest_check.last_stockout_event_id, 0)
                  THEN 1 ELSE 0
                END
              ) AS stockout_cycles_since_check
       FROM finished_good_stockout_events stockout_event
       LEFT JOIN (
         SELECT physical_check.finished_good_id,
                physical_check.last_stockout_event_id
         FROM finished_good_physical_checks physical_check
         JOIN (
           SELECT finished_good_id, MAX(id) AS latest_id
           FROM finished_good_physical_checks
           GROUP BY finished_good_id
         ) latest ON latest.latest_id = physical_check.id
       ) latest_check
         ON latest_check.finished_good_id = stockout_event.finished_good_id
       WHERE stockout_event.finished_good_id IN ${clause}
       GROUP BY stockout_event.finished_good_id, latest_check.last_stockout_event_id`,
      params
    ),
    query(
      `SELECT physical_check.finished_good_id,
              physical_check.checked_at AS last_physical_check_at,
              physical_check.note AS last_physical_check_note,
              checker.name AS last_physical_check_by
       FROM finished_good_physical_checks physical_check
       JOIN (
         SELECT finished_good_id, MAX(id) AS latest_id
         FROM finished_good_physical_checks
         WHERE finished_good_id IN ${clause}
         GROUP BY finished_good_id
       ) latest ON latest.latest_id = physical_check.id
       LEFT JOIN users checker ON checker.id = physical_check.checked_by`,
      params
    ),
  ]);

  const monitoring = new Map();
  ids.forEach((id) => {
    monitoring.set(id, {
      total_stockout_count: 0,
      stockout_cycles_since_check: 0,
      stockout_severity: 'MONITORING',
      physical_check_required: false,
      last_stockout_at: null,
      last_stockout_event_id: null,
      last_physical_check_at: null,
      last_physical_check_by: null,
    });
  });

  eventRows.forEach((row) => {
    const id = Number(row.finished_good_id);
    const cycles = Number(row.stockout_cycles_since_check || 0);
    monitoring.set(id, {
      ...monitoring.get(id),
      total_stockout_count: Number(row.total_stockout_count || 0),
      stockout_cycles_since_check: cycles,
      stockout_severity: getStockoutSeverity(cycles),
      physical_check_required: cycles >= STOCKOUT_CRITICAL_THRESHOLD,
      last_stockout_at: row.last_stockout_at || null,
      last_stockout_event_id: row.last_stockout_event_id
        ? Number(row.last_stockout_event_id)
        : null,
    });
  });

  checkRows.forEach((row) => {
    const id = Number(row.finished_good_id);
    monitoring.set(id, {
      ...monitoring.get(id),
      last_physical_check_at: row.last_physical_check_at || null,
      last_physical_check_by: row.last_physical_check_by || null,
    });
  });

  return monitoring;
};

module.exports = {
  STOCKOUT_WARNING_THRESHOLD,
  STOCKOUT_CRITICAL_THRESHOLD,
  getStockoutSeverity,
  hasStockoutMonitoringSchema,
  loadStockoutMonitoring,
};
