const router = require("express").Router();
const controller = require("../controllers/productInterestController");
const { authenticate } = require("../middleware/authMiddleware");

router.use(authenticate);
router.post("/search", controller.recordSearch);
router.post("/product", controller.recordProductInterest);

module.exports = router;
