const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { getAdjustments, createAdjustment, deleteAdjustment } = require('../controllers/stockAdjustmentController');

router.get('/',       authenticate, getAdjustments);
router.post('/',      authenticate, createAdjustment);
router.delete('/:id', authenticate, authorize('ADMIN', 'CO_ADMIN'), deleteAdjustment);

module.exports = router;