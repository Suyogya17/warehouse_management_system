const router = require('express').Router();
const controller = require('../controllers/advertisementController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { uploadMiddleware } = require('../middleware/upload');

router.use(authenticate);
router.get('/', controller.getAll);
router.post('/', authorize('ADMIN', 'CO_ADMIN'), uploadMiddleware('image'), controller.create);
router.put('/reorder', authorize('ADMIN', 'CO_ADMIN'), controller.reorder);
router.put('/:id', authorize('ADMIN', 'CO_ADMIN'), uploadMiddleware('image'), controller.update);
router.delete('/:id', authorize('ADMIN', 'CO_ADMIN'), controller.remove);

module.exports = router;
