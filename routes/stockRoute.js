const router = require('express').Router();
const ctrl = require('../controllers/stockController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.use(authenticate);

// GET  /api/stock/summary                    - full stock summary + low-stock alerts
router.get('/summary', cacheResponse(10000), ctrl.getStockSummary);

// GET  /api/stock/batches/:raw_material_id   - FIFO batches for a material
router.get('/batches/:raw_material_id', cacheResponse(10000), ctrl.getBatchesForMaterial);

// POST /api/stock/receive                    - receive new stock (purchase/delivery)
router.post('/receive', authorize('ADMIN', 'CO_ADMIN'), ctrl.receiveStock);

router.put('/batch/:id', authorize('ADMIN', 'CO_ADMIN'), ctrl.updateStockBatch);
router.delete('/batch/:id', authorize('ADMIN', 'CO_ADMIN'), ctrl.deleteStockBatch);

module.exports = router;    
