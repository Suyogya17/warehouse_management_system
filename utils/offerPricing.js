const STANDARD_OFFER_MARKUP = 50;

const normalizeSeriesCode = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+sole$/i, '')
    .replace(/\s+/g, ' ');

const loadUserSeriesOfferAdjustments = async (executor, userId) => {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    return new Map();
  }

  const result = await executor(
    `SELECT series_code, adjustment_amount
     FROM user_series_offer_price_adjustments
     WHERE user_id = ? AND is_active = 1`,
    [Number(userId)]
  );
  const rows = result?.rows || result || [];

  return new Map(
    rows.map((row) => [
      normalizeSeriesCode(row.series_code),
      Math.max(0, Number(row.adjustment_amount || 0)),
    ])
  );
};

const getSeriesOfferAdjustment = (adjustments, seriesCode) =>
  Math.max(0, Number(adjustments?.get(normalizeSeriesCode(seriesCode)) || 0));

const getEffectiveOfferPrice = (basePrice, seriesCode, adjustments) => {
  const amount = Number(basePrice);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return (
    amount +
    STANDARD_OFFER_MARKUP +
    getSeriesOfferAdjustment(adjustments, seriesCode)
  );
};

module.exports = {
  STANDARD_OFFER_MARKUP,
  normalizeSeriesCode,
  loadUserSeriesOfferAdjustments,
  getSeriesOfferAdjustment,
  getEffectiveOfferPrice,
};
