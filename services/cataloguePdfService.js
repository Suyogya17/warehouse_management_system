  const fs = require('fs');
  const fsp = require('fs/promises');
  const path = require('path');
  const crypto = require('crypto');
  const PDFDocument = require('pdfkit');
  const sharp = require('sharp');

  const CACHE_ROOT = path.join(__dirname, '..', '.catalogue-cache');
  const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
  const CACHE_VERSION = 8;
  const STANDARD_IMAGE_OPTIONS = { width: 520, quality: 58 };
  const HIGH_IMAGE_OPTIONS = { width: 1200, quality: 88 };
  const ACTIVE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const CONTENT_TOP = 34;
  const CONTENT_BOTTOM = 798;
  const ARTICLE_HEADER_HEIGHT = 48;
  const ARTICLE_TILE_GAP = 14;
  const TILE_GAP = 11;
  const CONTENT_WIDTH = 523;
  const activeGenerations = new Map();

  const getSeriesName = (soleCode = '') =>
    String(soleCode)
      .replace(/[-_\s]*sole$/i, '')
      .trim();

  const isActiveOffer = (product = {}) =>
    Number(product.offer_enabled) === 1 &&
    (!product.offer_ends_at ||
      new Date(product.offer_ends_at).getTime() >= Date.now());

  const getVisiblePairs = (product = {}) =>
    Math.max(
      0,
      Number(
        product.display_stock ??
          product.available_qty ??
          product.physical_stock ??
          product.quantity ??
          0
      )
    );

  const safeName = (value, fallback = 'catalogue') => {
    const clean = String(value || '')
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return clean || fallback;
  };

  const groupProducts = (products = []) => {
    const groups = new Map();

    products.forEach((product) => {
      const series = getSeriesName(product.sole_code);
      const article = String(
        product.article_code || product.name || product.id
      ).trim();
      const key = `${series.toLowerCase()}::${article.toLowerCase()}`;

      if (!groups.has(key)) {
        groups.set(key, { series, article, variants: [] });
      }
      groups.get(key).variants.push(product);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        variants: group.variants.sort((left, right) =>
          String(left.color || '').localeCompare(String(right.color || ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        ),
      }))
      .sort(
        (left, right) =>
          left.series.localeCompare(right.series, undefined, {
            numeric: true,
            sensitivity: 'base',
          }) ||
          left.article.localeCompare(right.article, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
      );
  };

  const filterCatalogueProducts = (products, options) => {
    const mode = options.mode === 'offers' ? 'offers' : 'products';
    const scope = ['filtered', 'series', 'all'].includes(options.scope)
      ? options.scope
      : 'filtered';
    const requestedSeries = String(options.series || '').trim();
    const query = scope === 'filtered' ? String(options.search || '').trim().toLowerCase() : '';
    const stock = scope === 'filtered' ? String(options.stock || 'ALL').toUpperCase() : 'ALL';

    const modeProducts = products.filter((product) =>
      mode === 'offers' ? isActiveOffer(product) : !isActiveOffer(product)
    );
    const groups = groupProducts(modeProducts)
      .map((group) => ({
        ...group,
        variants:
          stock === 'IN_STOCK'
            ? group.variants.filter((variant) => getVisiblePairs(variant) > 0)
            : stock === 'OUT_OF_STOCK'
            ? group.variants.filter((variant) => getVisiblePairs(variant) <= 0)
            : group.variants,
      }))
      .filter((group) => {
        if (!group.variants.length) return false;
        const matchesSeries =
          scope === 'all' ||
          !requestedSeries ||
          group.series.toLowerCase() === requestedSeries.toLowerCase();
        const matchesSearch =
          !query ||
          group.variants.some((variant) =>
            [
              variant.article_code,
              variant.name,
              variant.sole_code,
              variant.color,
            ].some((value) => String(value || '').toLowerCase().includes(query))
          );

        return matchesSeries && matchesSearch;
      });

    return groups;
  };

  const resolveUploadPath = async (imageUrl) => {
    if (!imageUrl) return null;

    const filename = path.basename(String(imageUrl).split('?')[0]);
    const imagePath = path.join(UPLOAD_ROOT, filename);

    try {
      await fsp.access(imagePath, fs.constants.R_OK);
      return imagePath;
    } catch {
      return null;
    }
  };

  const loadCatalogueImage = async (product, quality, imageCache) => {
    const imagePath = await resolveUploadPath(product.image_url);
    if (!imagePath) return null;

    const options =
      quality === 'high' ? HIGH_IMAGE_OPTIONS : STANDARD_IMAGE_OPTIONS;
    const key = `${imagePath}:${options.width}:${options.quality}`;
    if (imageCache.has(key)) return imageCache.get(key);

    try {
      const image = await sharp(imagePath)
        .rotate()
        .resize({
          width: options.width,
          height: Math.round(options.width * 0.75),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: options.quality, mozjpeg: true })
        .toBuffer();
      imageCache.set(key, image);
      return image;
    } catch {
      imageCache.set(key, null);
      return null;
    }
  };

  const drawArticleHeader = (doc, group, y, continuation = false) => {
    doc.roundedRect(36, y, 523, ARTICLE_HEADER_HEIGHT, 8).fill('#020617');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(group.article, 52, y + 14, {
        width: 250,
        ellipsis: true,
      });
    doc
      .fillColor('#cbd5e1')
      .font('Helvetica')
      .fontSize(12)
      .text(
        `${group.series ? `${group.series} Series` : 'Product Series'}${
          continuation ? ' - continued' : ''
        }`,
        310,
        y + 17,
        { width: 230, align: 'right', ellipsis: true }
      );
  };

  const drawVariantTile = async (
    doc,
    product,
    x,
    y,
    width,
    height,
    quality,
    imageCache
  ) => {
    const pairs = getVisiblePairs(product);
    const color = String(product.color || 'Standard color');
    const size = String(product.size || '').trim();
    const variantLabel = size ? `${color} - Size ${size}` : color;
    const compact = width < 240 || height < 205;
    const tilePadding = compact ? 7 : 10;
    const headerHeight = compact ? 27 : 35;

    doc.roundedRect(x, y, width, height, 8).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(compact ? 8 : 12)
      .text(variantLabel, x + tilePadding, y + (compact ? 8 : 10), {
        width: width - (compact ? 65 : 92),
        ellipsis: true,
      });

    const statusText = pairs > 0 ? 'IN STOCK' : 'OUT';
    const statusWidth = pairs > 0 ? (compact ? 39 : 47) : compact ? 23 : 27;
    const statusHeight = compact ? 13 : 16;
    doc
      .roundedRect(
        x + width - statusWidth - tilePadding,
        y + (compact ? 7 : 9),
        statusWidth,
        statusHeight,
        statusHeight / 2
      )
      .fill(pairs > 0 ? '#d1fae5' : '#fee2e2');
    doc
      .fillColor(pairs > 0 ? '#047857' : '#b91c1c')
      .font('Helvetica-Bold')
      .fontSize(compact ? 5.5 : 7)
      .text(
        statusText,
        x + width - statusWidth - tilePadding,
        y + (compact ? 10.5 : 14),
        {
          width: statusWidth,
          align: 'center',
        }
      );

    const imageX = x + tilePadding;
    const imageY = y + headerHeight;
    const imageWidth = width - tilePadding * 2;
    const imageHeight = height - headerHeight - tilePadding;
    doc.roundedRect(imageX, imageY, imageWidth, imageHeight, 6).fill('#f1f5f9');

    const image = await loadCatalogueImage(product, quality, imageCache);
    if (image) {
      doc.image(image, imageX + 5, imageY + 5, {
        fit: [imageWidth - 10, imageHeight - 10],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc
        .fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(10)
        .text('No image', imageX, imageY + imageHeight / 2 - 5, {
          width: imageWidth,
          align: 'center',
        });
    }

  };

  const getArticleGrid = (variantCount) => {
    const count = Math.max(1, Number(variantCount || 1));
    let columns = 1;

    if (count > 3 && count <= 6) columns = 2;
    else if (count > 6 && count <= 12) columns = 3;
    else if (count > 12) columns = Math.ceil(Math.sqrt(count));

    const rows = Math.ceil(count / columns);
    const availableHeight =
      CONTENT_BOTTOM -
      (CONTENT_TOP + ARTICLE_HEADER_HEIGHT + ARTICLE_TILE_GAP);

    return {
      columns,
      rows,
      tileWidth: (CONTENT_WIDTH - (columns - 1) * TILE_GAP) / columns,
      tileHeight: (availableHeight - (rows - 1) * TILE_GAP) / rows,
    };
  };

  const addCoverPage = (doc, options, groups, generatedAt) => {
    const title =
      options.mode === 'offers' ? 'Offer Product Gallery' : 'All Product Gallery';

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8fafc');
    doc.roundedRect(46, 105, 503, 290, 18).fill('#020617');
    doc
      .fillColor('#94a3b8')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('NEPCHA WAREHOUSE', 76, 145, {
        width: 443,
        characterSpacing: 2,
      });
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(31)
      .text(title, 76, 185, { width: 443 });
    doc
      .fillColor('#cbd5e1')
      .font('Helvetica')
      .fontSize(14)
      .text(
        `${groups.length} article${groups.length === 1 ? '' : 's'} arranged by series and color`,
        76,
        245,
        { width: 410, lineGap: 5 }
      );
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(`Stock as of ${generatedAt.toLocaleString('en-GB')}`, 76, 340, {
        width: 410,
      });
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(10)
      .text(
        'Stock is a snapshot from the time this catalogue was generated. Check the live Gallery for the latest availability.',
        56,
        430,
        { width: 483, align: 'center', lineGap: 4 }
      );
  };

  const addPageNumbers = (doc, generatedAt) => {
    const range = doc.bufferedPageRange();

    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc
        .fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(8)
        .text(
          `Stock as of ${generatedAt.toLocaleString('en-GB')}  |  Page ${
            index + 1
          } of ${range.count}`,
          36,
          816,
          { width: 523, align: 'center', lineBreak: false }
        );
    }
  };

  const generatePdf = async (filePath, groups, options, sharedImageCache = new Map()) => {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const generatedAt = new Date();
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title:
          options.mode === 'offers'
            ? 'Nepcha Offer Product Gallery'
            : 'Nepcha Product Gallery',
        Author: 'Nepcha Warehouse',
      },
    });
    const output = fs.createWriteStream(filePath);
    doc.pipe(output);

    addCoverPage(doc, options, groups, generatedAt);

    for (const group of groups) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
      drawArticleHeader(doc, group, CONTENT_TOP);

      const grid = getArticleGrid(group.variants.length);
      const tileStartY =
        CONTENT_TOP + ARTICLE_HEADER_HEIGHT + ARTICLE_TILE_GAP;

      for (let index = 0; index < group.variants.length; index += 1) {
        const column = index % grid.columns;
        const row = Math.floor(index / grid.columns);

        await drawVariantTile(
          doc,
          group.variants[index],
          36 + column * (grid.tileWidth + TILE_GAP),
          tileStartY + row * (grid.tileHeight + TILE_GAP),
          grid.tileWidth,
          grid.tileHeight,
          options.quality,
          sharedImageCache
        );
      }
    }

    addPageNumbers(doc, generatedAt);
    doc.end();

    await new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  };

  const createZip = async (zipPath, groups, options) => {
    const { ZipArchive } = await import('archiver');
    const tempRoot = await fsp.mkdtemp(path.join(CACHE_ROOT, 'zip-'));
    const imageCache = new Map();

    try {
      const seriesGroups = new Map();
      groups.forEach((group) => {
        const key = group.series || 'Other';
        if (!seriesGroups.has(key)) seriesGroups.set(key, []);
        seriesGroups.get(key).push(group);
      });

      const pdfFiles = [];
      for (const [series, groupedArticles] of seriesGroups.entries()) {
        const filename = `${safeName(series, 'other')}-series.pdf`;
        const pdfPath = path.join(tempRoot, filename);
        await generatePdf(
          pdfPath,
          groupedArticles,
          { ...options, quality: 'high' },
          imageCache
        );
        pdfFiles.push({ filename, pdfPath });
      }

      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = new ZipArchive({ zlib: { level: 6 } });
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
        archive.pipe(output);
        pdfFiles.forEach(({ filename, pdfPath }) => archive.file(pdfPath, { name: filename }));
        archive.finalize();
      });
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }
  };

  const cleanupOldCache = async () => {
    try {
      const entries = await fsp.readdir(CACHE_ROOT, { withFileTypes: true });
      const now = Date.now();
      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filePath = path.join(CACHE_ROOT, entry.name);
            const stats = await fsp.stat(filePath);
            if (now - stats.mtimeMs > ACTIVE_CACHE_MAX_AGE_MS) {
              await fsp.unlink(filePath);
            }
          })
      );
    } catch {
      // Cache cleanup must never prevent a download.
    }
  };

  const getCatalogueDownload = async (products, options) => {
    await fsp.mkdir(CACHE_ROOT, { recursive: true });
    cleanupOldCache();

    const groups = filterCatalogueProducts(products, options);
    if (!groups.length) {
      const error = new Error('No catalogue products match the selected download');
      error.statusCode = 404;
      throw error;
    }

    const isHighQualityZip =
      options.scope === 'all' && options.quality === 'high';
    const extension = isHighQualityZip ? 'zip' : 'pdf';
    const signature = groups.flatMap((group) =>
      group.variants.map((product) => ({
        id: Number(product.id),
        image: product.image_url || '',
        updated: product.updated_at || '',
        quantity: getVisiblePairs(product),
        offer: Number(product.offer_enabled || 0),
        offerEndsAt: product.offer_ends_at || '',
      }))
    );
    const cacheKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          cacheVersion: CACHE_VERSION,
          mode: options.mode,
          scope: options.scope,
          series: options.series || '',
          search: options.search || '',
          stock: options.stock || '',
          quality: options.quality,
          signature,
        })
      )
      .digest('hex');
    const cachePath = path.join(CACHE_ROOT, `${cacheKey}.${extension}`);
    let cacheHit = true;

    try {
      await fsp.access(cachePath, fs.constants.R_OK);
    } catch {
      cacheHit = false;
      if (activeGenerations.has(cachePath)) {
        await activeGenerations.get(cachePath);
        cacheHit = true;
      } else {
        const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        const generation = (async () => {
          try {
            if (isHighQualityZip) {
              await createZip(tempPath, groups, options);
            } else {
              await generatePdf(tempPath, groups, options);
            }
            await fsp.rename(tempPath, cachePath);
          } catch (error) {
            await fsp.unlink(tempPath).catch(() => {});
            throw error;
          }
        })();
        activeGenerations.set(cachePath, generation);
        try {
          await generation;
        } finally {
          activeGenerations.delete(cachePath);
        }
      }
    }

    const modeName = options.mode === 'offers' ? 'offer-gallery' : 'product-gallery';
    const scopeName =
      options.scope === 'series' && options.series
        ? safeName(options.series, 'series')
        : options.scope;

    return {
      path: cachePath,
      cacheHit,
      filename: `${modeName}-${scopeName}-${
        isHighQualityZip ? 'high-quality' : 'standard'
      }.${extension}`,
      contentType: isHighQualityZip ? 'application/zip' : 'application/pdf',
    };
  };

  module.exports = {
    filterCatalogueProducts,
    getCatalogueDownload,
  };
