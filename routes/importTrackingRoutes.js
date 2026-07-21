const router = require('express').Router();
const ctrl = require('../controllers/importTrackingController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);
router.use(authorize('ADMIN', 'CO_ADMIN'));

router.get('/', ctrl.getAll);
router.get('/report', ctrl.getReport);
router.post('/:id/items/:itemId/create-raw-material', ctrl.createRawMaterialFromItem);
router.post('/:id/items/:itemId/receive-stock', ctrl.receiveItemStock);
router.put('/:id/items/:itemId/splits', ctrl.saveItemSplits);
router.post('/:id/items/:itemId/splits/:splitId/add-to-raw-material', ctrl.addSplitToRawMaterial);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
