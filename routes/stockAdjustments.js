const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getAdjustments, createAdjustment, deleteAdjustment } = require('../controllers/stockAdjustmentController');
const { cacheResponse } = require('../middleware/cacheMiddleware');

router.get('/',       authenticate, cacheResponse(10000), getAdjustments);
router.post('/',      authenticate, createAdjustment);
router.delete('/:id', authenticate, authorize('ADMIN', 'CO_ADMIN'), deleteAdjustment);

module.exports = router;
