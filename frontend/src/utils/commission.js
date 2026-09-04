export const isCommissionProduct = (product = {}) => Number(product?.is_commission || 0) === 1;

export const getCommissionLabel = (product = {}) => {
  return isCommissionProduct(product) ? "Percentage" : "Non commission";
};

export const getProductNClassification = (product = {}) => {
  const value = String(product?.n_classification || "").trim().toUpperCase();
  return value === "N1" || value === "N2" ? value : "";
};

export const matchesProductNClassification = (product = {}, filter = "all") => {
  const classification = getProductNClassification(product);
  if (filter === "N1" || filter === "N2") return classification === filter;
  if (filter === "unclassified") return !classification;
  return true;
};

export const matchesCommissionFilter = (product = {}, filter = "all") => {
  if (filter === "commission") return isCommissionProduct(product);
  if (filter === "non_commission") return !isCommissionProduct(product);
  return true;
};
