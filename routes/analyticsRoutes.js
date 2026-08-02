const router = require("express").Router();
const ctrl = require("../controllers/analyticsController");
const productIntelligence = require("../controllers/productIntelligenceController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const { cacheResponse } = require("../middleware/cacheMiddleware");

router.use(authenticate);
router.use(authorize("ADMIN", "CO_ADMIN"));

router.get("/dashboard", cacheResponse(30000), ctrl.getDashboard);
router.get("/inventory", cacheResponse(30000), ctrl.getInventory);
router.get("/products", cacheResponse(15000), productIntelligence.getProducts);
router.get("/production", cacheResponse(30000), ctrl.getProduction);
router.get("/sales", cacheResponse(30000), ctrl.getSales);
router.get("/sales/product/:id", cacheResponse(15000), ctrl.getProductSales);
router.get("/dealers/product-orders", cacheResponse(15000), ctrl.getDealerProductOrders);
router.get("/dealers/detail", cacheResponse(15000), ctrl.getDealerDetail);
router.get("/dealers", cacheResponse(30000), ctrl.getDealers);
router.get("/users", cacheResponse(30000), ctrl.getUsers);
router.get("/support", cacheResponse(30000), ctrl.getSupport);

module.exports = router;
