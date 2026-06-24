const router = require("express").Router();
const ctrl = require("../controllers/analyticsController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const { cacheResponse } = require("../middleware/cacheMiddleware");

router.use(authenticate);
router.use(authorize("ADMIN", "CO_ADMIN"));

router.get("/dashboard", cacheResponse(5000), ctrl.getDashboard);
router.get("/inventory", cacheResponse(5000), ctrl.getInventory);
router.get("/production", cacheResponse(5000), ctrl.getProduction);
router.get("/sales", cacheResponse(5000), ctrl.getSales);
router.get("/dealers", cacheResponse(5000), ctrl.getDealers);

module.exports = router;
