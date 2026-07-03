const NepaliDateModule = require("nepali-date-converter");
const { hasColumn } = require("./schemaSupport");

const NepaliDate = NepaliDateModule.default || NepaliDateModule;

const FISCAL_COLUMNS = ["bs_date", "bs_year", "bs_month", "bs_fiscal_year"];

const getNepaliFiscalMeta = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const nepaliDate = new NepaliDate(Number.isNaN(date.getTime()) ? new Date() : date);
  const bsDate = nepaliDate.format("YYYY-MM-DD");
  const [bsYear, bsMonth] = bsDate.split("-").map(Number);
  const fiscalStartYear = bsMonth >= 4 ? bsYear : bsYear - 1;
  const fiscalEndYear = fiscalStartYear + 1;

  return {
    bs_date: bsDate,
    bs_year: bsYear,
    bs_month: bsMonth,
    bs_fiscal_year: `${fiscalStartYear}/${String(fiscalEndYear).slice(-2)}`,
  };
};

const getSupportedFiscalColumns = async (tableName) => {
  const checks = await Promise.all(
    FISCAL_COLUMNS.map(async (column) => ({
      column,
      supported: await hasColumn(tableName, column),
    }))
  );

  return checks.filter((check) => check.supported).map((check) => check.column);
};

const appendFiscalInsertFields = async (tableName, columns, values, date = new Date()) => {
  const supportedColumns = await getSupportedFiscalColumns(tableName);
  if (!supportedColumns.length) {
    return { columns, values };
  }

  const meta = getNepaliFiscalMeta(date);

  return {
    columns: [...columns, ...supportedColumns],
    values: [...values, ...supportedColumns.map((column) => meta[column])],
  };
};

module.exports = {
  appendFiscalInsertFields,
  getNepaliFiscalMeta,
  getSupportedFiscalColumns,
};
