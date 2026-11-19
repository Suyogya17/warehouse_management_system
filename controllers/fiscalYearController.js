const auditLog = require('../utils/auditLog');
const { hasTable } = require('../utils/schemaSupport');
const {
  FISCAL_YEAR_TABLE,
  backfillFiscalYears,
  createFiscalYear,
  listFiscalYears,
  setFiscalYearState,
} = require('../services/fiscalYearService');

const migrationRequired = (res) =>
  res.status(409).json({
    success: false,
    message: 'Fiscal-year management is not enabled yet. Apply database migration 0003.',
  });

const requireSchema = async (res) => {
  if (await hasTable(FISCAL_YEAR_TABLE)) return true;
  migrationRequired(res);
  return false;
};

const actor = (req) => ({
  userId: req.user?.id,
  userName: req.user?.name,
  userRole: req.user?.role,
  ipAddress: req.ip,
});

const getFiscalYears = async (req, res, next) => {
  try {
    const available = await hasTable(FISCAL_YEAR_TABLE);
    return res.json({
      success: true,
      management_available: available,
      data: available ? await listFiscalYears({ includeCounts: true }) : [],
    });
  } catch (error) {
    next(error);
  }
};

const addFiscalYear = async (req, res, next) => {
  try {
    if (!(await requireSchema(res))) return;
    const id = await createFiscalYear(req.body, req.user?.id || null);
    await auditLog({
      ...actor(req),
      actionType: 'CREATE',
      module: 'fiscal_years',
      entity_type: 'fiscal_year',
      entity_id: id,
      entityName: req.body?.code,
      description: `Created fiscal year ${req.body?.code}`,
      metadata: req.body,
    });
    return res.status(201).json({
      success: true,
      message: 'Fiscal year created.',
      data: await listFiscalYears({ includeCounts: true }),
    });
  } catch (error) {
    next(error);
  }
};

const updateFiscalYearState = async (req, res, next) => {
  try {
    if (!(await requireSchema(res))) return;
    const previous = await setFiscalYearState(req.params.id, req.body);
    await auditLog({
      ...actor(req),
      actionType: 'UPDATE',
      module: 'fiscal_years',
      entity_type: 'fiscal_year',
      entity_id: Number(req.params.id),
      entityName: previous.code,
      description: `Updated fiscal year ${previous.code}`,
      metadata: {
        previous_status: previous.previous_status,
        previous_is_locked: previous.previous_is_locked,
        status: previous.status,
        is_locked: previous.is_locked,
      },
    });
    return res.json({
      success: true,
      message: 'Fiscal-year state updated.',
      data: await listFiscalYears({ includeCounts: true }),
    });
  } catch (error) {
    next(error);
  }
};

const backfillFiscalYearData = async (req, res, next) => {
  try {
    if (!(await requireSchema(res))) return;
    const summary = await backfillFiscalYears();
    const updated = summary.reduce((total, item) => total + item.updated, 0);
    await auditLog({
      ...actor(req),
      actionType: 'UPDATE',
      module: 'fiscal_years',
      entity_type: 'fiscal_year_backfill',
      description: `Backfilled fiscal years on ${updated} records`,
      metadata: { summary },
    });
    return res.json({
      success: true,
      message: `Fiscal year assigned to ${updated} existing records.`,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addFiscalYear,
  backfillFiscalYearData,
  getFiscalYears,
  updateFiscalYearState,
};
