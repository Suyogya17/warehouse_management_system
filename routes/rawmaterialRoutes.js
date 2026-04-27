const router = require('express').Router();
const ctrl = require('../controllers/rawmaterialController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(authenticate);

// GET  /api/raw-materials          - list all (with filters ?category=&low_stock=true)
router.get('/',        ctrl.getAll);

// GET  /api/raw-materials/:id      - single material
router.get('/:id',     ctrl.getOne);

// POST /api/raw-materials          - create (ADMIN, STORE_KEEPER)
router.post('/',       authorize('ADMIN', 'STORE_KEEPER'), upload.single('image'), ctrl.create);

// PUT  /api/raw-materials/:id      - update name/unit/min_qty (ADMIN, STORE_KEEPER)
router.put('/:id',     authorize('ADMIN', 'STORE_KEEPER'), upload.single('image'), ctrl.update);

// DELETE /api/raw-materials/:id    - delete (ADMIN only)
router.delete('/:id',  authorize('ADMIN'), ctrl.remove);

module.exports = router;
