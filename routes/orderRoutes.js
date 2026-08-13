const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.use(authenticate);

router.get('/filters', cacheResponse(30000), ctrl.getFilters);
router.get('/', cacheResponse(10000), ctrl.getAll);
router.get('/availability', cacheResponse(15000), ctrl.getAvailability);
router.get('/offer-purchases', authorize('ADMIN', 'CO_ADMIN'), cacheResponse(5000), ctrl.getOfferPurchases);
router.post('/', authorize('ADMIN','CO_ADMIN', 'USER'), ctrl.create);
router.put('/:id/items', authorize('ADMIN', 'CO_ADMIN'), ctrl.correctItems);
router.put('/:id/status', authorize('ADMIN', 'CO_ADMIN'), ctrl.updateStatus);
router.put('/:id/delivery-note', authorize('ADMIN', 'CO_ADMIN'), ctrl.assignDeliveryNote);
router.put('/:id/delivery-note/correct-numbers', authorize('ADMIN', 'CO_ADMIN'), ctrl.correctWarehouseDeliveryNoteNumbers);
router.post('/:id/delivery-note/prepare', authorize('ADMIN', 'CO_ADMIN'), ctrl.prepareDeliveryNote);
router.put('/:id/warehouse-fulfillments/:warehouseId/verify', authorize('ADMIN', 'CO_ADMIN'), ctrl.verifyWarehouseFulfillment);
router.put('/:id/warehouse-fulfillments/:warehouseId/deliver', authorize('ADMIN', 'CO_ADMIN'), ctrl.deliverWarehouseFulfillment);
router.put('/:id/warehouse-fulfillments/:warehouseId/undo-delivery', authorize('ADMIN', 'CO_ADMIN'), ctrl.undoWarehouseFulfillmentDelivery);
router.put('/:id/reopen-packing', authorize('ADMIN', 'CO_ADMIN'), ctrl.reopenPacking);
router.put('/:id/undo-confirmation', authorize('ADMIN', 'CO_ADMIN'), ctrl.undoConfirmation);
router.post('/:id/print', authorize('ADMIN', 'CO_ADMIN'), ctrl.logPrint);

module.exports = router;
