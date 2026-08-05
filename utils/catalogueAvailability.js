const { query } = require('../config/db');
const { hasColumn, hasTable } = require('./schemaSupport');
const { resolveOfferAudienceUserId } = require('./offerAccountLinks');
const {
  hasOfferCampaignSchema,
  getOfferCampaignUsage,
} = require('./offerCampaigns');
const {
  getEffectiveOfferPrice,
  getSeriesOfferAdjustment,
  loadUserSeriesOfferAdjustments,
} = require('./offerPricing');

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const DEFAULT_DISPLAY_QUANTITY = 450;

const buildInClause = (values = []) => {
  if (!values.length) return { clause: '(-1)', params: [] };
  const placeholders = values.map(() => '?').join(',');
  return { clause: `(${placeholders})`, params: values };
};

const getProductDisplayQuantity = (product) => {
  const value = Number(product?.display_quantity);

  if (!Number.isFinite(value) || value < 0) return DEFAULT_DISPLAY_QUANTITY;

  return Math.min(value, DEFAULT_DISPLAY_QUANTITY);
};

const getReservedByProduct = async (productIds = []) => {
  if (!productIds.length) return new Map();

  const { clause: statusClause, params: statusParams } =
    buildInClause(ACTIVE_RESERVATION_STATUSES);
  const { clause: productClause, params: productParams } =
    buildInClause(productIds);
  const result = await query(
    `SELECT oi.finished_good_id,
            COALESCE(SUM(oi.qty_ordered), 0) AS reserved_qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ${statusClause}
       AND oi.finished_good_id IN ${productClause}
     GROUP BY oi.finished_good_id`,
    [...statusParams, ...productParams]
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.finished_good_id),
      Number(row.reserved_qty),
    ])
  );
};

const loadAvailabilityForRequest = async (req, options = {}) => {
  const offerView = options.offerView ?? req.query.offer_view === '1';
  const [
    supportsDisplayOrder,
    supportsDisplayQuantity,
    supportsOfferEnabled,
    supportsIsDeleted,
    supportsIsVisible,
    supportsOfferAudience,
    supportsOfferUsers,
    supportsOfferCampaigns,
    supportsPercentageAllocations,
    supportsOfferOrderSnapshots,
    supportsOfferPriceAdjustments,
  ] = await Promise.all([
    hasColumn('finished_goods', 'display_order'),
    hasColumn('finished_goods', 'display_quantity'),
    hasColumn('finished_goods', 'offer_enabled'),
    hasColumn('finished_goods', 'is_deleted'),
    hasColumn('finished_goods', 'is_visible'),
    hasColumn('finished_goods', 'offer_all_users'),
    hasTable('finished_good_offer_users'),
    hasOfferCampaignSchema(),
    hasColumn('user_product_permissions', 'allocation_quantity'),
    hasColumn('order_items', 'ordered_from_offer'),
    hasTable('user_series_offer_price_adjustments'),
  ]);
  const supportsOfferUserQuantity = supportsOfferUsers
    ? await hasColumn('finished_good_offer_users', 'display_quantity')
    : false;
  const includeHidden =
    req.query.include_hidden === '1' &&
    ['ADMIN', 'CO_ADMIN', 'MEMBER'].includes(req.user.role);
  const isOfferView = offerView && ['USER', 'ELDER'].includes(req.user.role);
  const isLinkedElderOfferView = req.user.role === 'ELDER' && isOfferView;
  const availabilityUserId = isLinkedElderOfferView
    ? await resolveOfferAudienceUserId(req.user, query)
    : Number(req.user.id);
  const usesCustomerOfferAudience =
    req.user.role === 'USER' || isLinkedElderOfferView;

  let sql = `SELECT * FROM finished_goods WHERE ${
    supportsIsDeleted ? 'is_deleted = 0' : '1 = 1'
  }${
    includeHidden || !supportsIsVisible ? '' : ' AND is_visible = 1'
  }`;
  const params = [];

  if (isOfferView && supportsOfferEnabled) {
    sql +=
      ' AND offer_enabled = 1 AND (offer_ends_at IS NULL OR offer_ends_at >= NOW())';
  }

  if (
    !isOfferView &&
    supportsOfferEnabled &&
    ['USER', 'MEMBER', 'ELDER'].includes(req.user.role)
  ) {
    sql +=
      ' AND NOT (offer_enabled = 1 AND (offer_ends_at IS NULL OR offer_ends_at >= NOW()))';
  }

  if (['USER', 'MEMBER', 'ELDER'].includes(req.user.role) && !isOfferView) {
    sql += ` AND EXISTS (
      SELECT 1 FROM user_product_permissions upp
      WHERE upp.finished_good_id = finished_goods.id
        AND upp.user_id = ?
        AND upp.can_view = 1
    ) AND NOT EXISTS (
      SELECT 1 FROM user_product_permissions upp
      WHERE upp.finished_good_id = finished_goods.id
        AND upp.user_id = ?
        AND upp.can_view = 0
    )`;
    if (supportsPercentageAllocations) {
      sql += ` AND (
        NOT EXISTS (
          SELECT 1 FROM user_product_permissions allocated
          WHERE allocated.finished_good_id = finished_goods.id
            AND allocated.allocation_quantity IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM user_product_permissions own_allocation
          WHERE own_allocation.finished_good_id = finished_goods.id
            AND own_allocation.user_id = ?
            AND own_allocation.allocation_quantity IS NOT NULL
        )
      )`;
    }
    params.push(availabilityUserId, availabilityUserId);
    if (supportsPercentageAllocations) params.push(availabilityUserId);
  }

  const requestedProductId = Math.max(0, Number(options.productId) || 0);
  const requestedSearch = String(options.search || '').trim();
  if (requestedProductId) {
    sql += ' AND id = ?';
    params.push(requestedProductId);
  } else if (requestedSearch) {
    const pattern = `%${requestedSearch}%`;
    sql += ` AND (
      name LIKE ? OR article_code LIKE ? OR sole_code LIKE ? OR
      color LIKE ? OR size LIKE ? OR CAST(id AS CHAR) = ?
    )`;
    params.push(pattern, pattern, pattern, pattern, pattern, requestedSearch);
  }

  sql += supportsDisplayOrder
    ? ' ORDER BY (display_order IS NULL), display_order ASC, article_code, color, id'
    : ' ORDER BY article_code, color, id';

  const requestedLimit = Math.min(200, Math.max(0, Number(options.limit) || 0));
  if (requestedLimit) {
    sql += ' LIMIT ?';
    params.push(requestedLimit);
  }

  const products = await query(sql, params);
  const productIds = products.rows.map((product) => product.id);
  const shouldLoadOfferTargets =
    usesCustomerOfferAudience &&
    supportsOfferAudience &&
    supportsOfferUsers &&
    products.rows.length > 0;

  const shouldLoadPercentageAllocation =
    supportsPercentageAllocations &&
    !isOfferView &&
    ['USER', 'MEMBER', 'ELDER'].includes(req.user.role) &&
    products.rows.length > 0;
  const [
    audienceRows,
    reserved,
    campaignUsage,
    percentageAllocationRows,
    seriesOfferAdjustments,
  ] =
    await Promise.all([
    shouldLoadOfferTargets
      ? query(
          `SELECT finished_good_id${
            supportsOfferUserQuantity ? ', display_quantity' : ''
          } FROM finished_good_offer_users
           WHERE user_id = ? AND finished_good_id IN (${productIds
             .map(() => '?')
             .join(',')})`,
          [availabilityUserId, ...productIds]
        )
      : Promise.resolve({ rows: [] }),
    getReservedByProduct(productIds),
    usesCustomerOfferAudience && supportsOfferCampaigns
      ? getOfferCampaignUsage(query, {
          campaignIds: products.rows.map((product) => product.offer_campaign_id),
          userId: availabilityUserId,
        })
      : Promise.resolve(new Map()),
    shouldLoadPercentageAllocation
      ? query(
          `SELECT upp.finished_good_id,
                  upp.allocation_percentage,
                  upp.allocation_quantity,
                  upp.allocation_started_at,
                  COALESCE(SUM(oi.qty_ordered), 0) AS used_quantity
           FROM user_product_permissions upp
           LEFT JOIN orders o
             ON o.created_by = upp.user_id
            AND o.status <> 'CANCELLED'
            AND o.created_at >= upp.allocation_started_at
           LEFT JOIN order_items oi
             ON oi.order_id = o.id
            AND oi.finished_good_id = upp.finished_good_id
            ${supportsOfferOrderSnapshots ? 'AND COALESCE(oi.ordered_from_offer, 0) = 0' : ''}
           WHERE upp.user_id = ?
             AND upp.allocation_quantity IS NOT NULL
             AND upp.finished_good_id IN (${productIds.map(() => '?').join(',')})
           GROUP BY upp.finished_good_id, upp.allocation_percentage,
                    upp.allocation_quantity, upp.allocation_started_at`,
          [availabilityUserId, ...productIds]
        )
      : Promise.resolve({ rows: [] }),
    usesCustomerOfferAudience && supportsOfferPriceAdjustments
      ? loadUserSeriesOfferAdjustments(query, availabilityUserId)
      : Promise.resolve(new Map()),
  ]);

  const offerUserTargets = new Map(
    audienceRows.rows.map((row) => [
      Number(row.finished_good_id),
      supportsOfferUserQuantity
        ? { display_quantity: Number(row.display_quantity || DEFAULT_DISPLAY_QUANTITY) }
        : { display_quantity: DEFAULT_DISPLAY_QUANTITY },
    ])
  );
  const percentageAllocations = new Map(
    percentageAllocationRows.rows.map((row) => {
      const assignedQuantity = Number(row.allocation_quantity || 0);
      const usedQuantity = Number(row.used_quantity || 0);
      return [
        Number(row.finished_good_id),
        {
          percentage: Number(row.allocation_percentage || 0),
          assigned_quantity: assignedQuantity,
          used_quantity: usedQuantity,
          remaining_quantity: Math.max(0, assignedQuantity - usedQuantity),
          started_at: row.allocation_started_at,
        },
      ];
    })
  );

  return products.rows
    .map((product) => {
      const reserved_qty = reserved.get(Number(product.id)) || 0;
      const physical_stock = Number(product.quantity || 0);
      const display_quantity = supportsDisplayQuantity
        ? getProductDisplayQuantity(product)
        : DEFAULT_DISPLAY_QUANTITY;
      const available_qty = Math.max(0, physical_stock - reserved_qty);
      const userOfferTarget = offerUserTargets.get(Number(product.id));
      const userOfferQuantity = Number(userOfferTarget?.display_quantity);
      const offerIsActive =
        Number(product.offer_enabled) === 1 &&
        (!product.offer_ends_at ||
          new Date(product.offer_ends_at).getTime() >= Date.now());
      const hasPersonalOffer =
        usesCustomerOfferAudience &&
        offerIsActive &&
        Number(product.offer_all_users) !== 1 &&
        userOfferTarget != null;
      const campaignUsedQuantity =
        supportsOfferCampaigns && Number(product.offer_campaign_id) > 0
          ? Number(campaignUsage.get(Number(product.offer_campaign_id)) || 0)
          : 0;
      const offerQuantityLimit = hasPersonalOffer
        ? userOfferQuantity
        : display_quantity;
      const percentageAllocation = percentageAllocations.get(
        Number(product.id)
      );
      const offerRemainingQuantity =
        usesCustomerOfferAudience && offerIsActive
          ? Math.max(0, offerQuantityLimit - campaignUsedQuantity)
          : offerQuantityLimit;
      const normalRemainingQuantity = percentageAllocation
        ? percentageAllocation.remaining_quantity
        : display_quantity;
      const display_stock = Math.min(
        offerIsActive && usesCustomerOfferAudience
          ? offerRemainingQuantity
          : normalRemainingQuantity,
        available_qty
      );
      const canSeeOffer =
        !usesCustomerOfferAudience ||
        !supportsOfferAudience ||
        !supportsOfferUsers ||
        Number(product.offer_all_users) === 1 ||
        offerUserTargets.has(Number(product.id));
      const currencyCode = String(req.user?.currency_code || 'NPR')
        .trim()
        .toUpperCase();
      const baseOfferPrice =
        currencyCode === 'INR'
          ? Number(product.india_price)
          : Number(product.price);
      const offerSeriesPriceAdjustment =
        offerIsActive && canSeeOffer
          ? getSeriesOfferAdjustment(seriesOfferAdjustments, product.sole_code)
          : 0;
      const effectiveOfferPrice =
        offerIsActive && canSeeOffer
          ? getEffectiveOfferPrice(
              baseOfferPrice,
              product.sole_code,
              seriesOfferAdjustments
            )
          : null;

      if (isOfferView && usesCustomerOfferAudience && !canSeeOffer) {
        return null;
      }

      return {
        ...product,
        ...(canSeeOffer
          ? {}
          : {
              offer_enabled: 0,
              offer_price: null,
              offer_label: null,
              offer_ends_at: null,
            }),
        offer_display_quantity: hasPersonalOffer ? userOfferQuantity : null,
        offer_series_price_adjustment: offerSeriesPriceAdjustment,
        effective_offer_price: effectiveOfferPrice,
        offer_used_quantity:
          usesCustomerOfferAudience && offerIsActive ? campaignUsedQuantity : 0,
        offer_remaining_quantity:
          usesCustomerOfferAudience && offerIsActive
            ? offerRemainingQuantity
            : null,
        physical_stock,
        reserved_qty,
        available_qty,
        display_stock,
        display_quantity,
        allocation_percentage: percentageAllocation?.percentage ?? null,
        allocation_quantity:
          percentageAllocation?.assigned_quantity ?? null,
        allocation_used_quantity:
          percentageAllocation?.used_quantity ?? 0,
        allocation_remaining_quantity:
          percentageAllocation?.remaining_quantity ?? null,
        allocation_started_at: percentageAllocation?.started_at ?? null,
      };
    })
    .filter(Boolean);
};

module.exports = { loadAvailabilityForRequest };
