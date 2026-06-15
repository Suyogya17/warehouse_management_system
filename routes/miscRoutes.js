// ── Finished Goods ────────────────────────────────────────────────────────────
const fgRouter = require('express').Router();
const fgCtrl   = require('../controllers/finishedgoodscontroller');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { uploadMiddleware } = require('../middleware/upload');
const { cacheResponse } = require('../middleware/cacheMiddleware');

fgRouter.use(authenticate);
fgRouter.get('/',       cacheResponse(15000), fgCtrl.getAll);
fgRouter.put('/display-order', authorize('ADMIN', 'CO_ADMIN'), fgCtrl.setDisplayOrder);
fgRouter.get('/:id',    cacheResponse(15000), fgCtrl.getOne);
fgRouter.post('/',      authorize('ADMIN', 'CO_ADMIN'), uploadMiddleware('image'), fgCtrl.create);
fgRouter.put('/:id/visibility', authorize('ADMIN', 'CO_ADMIN'), fgCtrl.setVisibility);
fgRouter.put('/:id',    authorize('ADMIN', 'CO_ADMIN'), uploadMiddleware('image'), fgCtrl.update);
fgRouter.delete('/:id', authorize('ADMIN', 'CO_ADMIN'), fgCtrl.remove);

// ── Consumption Logs ──────────────────────────────────────────────────────────
const consumptionRouter = require('express').Router();
const consumptionCtrl   = require('../controllers/consumptionController');

consumptionRouter.use(authenticate);
consumptionRouter.get('/',  cacheResponse(10000), consumptionCtrl.getAll);
consumptionRouter.post('/', authorize('ADMIN', 'CO_ADMIN'), consumptionCtrl.logConsumption);

// ── Audit Logs ────────────────────────────────────────────────────────────────
const auditRouter = require('express').Router();
const auditCtrl   = require('../controllers/auditController');

auditRouter.use(authenticate);
auditRouter.get('/', authorize('ADMIN', 'CO_ADMIN'), auditCtrl.getAll);

module.exports = { fgRouter, consumptionRouter, auditRouter };
