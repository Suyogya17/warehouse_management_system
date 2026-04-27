const router = require('express').Router();
const ctrl = require('../controllers/stockController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

// GET  /api/stock/summary                    - full stock summary + low-stock alerts
router.get('/summary', ctrl.getStockSummary);

// GET  /api/stock/batches/:raw_material_id   - FIFO batches for a material
router.get('/batches/:raw_material_id', ctrl.getBatchesForMaterial);

// POST /api/stock/receive                    - receive new stock (purchase/delivery)
router.post('/receive', authorize('ADMIN', 'STORE_KEEPER'), ctrl.receiveStock);

module.exports = router;