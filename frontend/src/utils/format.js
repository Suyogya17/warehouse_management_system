import NepaliDateModule from "nepali-date-converter";

const NepaliDate = NepaliDateModule.default || NepaliDateModule;

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

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

export const convertPriceForUser = (value, user = {}) => {
  const amount = Number(value || 0);
  const currency = String(user?.currency_code || "NPR").trim().toUpperCase();
  const defaultRates = { NPR: 1, INR: 1.6 };
  const exchangeRate = Number(user?.exchange_rate || defaultRates[currency] || 1);

  if (!Number.isFinite(amount)) return null;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return amount;

  return amount / exchangeRate;
};

export const formatUserPrice = (value, user = {}) => {
  const currency = String(user?.currency_code || "NPR").trim().toUpperCase() || "NPR";
  const amount = convertPriceForUser(value, user);

  return amount === null ? "-" : formatPrice(amount, currency);
};

export const formatEnglishDate = (value, options = {}) => {
  const date = normalizeDate(value);
  if (!date) return "-";
  const { includeTime = true } = options;
  return includeTime ? date.toLocaleString() : date.toLocaleDateString("en-GB");
};

export const formatTime = (value) => {
  const date = normalizeDate(value);
  if (!date) return "-";
  return date.toLocaleTimeString();
};

export const formatNepaliDate = (value) => {
  const date = normalizeDate(value);
  if (!date) return "-";
  return new NepaliDate(date).format("YYYY-MM-DD");
};

export const formatDate = (value, options = {}) => {
  const date = normalizeDate(value);
  if (!date) return "-";

  return `AD ${formatEnglishDate(date, options)} | BS ${formatNepaliDate(date)}`;
};

export const titleCase = (value = "") =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
