const router = require('express').Router();
const controller = require('../controllers/fiscalYearController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);
router.get('/', controller.getFiscalYears);
router.post('/', authorize('ADMIN'), controller.addFiscalYear);
router.patch('/:id/state', authorize('ADMIN'), controller.updateFiscalYearState);
router.post('/backfill', authorize('ADMIN'), controller.backfillFiscalYearData);

module.exports = router;
