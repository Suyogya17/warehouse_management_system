const { hasColumn, hasTable } = require('./schemaSupport');

const hasOfferCampaignSchema = async () =>
  (await hasTable('finished_good_offer_campaigns')) &&
  (await hasTable('finished_good_offer_campaign_users')) &&
  (await hasColumn('finished_goods', 'offer_campaign_id')) &&
  (await hasColumn('order_items', 'offer_campaign_id'));

const getOfferCampaignUsage = async (
  queryFn,
  { campaignIds = [], userId, excludeOrderId = null } = {}
) => {
  const ids = [...new Set(campaignIds.map(Number).filter((id) => id > 0))];
  if (!ids.length || Number(userId) <= 0) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const params = [Number(userId), ...ids];
  let excludeSql = '';
  if (Number(excludeOrderId) > 0) {
    excludeSql = ' AND o.id <> ?';
    params.push(Number(excludeOrderId));
  }

  const result = await queryFn(
    `SELECT oi.offer_campaign_id, COALESCE(SUM(oi.qty_ordered), 0) AS used_quantity
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_by = ?
       AND o.status <> 'CANCELLED'
       AND oi.ordered_from_offer = 1
       AND oi.offer_campaign_id IN (${placeholders})${excludeSql}
     GROUP BY oi.offer_campaign_id`,
    params
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.offer_campaign_id),
      Number(row.used_quantity || 0),
    ])
  );
};

module.exports = {
  hasOfferCampaignSchema,
  getOfferCampaignUsage,
};
