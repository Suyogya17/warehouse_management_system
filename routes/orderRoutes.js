const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/availability', ctrl.getAvailability);
router.post('/', authorize('ADMIN', 'USER'), ctrl.create);
router.put('/:id/status', authorize('ADMIN'), ctrl.updateStatus);

module.exports = router;
