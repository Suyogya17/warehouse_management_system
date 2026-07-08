export const DEFAULT_CUSTOMER_DISPLAY_QUANTITY = 450;

const toStockNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
};

export const getCustomerVisibleStock = (product) => {
  const displayStock = toStockNumber(product?.display_stock);
  if (displayStock !== null) {
    return Math.min(displayStock, DEFAULT_CUSTOMER_DISPLAY_QUANTITY);
  }

  const availableStock = toStockNumber(product?.available_qty ?? product?.quantity) ?? 0;
  const displayQuantity =
    toStockNumber(product?.display_quantity) ?? DEFAULT_CUSTOMER_DISPLAY_QUANTITY;

  return Math.min(availableStock, displayQuantity, DEFAULT_CUSTOMER_DISPLAY_QUANTITY);
};
