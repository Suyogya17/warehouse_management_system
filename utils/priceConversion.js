const INDIA_PRICE_DIVISOR = 1.6;

const getIndiaPriceFromNepalPrice = (value) => {
  if (value === null || value === undefined || value === '') return null;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  return Math.round((amount / INDIA_PRICE_DIVISOR) * 100) / 100;
};

module.exports = {
  INDIA_PRICE_DIVISOR,
  getIndiaPriceFromNepalPrice,
};
