export const isCommissionProduct = (product = {}) => Number(product?.is_commission || 0) === 1;

export const getCommissionLabel = (product = {}) => {
  return isCommissionProduct(product) ? "Percentage" : "Non commission";
};

export const matchesCommissionFilter = (product = {}, filter = "all") => {
  if (filter === "commission") return isCommissionProduct(product);
  if (filter === "non_commission") return !isCommissionProduct(product);
  return true;
};
