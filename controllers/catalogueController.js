const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const {
  getCatalogueDownload,
  streamWhatsAppCatalogueDownload,
} = require('../services/cataloguePdfService');
const { query } = require('../config/db');

const download = async (req, res, next) => {
  try {
    const mode = req.query.mode === 'offers' ? 'offers' : 'products';
    const scope = ['filtered', 'series', 'all'].includes(req.query.scope)
      ? req.query.scope
      : 'filtered';
    const quality = req.query.quality === 'high' ? 'high' : 'standard';

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

    const products = await loadAvailabilityForRequest(req, {
      offerView: mode === 'offers',
    });
    const file = await getCatalogueDownload(products, {
      mode,
      scope,
      quality,
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
    next(error);
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
    const products = await loadAvailabilityForRequest(dealerRequest, {
      offerView: req.query.mode === 'offers',
    });
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
