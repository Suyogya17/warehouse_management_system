const { loadAvailabilityForRequest } = require('../utils/catalogueAvailability');
const { getCatalogueDownload } = require('../services/cataloguePdfService');

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
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

module.exports = { download };
