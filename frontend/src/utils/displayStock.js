export const DEFAULT_CUSTOMER_DISPLAY_QUANTITY = 450;

const toStockNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
};

export const getCustomerVisibleStock = (product) => {
  const displayStock = toStockNumber(product?.display_stock);
  if (displayStock !== null) {
    return displayStock;
  }

  const availableStock = toStockNumber(product?.available_qty ?? product?.quantity) ?? 0;
  const displayQuantity =
    toStockNumber(product?.display_quantity) ?? DEFAULT_CUSTOMER_DISPLAY_QUANTITY;

  return Math.min(availableStock, displayQuantity, DEFAULT_CUSTOMER_DISPLAY_QUANTITY);
};

export const getRoundedCartons = (quantity, pairsPerCarton) => {
  const pairs = Number(quantity || 0);
  const cartonSize = Number(pairsPerCarton || 0);

  if (!Number.isFinite(pairs) || pairs <= 0 || !Number.isFinite(cartonSize) || cartonSize <= 0) {
    return 0;
  }

  return Math.ceil(pairs / cartonSize);
};
