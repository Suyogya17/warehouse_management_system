const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const {
  getCatalogueDownload,
  streamCatalogueJpgDownload,
  streamWhatsAppCatalogueDownload,
} = require('../services/cataloguePdfService');
const { query } = require('../config/db');
const { hasColumn, hasTable } = require('../utils/schemaSupport');

const filterByProductType = (products, requestedType) => {
  const productType = String(requestedType || 'all').trim().toLowerCase();

  if (productType === 'percentage') {
    return products.filter((product) => Number(product.is_commission) === 1);
  }
  if (productType === 'non_commission') {
    return products.filter((product) => Number(product.is_commission) === 0);
  }
  return products;
};

const filterDealerOpenProducts = async (products) => {
  const productIds = products
    .map((product) => Number(product.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!productIds.length) return [];

  const [supportsPermissions, supportsAllocationQuantity, supportsPublication] =
    await Promise.all([
      hasTable('user_product_permissions'),
      hasColumn('user_product_permissions', 'allocation_quantity'),
      Promise.all([
        hasColumn('finished_goods', 'allocation_publication_status'),
        hasColumn('finished_goods', 'allocation_publish_at'),
      ]).then((columns) => columns.every(Boolean)),
    ]);
  if (!supportsPermissions) return [];

  const placeholders = productIds.map(() => '?').join(',');
  const publicationSql =
    supportsAllocationQuantity && supportsPublication
      ? `AND (
          NOT EXISTS (
            SELECT 1
            FROM user_product_permissions allocated
            WHERE allocated.finished_good_id = fg.id
              AND allocated.allocation_quantity IS NOT NULL
          )
          OR COALESCE(fg.allocation_publication_status, 'DRAFT') = 'ACTIVE'
          OR (
            fg.allocation_publication_status = 'SCHEDULED'
            AND fg.allocation_publish_at <= NOW()
          )
        )`
      : '';
  const result = await query(
    `SELECT DISTINCT fg.id
     FROM finished_goods fg
     JOIN user_product_permissions upp
       ON upp.finished_good_id = fg.id
      AND upp.can_view = 1
     JOIN users dealer
       ON dealer.id = upp.user_id
      AND dealer.role IN ('USER', 'ELDER', 'MEMBER')
     WHERE fg.id IN (${placeholders})
       AND fg.is_visible = 1
       AND NOT EXISTS (
         SELECT 1
         FROM user_product_permissions denied
         WHERE denied.finished_good_id = fg.id
           AND denied.user_id = dealer.id
           AND denied.can_view = 0
       )
       ${publicationSql}`,
    productIds
  );
  const openProductIds = new Set(result.rows.map((row) => Number(row.id)));
  return products.filter((product) => openProductIds.has(Number(product.id)));
};

const download = async (req, res, next) => {
  try {
    const mode = req.query.mode === 'offers' ? 'offers' : 'products';
    const scope = ['filtered', 'series', 'all'].includes(req.query.scope)
      ? req.query.scope
      : 'filtered';
    const quality = req.query.quality === 'high' ? 'high' : 'standard';
    const format = req.query.format === 'jpg' ? 'jpg' : 'pdf';

    if (format === 'jpg' && !['ADMIN', 'CO_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can download the JPG collage catalogue',
      });
    }

    if (mode === 'offers' && req.user.role === 'MEMBER') {
      return res.status(403).json({
        success: false,
        message: 'Offer catalogue access is not available for this account',
      });
    }

    if (scope === 'series' && !String(req.query.series || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Select a series before downloading the series catalogue',
      });
    }

    const catalogueRequest =
      format === 'jpg' && ['ADMIN', 'CO_ADMIN'].includes(req.user.role)
        ? {
            ...req,
            query: {
              ...req.query,
              // A generic admin JPG catalogue represents products currently
              // open to dealers. Hidden/draft products remain available only
              // through admin screens, not in the dealer catalogue export.
              include_hidden: '0',
            },
          }
        : req;
    let products = filterByProductType(
      await loadAvailabilityForRequest(catalogueRequest, {
        offerView: mode === 'offers',
      }),
      req.query.product_type
    );
    if (format === 'jpg') {
      products = await filterDealerOpenProducts(products);
      await streamCatalogueJpgDownload(
        products,
        {
          mode,
          scope,
          quality,
          format,
          series: req.query.series,
          search: req.query.search,
          stock: req.query.stock,
          productType: String(req.query.product_type || 'all').toLowerCase(),
          userId: req.user.id,
          role: req.user.role,
        },
        res
      );
      return undefined;
    }
    const file = await getCatalogueDownload(products, {
      mode,
      scope,
      quality,
      format,
      series: req.query.series,
      search: req.query.search,
      stock: req.query.stock,
      userId: req.user.id,
      role: req.user.role,
    });

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Catalogue-Cache', file.cacheHit ? 'HIT' : 'MISS');
    return res.sendFile(file.path);
  } catch (error) {
    if (res.headersSent) {
      console.error('Catalogue stream failed:', error);
      if (!res.destroyed) res.destroy(error);
      return undefined;
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    console.error('Catalogue generation failed:', error);
    const errorMessages = {
      MODULE_NOT_FOUND:
        'A catalogue dependency is missing. Run npm install in the backend application and restart Node.js.',
      ERR_MODULE_NOT_FOUND:
        'A catalogue dependency is missing. Run npm install in the backend application and restart Node.js.',
      EACCES:
        'The backend cannot prepare catalogue files. Check folder ownership and write permission.',
      EPERM:
        'The backend cannot prepare catalogue files. Check folder ownership and write permission.',
      ENOSPC:
        'The server has insufficient disk space to prepare the catalogue.',
    };
    return res.status(500).json({
      success: false,
      code: error.code || 'CATALOGUE_GENERATION_FAILED',
      message:
        errorMessages[error.code] ||
        error.message ||
        'Could not prepare the catalogue download',
    });
  }
};

const downloadWhatsApp = async (req, res, next) => {
  try {
    if (!['ADMIN', 'CO_ADMIN'].includes(String(req.user.role).toUpperCase())) {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can prepare a dealer WhatsApp catalogue',
      });
    }

    const dealerUserId = Number(req.query.dealer_user_id);
    if (!Number.isInteger(dealerUserId) || dealerUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Select a dealer before downloading the WhatsApp catalogue',
      });
    }

    const dealerResult = await query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = ? AND role IN ('USER', 'ELDER', 'MEMBER')
       LIMIT 1`,
      [dealerUserId]
    );
    const dealer = dealerResult.rows[0];
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'The selected dealer account was not found',
      });
    }

    // Run the same visibility/allocation calculation that the selected dealer sees.
    // Admin include_hidden must not leak into a personalised dealer catalogue.
    const dealerRequest = {
      ...req,
      user: dealer,
      query: {
        ...req.query,
        include_hidden: '0',
        offer_view: req.query.mode === 'offers' ? '1' : '0',
      },
    };
    const products = filterByProductType(
      await loadAvailabilityForRequest(dealerRequest, {
        offerView: req.query.mode === 'offers',
      }),
      req.query.product_type
    );
    await streamWhatsAppCatalogueDownload(products, {
      mode: req.query.mode === 'offers' ? 'offers' : 'products',
      series: req.query.series,
      search: req.query.search,
      minimumCartons: 1,
      userId: dealer.id,
      dealerName: dealer.name,
    }, res);
    return undefined;
  } catch (error) {
    if (res.headersSent) {
      console.error('WhatsApp catalogue stream failed:', error);
      if (!res.destroyed) res.destroy(error);
      return undefined;
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    console.error('WhatsApp catalogue generation failed:', error);
    const errorMessages = {
      MODULE_NOT_FOUND:
        'A catalogue dependency is missing. Run npm install in the backend application and restart Node.js.',
      ERR_MODULE_NOT_FOUND:
        'A catalogue dependency is missing. Run npm install in the backend application and restart Node.js.',
      EACCES:
        'The backend cannot write the catalogue files. Check folder ownership and write permission.',
      EPERM:
        'The backend cannot write the catalogue files. Check folder ownership and write permission.',
      ENOSPC:
        'The server has insufficient disk space to prepare the catalogue.',
    };
    return res.status(500).json({
      success: false,
      code: error.code || 'CATALOGUE_GENERATION_FAILED',
      message:
        errorMessages[error.code] ||
        error.message ||
        'Could not prepare the WhatsApp catalogue',
    });
  }
};

module.exports = { download, downloadWhatsApp };
