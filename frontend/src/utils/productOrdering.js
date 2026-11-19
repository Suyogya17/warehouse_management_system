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

export const buildProductRotationRanks = (rotation) => {
  if (!rotation?.settings?.enabled) return new Map();
  return new Map(
    (rotation.ordered_ids || []).map((id, index) => [Number(id), index])
  );
};

const getProductGroupRotationRank = (variants = [], rankByProductId = new Map()) => {
  const ranks = variants
    .map((variant) => rankByProductId.get(Number(variant?.id)))
    .filter((rank) => Number.isFinite(rank));
  return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
};

export const sortProductGroupsByRotation = (
  a,
  b,
  rankByProductId = new Map()
) => {
  if (rankByProductId.size) {
    const rankDiff =
      getProductGroupRotationRank(a, rankByProductId) -
      getProductGroupRotationRank(b, rankByProductId);
    if (rankDiff !== 0) return rankDiff;
  }

  return sortProductGroupsByDisplayOrder(a, b);
};
