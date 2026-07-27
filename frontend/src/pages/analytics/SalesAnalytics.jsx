import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import SectionCard from "../../components/SectionCard";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";
import { formatDate, formatNumber } from "../../utils/format";
import {
  ChartFrame,
  ChartSummary,
  SeriesSalesTooltip,
  WorkflowTooltip,
  getProductLineColor,
  getSeriesColor,
  getSeriesName,
  numberTooltip,
  productName,
  shortLabel,
  sumRows,
} from "./analyticsShared";

export default function SalesAnalytics({ data, token }) {
  const [trendMode, setTrendMode] = useState("month");
  const [expandedTrend, setExpandedTrend] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productPerformance, setProductPerformance] = useState(null);
  const [productPerformanceLoading, setProductPerformanceLoading] = useState(false);
  const [productPerformanceError, setProductPerformanceError] = useState("");
  const [compareProductIds, setCompareProductIds] = useState([]);
  const [compareInitialized, setCompareInitialized] = useState(false);
  const [compareSearch, setCompareSearch] = useState("");
  const [compareCandidateId, setCompareCandidateId] = useState("");
  const [compareResults, setCompareResults] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const statusRows = useMemo(
    () =>
      (data?.order_status_summary || [])
        .slice()
        .sort((a, b) => Number(b.order_count || 0) - Number(a.order_count || 0))
        .map((row) => ({
          ...row,
          status_label: shortLabel(row.status, 16),
          tooltip_label: row.status,
        })),
    [data?.order_status_summary]
  );
  const sellingProductRows = useMemo(
    () =>
      (data?.top_selling_products || [])
        .slice()
        .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
        .slice(0, 10)
        .map((row) => {
          const label = productName(row);
          return {
            ...row,
            product_label: shortLabel(label, 22),
            tooltip_label: label,
          };
        }),
    [data?.top_selling_products]
  );
  const productOptions = useMemo(
    () =>
      (data?.product_sales_options || data?.top_selling_products || []).map((row) => ({
        id: String(row.id),
        label: productName(row),
        searchText: [
          row.article_code,
          row.name,
          row.sole_code,
          row.color,
          row.size,
        ].filter(Boolean).join(" ").toLowerCase(),
      })),
    [data?.product_sales_options, data?.top_selling_products]
  );
  const filteredProductOptions = useMemo(() => {
    const terms = productSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return productOptions;
    return productOptions.filter((product) =>
      terms.every((term) => product.searchText.includes(term))
    );
  }, [productOptions, productSearch]);
  const compareProductOptions = useMemo(() => {
    const terms = compareSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return productOptions.filter(
      (product) =>
        !compareProductIds.includes(product.id) &&
        terms.every((term) => product.searchText.includes(term))
    );
  }, [compareProductIds, compareSearch, productOptions]);
  const seriesSalesRows = useMemo(() => {
    const totals = new Map();
    (data?.series_sales || []).forEach((row) => {
      const series = getSeriesName(row.series);
      const current = totals.get(series) || {
        series,
        total_quantity: 0,
        order_count: 0,
        product_count: 0,
      };
      current.total_quantity += Number(row.total_quantity || 0);
      current.order_count += Number(row.order_count || 0);
      current.product_count += Number(row.product_count || 0);
      totals.set(series, current);
    });
    return Array.from(totals.values()).sort(
      (a, b) => b.total_quantity - a.total_quantity
    );
  }, [data?.series_sales]);
  const seriesSalesTotal = sumRows(seriesSalesRows, "total_quantity");
  const statusChartHeight = Math.max(260, statusRows.length * 46 + 72);
  const sellingProductChartHeight = Math.max(300, sellingProductRows.length * 44 + 96);
  const trendRows = trendMode === "day" ? data?.daily_order_trend || [] : data?.monthly_order_trend || [];
  const trendLabelKey = trendMode === "day" ? "day" : "month";
  const trendTitle = trendMode === "day" ? "Daily Order Trend" : "Monthly Order Trend";
  const trendHeight = expandedTrend ? 520 : 340;
  const selectedProduct = productOptions.find((product) => product.id === selectedProductId);
  const selectableProductOptions =
    selectedProduct && !filteredProductOptions.some((product) => product.id === selectedProduct.id)
      ? [selectedProduct, ...filteredProductOptions]
      : filteredProductOptions;
  const selectedProductTrendRows = productPerformance?.daily_trend || [];
  const selectedProductSummary = productPerformance?.summary;
  const topSellingProduct = sellingProductRows[0];
  const compareChartRows = useMemo(() => {
    const rowsByDay = new Map();
    compareResults.forEach((result) => {
      (result.data?.daily_trend || []).forEach((row) => {
        if (!rowsByDay.has(row.day)) rowsByDay.set(row.day, { day: row.day });
        rowsByDay.get(row.day)[`product_${result.id}`] = Number(row.total_quantity || 0);
      });
    });
    return Array.from(rowsByDay.values())
      .map((row) => {
        compareResults.forEach((result) => {
          const key = `product_${result.id}`;
          if (row[key] === undefined) row[key] = 0;
        });
        return row;
      })
      .sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }, [compareResults]);

  useEffect(() => {
    if (!productOptions.length) {
      setSelectedProductId("");
      return;
    }

    if (!productOptions.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(productOptions[0].id);
    }
  }, [productOptions, selectedProductId]);

  useEffect(() => {
    if (!selectedProductId) {
      setProductPerformance(null);
      setProductPerformanceError("");
      return undefined;
    }

    let active = true;
    setProductPerformanceLoading(true);
    setProductPerformanceError("");

    api.getProductSalesAnalytics(selectedProductId, token)
      .then((result) => {
        if (active) setProductPerformance(result.data || null);
      })
      .catch((error) => {
        if (active) {
          setProductPerformance(null);
          setProductPerformanceError(error.message || "Could not load product performance.");
        }
      })
      .finally(() => {
        if (active) setProductPerformanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProductId, token]);

  useEffect(() => {
    if (compareInitialized || !productOptions.length) return;
    const initialIds = productOptions.slice(0, Math.min(2, productOptions.length)).map((product) => product.id);
    setCompareProductIds(initialIds);
    setCompareInitialized(true);
  }, [compareInitialized, productOptions]);

  useEffect(() => {
    const firstOption = compareProductOptions[0]?.id || "";
    if (!compareProductOptions.some((product) => product.id === compareCandidateId)) {
      setCompareCandidateId(firstOption);
    }
  }, [compareCandidateId, compareProductOptions]);

  useEffect(() => {
    if (!compareProductIds.length) {
      setCompareResults([]);
      setCompareError("");
      return undefined;
    }

    let active = true;
    setCompareLoading(true);
    setCompareError("");

    Promise.all(
      compareProductIds.map((id) =>
        api.getProductSalesAnalytics(id, token).then((result) => ({
          id,
          data: result.data || {},
        }))
      )
    )
      .then((results) => {
        if (active) setCompareResults(results);
      })
      .catch((error) => {
        if (active) {
          setCompareResults([]);
          setCompareError(error.message || "Could not compare these products.");
        }
      })
      .finally(() => {
        if (active) setCompareLoading(false);
      });

    return () => {
      active = false;
    };
  }, [compareProductIds, token]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={trendTitle}
        subtitle={trendMode === "day" ? "Last 90 days of sales activity." : "Last 12 months of sales activity."}
        icon="orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {[
                { key: "month", label: "Month" },
                { key: "day", label: "Day" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setTrendMode(option.key);
                    if (option.key === "day") {
                      setExpandedTrend(true);
                    }
                  }}
                  className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                    trendMode === option.key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={expandedTrend ? "minimize" : "maximize"}
              onClick={() => setExpandedTrend((value) => !value)}
            >
              {expandedTrend ? "Compact" : "Expand"}
            </Button>
          </div>
        }
      >
        {trendRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: trendMode === "day" ? "Days" : "Months", value: formatNumber(trendRows.length) },
                { label: "Orders", value: formatNumber(sumRows(trendRows, "order_count")) },
                { label: "Qty Ordered", value: formatNumber(sumRows(trendRows, "total_quantity")) },
              ]}
            />
            <ChartFrame height={trendHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRows} margin={{ top: 8, right: 36, bottom: expandedTrend ? 28 : 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey={trendLabelKey}
                    tick={{ fontSize: 12 }}
                    angle={trendMode === "day" && expandedTrend ? -35 : 0}
                    textAnchor={trendMode === "day" && expandedTrend ? "end" : "middle"}
                    interval={trendMode === "day" ? (expandedTrend ? 4 : 9) : 0}
                    height={trendMode === "day" && expandedTrend ? 56 : 30}
                  />
                  <YAxis yAxisId="orders" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="quantity" orientation="right" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={numberTooltip} />
                  <Legend />
                  <Line yAxisId="orders" type="monotone" dataKey="order_count" name="Orders" stroke="#4f46e5" strokeWidth={2} />
                  <Line yAxisId="quantity" type="monotone" dataKey="total_quantity" name="Qty Ordered" stroke="#dc2626" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No sales trend data to chart yet.</div>
        )}
      </SectionCard>

      <SectionCard
        title="Sales by Series"
        subtitle="Share of ordered quantity by series. Cancelled orders are excluded."
        icon="finishedGoods"
      >
        {seriesSalesRows.length ? (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] lg:p-6">
            <div className="h-[380px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={seriesSalesRows}
                    dataKey="total_quantity"
                    nameKey="series"
                    cx="50%"
                    cy="47%"
                    innerRadius="42%"
                    outerRadius="72%"
                    paddingAngle={2}
                    labelLine={false}
                    label={({ percent }) =>
                      Number(percent || 0) >= 0.03
                        ? `${(Number(percent) * 100).toFixed(0)}%`
                        : ""
                    }
                  >
                    {seriesSalesRows.map((row, index) => (
                      <Cell
                        key={row.series}
                        fill={getSeriesColor(index)}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<SeriesSalesTooltip totalQuantity={seriesSalesTotal} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid max-h-[380px] content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
              {seriesSalesRows.map((row, index) => {
                const percentage = seriesSalesTotal > 0
                  ? (Number(row.total_quantity || 0) / seriesSalesTotal) * 100
                  : 0;
                return (
                  <div
                    key={`series-summary-${row.series}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: getSeriesColor(index) }}
                        />
                        <p className="truncate text-sm font-semibold text-slate-900">{row.series}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-950">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><p className="text-slate-400">Quantity</p><p className="font-semibold text-slate-800">{formatNumber(row.total_quantity)} pairs</p></div>
                      <div><p className="text-slate-400">Orders</p><p className="font-semibold text-slate-800">{formatNumber(row.order_count)}</p></div>
                      <div><p className="text-slate-400">Products</p><p className="font-semibold text-slate-800">{formatNumber(row.product_count)}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No series sales to chart yet.</div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Order Status Summary" icon="orders">
          {statusRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Statuses", value: formatNumber(statusRows.length) },
                  { label: "Orders", value: formatNumber(sumRows(statusRows, "order_count")) },
                  { label: "Top Status", value: statusRows[0]?.status || "-" },
                ]}
              />
              <ChartFrame height={statusChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statusRows}
                    layout="vertical"
                    margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                    barCategoryGap={14}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="status_label"
                      width={112}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Bar dataKey="order_count" name="Orders" fill="#7c3aed" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="order_count" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No order status data to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top Selling Products Chart" subtitle="Products ranked by ordered quantity." icon="finishedGoods">
        {sellingProductRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: "Products", value: formatNumber(sellingProductRows.length) },
                { label: "Qty Ordered", value: formatNumber(sumRows(sellingProductRows, "total_quantity")) },
                { label: "Orders", value: formatNumber(sumRows(sellingProductRows, "order_count")) },
                { label: "Top Product", value: topSellingProduct?.tooltip_label || "-" },
              ]}
            />
            <ChartFrame height={sellingProductChartHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sellingProductRows}
                  layout="vertical"
                  margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="product_label"
                    width={150}
                    tick={{ fontSize: 12, fill: "#475569" }}
                    interval={0}
                  />
                  <Tooltip content={<WorkflowTooltip />} />
                  <Bar dataKey="total_quantity" name="Qty Ordered" fill="#dc2626" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No product sales to chart yet.</div>
        )}
      </SectionCard>

      <SectionCard
        title="Product Sales Performance"
        subtitle={
          selectedProductSummary
            ? `${productName(selectedProductSummary)} · Day-wise sales · Last order ${formatDate(selectedProductSummary.last_order_at)}`
            : "Search and select any sold product to see how it is performing."
        }
        icon="orders"
        actions={
          productOptions.length ? (
            <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto">
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search article, color or series…"
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:min-w-[250px]"
              />
              <select
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:min-w-[260px]"
              >
                {selectableProductOptions.length ? (
                  selectableProductOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.label}
                    </option>
                  ))
                ) : (
                  <option value="">No matching product</option>
                )}
              </select>
            </div>
          ) : null
        }
      >
        {productPerformanceLoading ? (
          <div className="px-6 py-10 text-sm text-slate-500">Loading product performance…</div>
        ) : productPerformanceError ? (
          <div className="px-6 py-10 text-sm text-red-600">{productPerformanceError}</div>
        ) : selectedProductSummary ? (
          <>
            <ChartSummary
              items={[
                { label: "Qty Ordered", value: formatNumber(selectedProductSummary.total_quantity) },
                { label: "Delivered", value: formatNumber(selectedProductSummary.delivered_quantity) },
                { label: "Active Orders", value: formatNumber(selectedProductSummary.active_quantity) },
                { label: "Current Stock", value: formatNumber(selectedProductSummary.current_stock) },
              ]}
            />
            {selectedProductTrendRows.length ? (
              <ChartFrame height={380}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedProductTrendRows} margin={{ top: 8, right: 36, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12 }}
                      angle={-30}
                      textAnchor="end"
                      interval="preserveStartEnd"
                      height={58}
                    />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={numberTooltip} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total_quantity"
                      name={`${selectedProductSummary.color || "Selected color"} ordered`}
                      stroke={getProductLineColor(selectedProductSummary.color)}
                      strokeWidth={3}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : (
              <div className="px-6 py-8 text-sm text-slate-500">
                No day-wise sales were recorded for this product.
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4 md:px-6">
              {(productPerformance?.status_summary || [])
                .filter((row) => row.status !== "CANCELLED")
                .map((row) => (
                <span
                  key={row.status}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {row.status}: {formatNumber(row.total_quantity)} pairs
                </span>
              ))}
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                Genuine cancelled: {formatNumber(selectedProductSummary.cancelled_quantity)} pairs
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Duplicate: {formatNumber(selectedProductSummary.duplicate_cancelled_quantity)} pairs
              </span>
            </div>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">Select a product to view its sales performance.</div>
        )}
      </SectionCard>

      <SectionCard
        title="Compare Products"
        subtitle="Compare day-wise sales for 2–4 exact product colors."
        icon="finishedGoods"
        actions={
          <div className="grid w-full gap-2 sm:grid-cols-[minmax(190px,1fr)_minmax(230px,1fr)_auto] md:w-auto">
            <input
              type="search"
              value={compareSearch}
              onChange={(event) => setCompareSearch(event.target.value)}
              placeholder="Search comparison product…"
              className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <select
              value={compareCandidateId}
              onChange={(event) => setCompareCandidateId(event.target.value)}
              className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {compareProductOptions.length ? (
                compareProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>{product.label}</option>
                ))
              ) : (
                <option value="">No matching product</option>
              )}
            </select>
            <button
              type="button"
              disabled={!compareCandidateId || compareProductIds.length >= 4}
              onClick={() => {
                if (!compareCandidateId || compareProductIds.length >= 4) return;
                setCompareProductIds((current) => [...current, compareCandidateId]);
                setCompareSearch("");
              }}
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-4 md:px-6">
          {compareProductIds.map((id, index) => {
            const product = productOptions.find((option) => option.id === id);
            return (
              <span
                key={`compare-chip-${id}`}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-slate-700"
                style={{ borderColor: getSeriesColor(index), backgroundColor: `${getSeriesColor(index)}12` }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getSeriesColor(index) }} />
                {product?.label || `Product #${id}`}
                <button
                  type="button"
                  onClick={() => setCompareProductIds((current) => current.filter((productId) => productId !== id))}
                  className="ml-1 text-base leading-none text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${product?.label || `product ${id}`} from comparison`}
                >
                  ×
                </button>
              </span>
            );
          })}
          {!compareProductIds.length && (
            <p className="text-sm text-slate-500">Add at least two products to start comparing.</p>
          )}
        </div>

        {compareLoading ? (
          <div className="px-6 py-10 text-sm text-slate-500">Loading product comparison…</div>
        ) : compareError ? (
          <div className="px-6 py-10 text-sm text-red-600">{compareError}</div>
        ) : compareProductIds.length < 2 ? (
          <div className="px-6 py-10 text-sm text-slate-500">Choose at least two products for comparison.</div>
        ) : (
          <>
            {compareChartRows.length ? (
              <ChartFrame height={420}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compareChartRows} margin={{ top: 8, right: 28, bottom: 24, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12 }}
                      angle={-30}
                      textAnchor="end"
                      interval="preserveStartEnd"
                      height={62}
                    />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={numberTooltip} />
                    <Legend />
                    {compareResults.map((result, index) => (
                      <Line
                        key={`compare-line-${result.id}`}
                        type="monotone"
                        dataKey={`product_${result.id}`}
                        name={productName(result.data?.summary || {})}
                        stroke={getSeriesColor(index)}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : (
              <div className="px-6 py-8 text-sm text-slate-500">These products have no day-wise sales to compare.</div>
            )}

            <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4 md:p-6">
              {compareResults.map((result, index) => {
                const summary = result.data?.summary || {};
                return (
                  <article key={`compare-summary-${result.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: getSeriesColor(index) }} />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-950">{productName(summary)}</h3>
                        <p className="text-xs text-slate-500">{getSeriesName(summary.sole_code)}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-slate-400">Ordered</dt><dd className="font-bold text-slate-900">{formatNumber(summary.total_quantity)}</dd></div>
                      <div><dt className="text-slate-400">Delivered</dt><dd className="font-bold text-slate-900">{formatNumber(summary.delivered_quantity)}</dd></div>
                      <div><dt className="text-slate-400">Active</dt><dd className="font-bold text-slate-900">{formatNumber(summary.active_quantity)}</dd></div>
                      <div><dt className="text-slate-400">Genuine cancelled</dt><dd className="font-bold text-red-600">{formatNumber(summary.cancelled_quantity)}</dd></div>
                      <div><dt className="text-slate-400">Duplicate</dt><dd className="font-bold text-slate-600">{formatNumber(summary.duplicate_cancelled_quantity)}</dd></div>
                      <div><dt className="text-slate-400">Orders</dt><dd className="font-bold text-slate-900">{formatNumber(summary.order_count)}</dd></div>
                      <div><dt className="text-slate-400">Stock</dt><dd className="font-bold text-slate-900">{formatNumber(summary.current_stock)}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Selling Products" icon="finishedGoods">
          <DataTable
            rows={data?.top_selling_products || []}
            emptyTitle="No product sales yet"
            summaryColumns={[
              { key: "total_quantity", label: "Qty Ordered" },
              { key: "order_count", label: "Orders" },
            ]}
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => `${formatNumber(row.total_quantity)} ${row.unit || ""}` },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Fulfilled / Delivered Orders" icon="orders">
          <DataTable
            rows={data?.fulfilled_delivered_orders || []}
            emptyTitle="No delivered orders"
            summaryColumns={[
              { key: "total_quantity", label: "Qty" },
            ]}
            columns={[
              { key: "id", label: "Order" },
              { key: "customer_name", label: "Customer" },
              { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status] || "neutral"}>{row.status}</StatusBadge> },
              { key: "total_quantity", label: "Qty", render: (row) => formatNumber(row.total_quantity) },
              { key: "delivered_at", label: "Delivered", render: (row) => formatDate(row.delivered_at || row.created_at) },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
