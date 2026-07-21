const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.use(authenticate);

router.get('/', cacheResponse(5000), ctrl.getAll);
router.get('/availability', cacheResponse(5000), ctrl.getAvailability);
router.post('/', authorize('ADMIN','CO_ADMIN', 'USER'), ctrl.create);
router.put('/:id/items', authorize('ADMIN', 'CO_ADMIN'), ctrl.correctItems);
router.put('/:id/status', authorize('ADMIN', 'CO_ADMIN'), ctrl.updateStatus);
router.put('/:id/reopen-packing', authorize('ADMIN', 'CO_ADMIN'), ctrl.reopenPacking);
router.post('/:id/print', authorize('ADMIN', 'CO_ADMIN'), ctrl.logPrint);

module.exports = router;
