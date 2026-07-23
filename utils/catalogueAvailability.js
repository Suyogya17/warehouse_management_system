const { query } = require('../config/db');
const { hasColumn, hasTable } = require('./schemaSupport');
const { resolveOfferAudienceUserId } = require('./offerAccountLinks');
const {
  hasOfferCampaignSchema,
  getOfferCampaignUsage,
} = require('./offerCampaigns');

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
  const supportsDisplayOrder = await hasColumn('finished_goods', 'display_order');
  const supportsDisplayQuantity = await hasColumn('finished_goods', 'display_quantity');
  const supportsOfferEnabled = await hasColumn('finished_goods', 'offer_enabled');
  const supportsIsDeleted = await hasColumn('finished_goods', 'is_deleted');
  const supportsIsVisible = await hasColumn('finished_goods', 'is_visible');
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
    params.push(availabilityUserId, availabilityUserId);
  }

  sql += supportsDisplayOrder
    ? ' ORDER BY (display_order IS NULL), display_order ASC, article_code, color, id'
    : ' ORDER BY article_code, color, id';

  const products = await query(sql, params);
  const supportsOfferAudience = await hasColumn(
    'finished_goods',
    'offer_all_users'
  );
  const supportsOfferUsers = await hasTable('finished_good_offer_users');
  const supportsOfferUserQuantity = supportsOfferUsers
    ? await hasColumn('finished_good_offer_users', 'display_quantity')
    : false;
  const supportsOfferCampaigns = await hasOfferCampaignSchema();
  let offerUserTargets = new Map();

  if (
    usesCustomerOfferAudience &&
    supportsOfferAudience &&
    supportsOfferUsers &&
    products.rows.length
  ) {
    const ids = products.rows.map((product) => Number(product.id));
    const audienceRows = await query(
      `SELECT finished_good_id${
        supportsOfferUserQuantity ? ', display_quantity' : ''
      } FROM finished_good_offer_users
       WHERE user_id = ? AND finished_good_id IN (${ids
         .map(() => '?')
         .join(',')})`,
      [availabilityUserId, ...ids]
    );
    offerUserTargets = new Map(
      audienceRows.rows.map((row) => [
        Number(row.finished_good_id),
        supportsOfferUserQuantity
          ? { display_quantity: Number(row.display_quantity || DEFAULT_DISPLAY_QUANTITY) }
          : { display_quantity: DEFAULT_DISPLAY_QUANTITY },
      ])
    );
  }

  const productIds = products.rows.map((product) => product.id);
  const reserved = await getReservedByProduct(productIds);
  const campaignUsage =
    usesCustomerOfferAudience && supportsOfferCampaigns
      ? await getOfferCampaignUsage(query, {
          campaignIds: products.rows.map((product) => product.offer_campaign_id),
          userId: availabilityUserId,
        })
      : new Map();

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
      const offerRemainingQuantity =
        usesCustomerOfferAudience && offerIsActive
          ? Math.max(0, offerQuantityLimit - campaignUsedQuantity)
          : offerQuantityLimit;
      const display_stock = Math.min(
        offerRemainingQuantity,
        available_qty
      );
      const canSeeOffer =
        !usesCustomerOfferAudience ||
        !supportsOfferAudience ||
        !supportsOfferUsers ||
        Number(product.offer_all_users) === 1 ||
        offerUserTargets.has(Number(product.id));

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
      };
    })
    .filter(Boolean);
};

module.exports = { loadAvailabilityForRequest };
