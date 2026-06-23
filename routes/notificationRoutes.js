const router = require('express').Router();
const controller = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);
router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/read', controller.markAllRead);
router.put('/:id/read', controller.markOneRead);

module.exports = router;
