const { query } = require("../config/db");
const { hasTable } = require("../utils/schemaSupport");

const allowedSurfaces = new Set(["GALLERY", "OFFER_GALLERY", "OFFERS", "OUR_PRODUCTS"]);

const normalizeSurface = (value) => {
  const surface = String(value || "").trim().toUpperCase();
  return allowedSurfaces.has(surface) ? surface : "OUR_PRODUCTS";
};

const trackingReady = async () => hasTable("product_interest_events");

const recordSearch = async (req, res, next) => {
  try {
    if (!(await trackingReady())) {
      return res.status(202).json({ success: true, recorded: false, migration_required: true });
    }

    const searchTerm = String(req.body?.search_term || "").trim().slice(0, 160);
    const resultCount = Math.max(0, Number.parseInt(req.body?.result_count, 10) || 0);
    if (searchTerm.length < 2) {
      return res.status(202).json({ success: true, recorded: false });
    }

    await query(
      `INSERT INTO product_interest_events
         (user_id, event_type, surface, search_term, result_count)
       VALUES (?, 'SEARCH', ?, ?, ?)`,
      [req.user.id, normalizeSurface(req.body?.surface), searchTerm, resultCount]
    );

    return res.status(201).json({ success: true, recorded: true });
  } catch (error) {
    next(error);
  }
};

const recordProductInterest = async (req, res, next) => {
  try {
    if (!(await trackingReady())) {
      return res.status(202).json({ success: true, recorded: false, migration_required: true });
    }

    const productId = Number(req.body?.finished_good_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, message: "Valid product id required" });
    }

    await query(
      `INSERT INTO product_interest_events
         (user_id, event_type, surface, search_term, finished_good_id, result_count)
       SELECT ?, 'PRODUCT_INTEREST', ?, ?, fg.id, 1
       FROM finished_goods fg
       WHERE fg.id = ? AND fg.is_deleted = 0`,
      [
        req.user.id,
        normalizeSurface(req.body?.surface),
        String(req.body?.search_term || "").trim().slice(0, 160) || null,
        productId,
      ]
    );

    return res.status(201).json({ success: true, recorded: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { recordSearch, recordProductInterest };
