const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/catalogueController');

router.use(authenticate);
router.get(
  '/download',
  authorize('ADMIN', 'CO_ADMIN', 'MEMBER', 'USER', 'ELDER'),
  controller.download
);
router.get(
  '/whatsapp-download',
  authorize('ADMIN', 'CO_ADMIN'),
  controller.downloadWhatsApp
);

module.exports = router;
