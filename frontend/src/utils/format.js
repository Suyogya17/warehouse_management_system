export const formatNumber = (value) => {
  const number = Number(value || 0);
  return Number.isNaN(number) ? "0" : number.toLocaleString();
};

export const formatPrice = (value, currency = "NPR") => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

export const titleCase = (value = "") =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
