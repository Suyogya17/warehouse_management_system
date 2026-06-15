const router = require('express').Router();
const ctrl = require('../controllers/warehouseController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.use(authenticate);

router.get('/', cacheResponse(10000), ctrl.getAll);
router.get('/stock', cacheResponse(5000), ctrl.getStock);
router.get('/movements', cacheResponse(10000), ctrl.getMovements);

router.post('/', authorize('ADMIN', 'CO_ADMIN'), ctrl.create);
router.put('/:id', authorize('ADMIN', 'CO_ADMIN'), ctrl.update);
router.delete('/:id', authorize('ADMIN', 'CO_ADMIN'), ctrl.remove);

router.post('/adjust', authorize('ADMIN', 'CO_ADMIN'), ctrl.adjust);
router.post('/transfer', authorize('ADMIN', 'CO_ADMIN'), ctrl.transfer);

module.exports = router;
