const router = require('express').Router();
const ctrl = require('../controllers/formulaController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

// GET  /api/formulas          - list all formulas with inputs
router.get('/',       ctrl.getAll);

// GET  /api/formulas/:id      - single formula with inputs
router.get('/:id',    ctrl.getOne);

// POST /api/formulas          - create formula + inputs (ADMIN only)
router.post('/',      authorize('ADMIN'), ctrl.create);

// DELETE /api/formulas/:id    - delete (ADMIN only)
router.delete('/:id', authorize('ADMIN'), ctrl.remove);

module.exports = router;