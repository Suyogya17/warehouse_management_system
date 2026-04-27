const router = require('express').Router();
const ctrl = require('../controllers/productionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

// POST /api/production/check   - dry run: check if stock is sufficient (no deduction)
router.post('/check', ctrl.checkStock);

// POST /api/production/run     - execute production run (ADMIN, STORE_KEEPER)
router.post('/run', authorize('ADMIN', 'STORE_KEEPER'), ctrl.runProduction);

// GET  /api/production         - production history
router.get('/', ctrl.getHistory);

// GET  /api/production/:id     - single production run with items
router.get('/:id', ctrl.getOne);

module.exports = router;