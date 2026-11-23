import { useCallback, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { api } from "../../services/api";
import { formatDate, formatNumber } from "../../utils/format";
import { exportProductionOrdersWorkbook } from "../../utils/productionOrdersExcel";

const emptyOptions = { series: [], articles: [], products: [] };

const optionKeyByLevel = {
  SERIES: "series",
  ARTICLE: "articles",
  PRODUCT: "products",
};

export default function ProductionOrdersAnalytics({ token }) {
  const [options, setOptions] = useState(emptyOptions);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [level, setLevel] = useState("ARTICLE");
  const [selection, setSelection] = useState("");
  const [periodMode, setPeriodMode] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = useCallback(async () => {
    if (!token) return;
    setLoadingOptions(true);
    setError("");
    try {
      const result = await api.getProductionOrderReport({}, token);
      const data = result.data || {};
      setOptions(data.options || emptyOptions);
      setFiscalYears(data.fiscal_years || []);
      setPeriodMode((current) =>
        current === "ALL" && data.default_fiscal_year
          ? data.default_fiscal_year
          : current
      );
    } catch (loadError) {
      setError(loadError.message || "Could not load report filters.");
    } finally {
      setLoadingOptions(false);
    }
  }, [token]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const selectionOptions = options[optionKeyByLevel[level]] || [];
  const selectedOption = useMemo(
    () => selectionOptions.find((option) => String(option.value) === String(selection)) || null,
    [selection, selectionOptions]
  );

  const runReport = async (event) => {
    event?.preventDefault();
    if (!selection) {
      setError("Select a group, article, or exact product first.");
      return;
    }
    setLoadingReport(true);
    setError("");
    try {
      const params = { level, selection };
      if (periodMode === "CUSTOM") {
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
      } else if (periodMode !== "ALL") {
        params.fiscal_year = periodMode;
      }
      const result = await api.getProductionOrderReport(params, token);
      const data = result.data || {};
      setOptions(data.options || emptyOptions);
      setFiscalYears(data.fiscal_years || []);
      setReport(data.report || null);
    } catch (reportError) {
      setReport(null);
      setError(reportError.message || "Could not create the production and orders report.");
    } finally {
      setLoadingReport(false);
    }
  };

  const summary = report?.summary || {};
  const reportLabel = report?.selection?.label || "selection";
  const exportBase = `production-vs-orders-${String(reportLabel)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "report"}`;

  const exportFullExcel = async () => {
    if (!report) return;
    setExportingExcel(true);
    setError("");
    try {
      await exportProductionOrdersWorkbook(report);
    } catch (exportError) {
      setError(exportError.message || "Could not create the Excel report.");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Production vs Orders"
        subtitle="Compare how much was produced with how much every user ordered for one series, article, or exact product."
        icon="production"
        actions={report ? (
          <Button type="button" variant="secondary" icon="download" onClick={exportFullExcel} disabled={exportingExcel}>
            {exportingExcel ? "Preparing Excel…" : "Export full Excel"}
          </Button>
        ) : null}
      >
        <form onSubmit={runReport} className="grid gap-4 p-4 lg:grid-cols-[180px_minmax(260px,1fr)_220px_160px] lg:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Report level
            <select
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setSelection("");
                setReport(null);
              }}
            >
              <option value="SERIES">Series / group</option>
              <option value="ARTICLE">Article</option>
              <option value="PRODUCT">Exact product</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {level === "SERIES" ? "Product group" : level === "ARTICLE" ? "Article" : "Product variant"}
            <Select
              className="mt-1 font-normal"
              options={selectionOptions}
              value={selectedOption}
              onChange={(option) => {
                setSelection(option?.value || "");
                setReport(null);
              }}
              isLoading={loadingOptions}
              isClearable
              placeholder={loadingOptions ? "Loading products…" : "Search and select…"}
              styles={{
                control: (base) => ({ ...base, minHeight: "44px", borderRadius: "12px", borderColor: "#e2e8f0" }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
              menuPosition="fixed"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Period
            <select
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              value={periodMode}
              onChange={(event) => {
                setPeriodMode(event.target.value);
                setReport(null);
              }}
            >
              <option value="ALL">All time</option>
              {fiscalYears.map((year) => (
                <option key={year.id || year.code} value={year.code}>
                  FY {year.code}{String(year.status).toUpperCase() === "ACTIVE" ? " · Active" : ""}
                </option>
              ))}
              <option value="CUSTOM">Custom dates</option>
            </select>
          </label>

          <Button type="submit" icon="search" disabled={loadingOptions || loadingReport || !selection}>
            {loadingReport ? "Creating…" : "Create report"}
          </Button>

          {periodMode === "CUSTOM" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
              <label className="text-sm font-semibold text-slate-700">
                From date
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                To date
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
            </div>
          ) : null}
        </form>

        {error ? (
          <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {!report && !error ? (
          <div className="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            Select a group or article and create the report.
          </div>
        ) : null}
      </SectionCard>

      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Produced Pairs" value={formatNumber(summary.produced_pairs)} icon="production" />
            <StatCard label="Ordered Pairs" value={formatNumber(summary.ordered_pairs)} icon="orders" />
            <StatCard
              label="Production − Orders"
              value={formatNumber(summary.production_minus_orders_pairs)}
              tone={Number(summary.production_minus_orders_pairs) < 0 ? "alert" : "calm"}
              icon="stock"
            />
            <StatCard label="Users Ordered" value={formatNumber(summary.user_count)} icon="users" />
            <StatCard label="Cancelled Pairs" value={formatNumber(summary.cancelled_pairs)} tone="alert" icon="orders" />
          </div>

          <SectionCard
            title={`Orders by user · ${report.selection.label}`}
            subtitle={`${report.period.label}. Cancelled quantities are displayed separately and excluded from ordered totals.`}
            icon="users"
          >
            <DataTable
              rows={report.user_orders || []}
              exportFilename={`${exportBase}-users`}
              emptyTitle="No users ordered this selection"
              emptyDescription="Try another fiscal year, date range, group, or article."
              summaryColumns={[
                { key: "order_count", label: "Orders" },
                { key: "ordered_cartons", label: "Ordered CTN" },
                { key: "ordered_pairs", label: "Ordered Pairs" },
                { key: "cancelled_pairs", label: "Cancelled Pairs" },
              ]}
              columns={[
                { key: "user_name", label: "User" },
                { key: "user_role", label: "Role" },
                { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
                { key: "ordered_cartons", label: "Ordered CTN", render: (row) => formatNumber(row.ordered_cartons) },
                { key: "ordered_pairs", label: "Ordered Pairs", render: (row) => formatNumber(row.ordered_pairs) },
                { key: "pending_pairs", label: "Pending", render: (row) => formatNumber(row.pending_pairs) },
                { key: "confirmed_pairs", label: "Confirmed", render: (row) => formatNumber(row.confirmed_pairs) },
                { key: "packed_pairs", label: "Packed", render: (row) => formatNumber(row.packed_pairs) },
                { key: "delivered_pairs", label: "Delivered", render: (row) => formatNumber(row.delivered_pairs) },
                { key: "cancelled_pairs", label: "Cancelled", render: (row) => formatNumber(row.cancelled_pairs) },
                { key: "last_order_at", label: "Last Order", render: (row) => row.last_order_at ? formatDate(row.last_order_at) : "-" },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Product breakdown"
            subtitle={`${formatNumber(report.selection.product_count)} exact product variant${Number(report.selection.product_count) === 1 ? "" : "s"} included in this report.`}
            icon="finishedGoods"
          >
            <DataTable
              rows={report.product_breakdown || []}
              exportFilename={`${exportBase}-products`}
              emptyTitle="No matching products"
              summaryColumns={[
                { key: "produced_pairs", label: "Produced" },
                { key: "ordered_pairs", label: "Ordered" },
                { key: "production_minus_orders_pairs", label: "Difference" },
              ]}
              columns={[
                { key: "article_code", label: "Article", render: (row) => row.article_code || row.name || "-" },
                { key: "series", label: "Series" },
                { key: "color", label: "Color", render: (row) => row.color || "-" },
                { key: "size", label: "Size", render: (row) => row.size || "-" },
                { key: "produced_pairs", label: "Produced Pairs", render: (row) => formatNumber(row.produced_pairs) },
                { key: "ordered_pairs", label: "Ordered Pairs", render: (row) => formatNumber(row.ordered_pairs) },
                { key: "production_minus_orders_pairs", label: "Difference", render: (row) => formatNumber(row.production_minus_orders_pairs) },
                { key: "production_runs", label: "Production Runs", render: (row) => formatNumber(row.production_runs) },
                { key: "user_count", label: "Users", render: (row) => formatNumber(row.user_count) },
              ]}
            />
          </SectionCard>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            Production and orders are filtered independently by their transaction dates. “Production − Orders” compares activity during the selected period; it is not the current warehouse stock balance.
          </div>
        </>
      ) : null}
    </div>
  );
}
