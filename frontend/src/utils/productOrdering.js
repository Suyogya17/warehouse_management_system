export const getProductDisplayOrder = (product) => {
  const order = Number(product?.display_order);

  return Number.isFinite(order) && order > 0 ? order : 999999;
};

export const sortProductsByDisplayOrder = (a, b) => {
  const orderDiff = getProductDisplayOrder(a) - getProductDisplayOrder(b);
  if (orderDiff !== 0) return orderDiff;

  return Number(a?.id || 0) - Number(b?.id || 0);
};

export const getProductGroupDisplayOrder = (variants = []) =>
  Math.min(...variants.map(getProductDisplayOrder));

export const sortProductGroupsByDisplayOrder = (a, b) => {
  const orderDiff = getProductGroupDisplayOrder(a) - getProductGroupDisplayOrder(b);
  if (orderDiff !== 0) return orderDiff;

  const firstA = [...a].sort(sortProductsByDisplayOrder)[0];
  const firstB = [...b].sort(sortProductsByDisplayOrder)[0];

  return Number(firstA?.id || 0) - Number(firstB?.id || 0);
};
