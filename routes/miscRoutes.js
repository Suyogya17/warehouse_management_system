// ── Finished Goods ────────────────────────────────────────────────────────────
const fgRouter = require('express').Router();
const fgCtrl   = require('../controllers/finishedgoodscontroller');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

fgRouter.use(authenticate);
fgRouter.get('/',       fgCtrl.getAll);
fgRouter.get('/:id',    fgCtrl.getOne);
fgRouter.post('/',      authorize('ADMIN'), upload.single('image'), fgCtrl.create);
fgRouter.put('/:id/visibility', authorize('ADMIN'), fgCtrl.setVisibility);
fgRouter.put('/:id',    authorize('ADMIN'), upload.single('image'), fgCtrl.update);
fgRouter.delete('/:id', authorize('ADMIN'), fgCtrl.remove);

// ── Consumption Logs ──────────────────────────────────────────────────────────
const consumptionRouter = require('express').Router();
const consumptionCtrl   = require('../controllers/consumptionController');

consumptionRouter.use(authenticate);
consumptionRouter.get('/',  consumptionCtrl.getAll);
consumptionRouter.post('/', authorize('ADMIN', 'STORE_KEEPER'), consumptionCtrl.logConsumption);

// ── Audit Logs ────────────────────────────────────────────────────────────────
const auditRouter = require('express').Router();
const auditCtrl   = require('../controllers/auditController');

auditRouter.use(authenticate);
auditRouter.get('/', authorize('ADMIN'), auditCtrl.getAll);

module.exports = { fgRouter, consumptionRouter, auditRouter };
