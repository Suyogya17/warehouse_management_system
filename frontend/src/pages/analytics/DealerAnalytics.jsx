import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTable from "../../components/DataTable";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";
import { formatDate, formatNumber } from "../../utils/format";
import {
  ChartFrame,
  ChartSummary,
  WorkflowTooltip,
  getSeriesName,
  shortLabel,
  statusTone,
  sumRows,
} from "./analyticsShared";

export default function DealerAnalytics({ data, token }) {
  const [analysisMode, setAnalysisMode] = useState("ALL");
  const dealerOptions =
    analysisMode === "OFFERS"
      ? data?.offer_dealer_options || []
      : data?.dealer_options || [];
  const [dealerSearch, setDealerSearch] = useState("");
  const [selectedDealerIndex, setSelectedDealerIndex] = useState("");
  const [dealerDetail, setDealerDetail] = useState(null);
  const [dealerDetailLoading, setDealerDetailLoading] = useState(false);
  const [dealerDetailError, setDealerDetailError] = useState("");
  const [productStatus, setProductStatus] = useState("ALL");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const selectedDealer =
    selectedDealerIndex === ""
      ? null
      : dealerOptions[Number(selectedDealerIndex)] || null;

  const filteredDealerOptions = useMemo(() => {
    const query = dealerSearch.trim().toLowerCase();
    if (!query) return dealerOptions;
    return dealerOptions.filter((row) =>
      [row.dealer_name, row.dealer_email, row.dealer_role]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [dealerOptions, dealerSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedProductSearch(productSearch.trim());
      setProductPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    const selected =
      selectedDealerIndex === ""
        ? null
        : dealerOptions[Number(selectedDealerIndex)];
    if (!selected || !token) {
      setDealerDetail(null);
      return;
    }

    let active = true;
    setDealerDetailLoading(true);
    setDealerDetailError("");
    api.getDealerAnalytics(
      {
        dealer_id: selected.dealer_id,
        mode: analysisMode === "OFFERS" ? "offers" : "all",
        page: productPage,
        per_page: 50,
        product_search: debouncedProductSearch,
        product_status: productStatus === "ALL" ? undefined : productStatus,
      },
      token
    )
      .then((result) => {
        if (active) setDealerDetail(result.data || null);
      })
      .catch((error) => {
        if (active) setDealerDetailError(error.message || "Could not load dealer analysis.");
      })
      .finally(() => {
        if (active) setDealerDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    analysisMode,
    dealerOptions,
    debouncedProductSearch,
    productPage,
    productStatus,
    selectedDealerIndex,
    token,
  ]);

  useEffect(() => {
    setSelectedDealerIndex("");
    setDealerDetail(null);
    setProductStatus("ALL");
    setProductSearch("");
    setProductPage(1);
  }, [analysisMode]);

  const dealerProducts = dealerDetail?.products || [];
  const dealerTotalCartons = Number(
    dealerDetail?.summary?.total_cartons || 0
  );
  const dealerStatusCounts = dealerDetail?.product_status_counts || {};
  const displayedAccountInterest = useMemo(
    () =>
      dealerDetail?.account_product_interest || [],
    [dealerDetail?.account_product_interest]
  );
  const displayedSearchTerms = useMemo(
    () =>
      dealerDetail?.account_search_terms || [],
    [dealerDetail?.account_search_terms]
  );

  const monthlyTopRows = useMemo(
    () => (data?.dealer_monthly_order_trend || []).slice(0, 50),
    [data?.dealer_monthly_order_trend]
  );
  const dealerQuantityRows = useMemo(
    () =>
      (data?.top_dealers_by_quantity || [])
        .slice()
        .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
        .slice(0, 10)
        .map((row) => ({
          ...row,
          dealer_label: shortLabel(row.dealer_name, 20),
          tooltip_label: row.dealer_name,
        })),
    [data?.top_dealers_by_quantity]
  );
  const dealerOrderRows = useMemo(
    () =>
      (data?.top_dealers_by_order_count || [])
        .slice()
        .sort((a, b) => Number(b.order_count || 0) - Number(a.order_count || 0))
        .slice(0, 10)
        .map((row) => ({
          ...row,
          dealer_label: shortLabel(row.dealer_name, 20),
          tooltip_label: row.dealer_name,
        })),
    [data?.top_dealers_by_order_count]
  );
  const dealerStatusRows = useMemo(() => {
    const grouped = (data?.dealer_order_status_summary || []).reduce((acc, row) => {
      const key = row.dealer_name || "Unknown dealer";
      acc[key] = acc[key] || {
        dealer_name: key,
        dealer_label: shortLabel(key, 20),
        tooltip_label: key,
        PENDING: 0,
        CONFIRMED: 0,
        PACKED: 0,
        DELIVERED: 0,
        FULFILLED: 0,
        DUPLICATE: 0,
        CANCELLED: 0,
        total_orders: 0,
      };
      const status = row.status || "PENDING";
      acc[key][status] = Number(acc[key][status] || 0) + Number(row.order_count || 0);
      acc[key].total_orders += Number(row.order_count || 0);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => Number(b.total_orders || 0) - Number(a.total_orders || 0))
      .slice(0, 10);
  }, [data?.dealer_order_status_summary]);
  const dealerQuantityChartHeight = Math.max(300, dealerQuantityRows.length * 44 + 96);
  const dealerOrderChartHeight = Math.max(300, dealerOrderRows.length * 44 + 96);
  const dealerStatusChartHeight = Math.max(300, dealerStatusRows.length * 44 + 96);
  const topDealerByQuantity = dealerQuantityRows[0];
  const topDealerByOrders = dealerOrderRows[0];
  const topDealerByStatus = dealerStatusRows[0];

  return (
    <div className="space-y-4">
      <SectionCard
        title={analysisMode === "OFFERS" ? "Dealer Offer Product Intelligence" : "Dealer Product Intelligence"}
        subtitle={
          analysisMode === "OFFERS"
            ? "Choose a dealer account to analyse its offer orders and the customer shops it supplied."
            : "Choose a dealer account to see what it sells, misses, stopped ordering, and may take next."
        }
        icon="users"
      >
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <select
            value={analysisMode}
            onChange={(event) => setAnalysisMode(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="ALL">All products</option>
            <option value="OFFERS">Offer products only</option>
          </select>
          <input
            value={dealerSearch}
            onChange={(event) => setDealerSearch(event.target.value)}
            placeholder="Search dealer name or email..."
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
          <select
            value={selectedDealerIndex}
            onChange={(event) => {
              setSelectedDealerIndex(event.target.value);
              setProductPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">Select a dealer to load details</option>
            {!filteredDealerOptions.length ? <option value="">No dealer found</option> : null}
            {filteredDealerOptions.map((dealer) => {
              const originalIndex = dealerOptions.indexOf(dealer);
              return (
                <option key={`${dealer.dealer_id}-${dealer.dealer_email}-${originalIndex}`} value={originalIndex}>
                  {dealer.dealer_name}
                  {dealer.dealer_email ? ` · ${dealer.dealer_email}` : ""}
                  {` · ${formatNumber(dealer.customer_count)} customers`}
                  {` · ${formatNumber(dealer.total_quantity)} ${analysisMode === "OFFERS" ? "offer pairs ordered" : "pairs ordered"}`}
                </option>
              );
            })}
          </select>
        </div>

        {dealerDetailLoading ? (
          <div className="px-6 py-12 text-sm text-slate-500">Loading dealer product analysis...</div>
        ) : dealerDetailError ? (
          <div className="px-6 py-8 text-sm font-semibold text-red-600">{dealerDetailError}</div>
        ) : dealerDetail ? (
          <div className="space-y-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <StatCard label="Orders" value={formatNumber(dealerDetail.summary?.order_count)} icon="orders" />
              <StatCard label="Ordered Pairs" value={formatNumber(dealerDetail.summary?.total_quantity)} icon="finishedGoods" />
              <StatCard label="Ordered CTN" value={formatNumber(dealerTotalCartons)} icon="stock" />
              <StatCard label="Genuine Cancelled Pairs" value={formatNumber(dealerDetail.summary?.cancelled_quantity)} tone="alert" icon="orders" />
              <StatCard label="Duplicate Pairs" value={formatNumber(dealerDetail.summary?.duplicate_cancelled_quantity)} tone="neutral" icon="orders" />
              <StatCard label="Cancellation Rate" value={`${Number(dealerDetail.summary?.cancellation_rate || 0).toFixed(1)}%`} tone="alert" icon="users" />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                <h3 className="font-bold text-slate-950">Monthly sales trend</h3>
                <p className="text-sm text-slate-500">Non-cancelled quantities during the last 12 months.</p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dealerDetail.monthly_trend || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                      <Tooltip content={<WorkflowTooltip />} />
                      <Line type="monotone" dataKey="total_quantity" name="Ordered pairs" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-950">Best series</h3>
                  <div className="mt-3 space-y-2">
                    {(dealerDetail.best_series || []).slice(0, 5).map((row) => (
                      <div key={row.name} className="flex justify-between gap-3 text-sm">
                        <span className="truncate text-slate-600">{getSeriesName(row.name)}</span>
                        <strong>{formatNumber(row.total_quantity)} pairs</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-950">Best colors</h3>
                  <div className="mt-3 space-y-2">
                    {(dealerDetail.best_colors || []).slice(0, 5).map((row) => (
                      <div key={row.name} className="flex justify-between gap-3 text-sm">
                        <span className="truncate text-slate-600">{row.name}</span>
                        <strong>{formatNumber(row.total_quantity)} pairs</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-950">Customers supplied by this dealer</h3>
              <p className="mb-3 text-sm text-slate-500">
                Customer shops are shown under the dealer account; they are not treated as dealers.
              </p>
              <DataTable
                rows={dealerDetail.customers || []}
                emptyTitle="No customer orders for this dealer"
                columns={[
                  { key: "customer_name", label: "Customer shop" },
                  { key: "customer_phone", label: "Phone" },
                  { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
                  { key: "total_quantity", label: "Pairs", render: (row) => formatNumber(row.total_quantity) },
                  { key: "cancelled_quantity", label: "Cancelled", render: (row) => formatNumber(row.cancelled_quantity) },
                  { key: "last_order_at", label: "Last order", render: (row) => row.last_order_at ? formatDate(row.last_order_at) : "-" },
                ]}
              />
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-bold text-slate-950">Product performance</h3>
                  <p className="text-sm text-slate-500">Statuses explain current stock and this dealer's ordering pattern.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search product, series or color..."
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400"
                  />
                  <select
                    value={productStatus}
                    onChange={(event) => {
                      setProductStatus(event.target.value);
                      setProductPage(1);
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  >
                    <option value="ALL">All statuses</option>
                    {["GREAT", "LOW SALES", "NOT TAKEN", "STOPPED ORDERING", "OUT OF STOCK"].map((status) => (
                      <option key={status} value={status}>{status} ({formatNumber(dealerStatusCounts[status] || 0)})</option>
                    ))}
                  </select>
                </div>
              </div>
              <DataTable
                rows={dealerProducts}
                emptyTitle="No products match this filter"
                exportFilename={`dealer-product-analysis-${dealerDetail.dealer?.name || "dealer"}`}
                showToolbar={false}
                serverPagination={{
                  ...(dealerDetail.product_pagination || {
                    page: 1,
                    per_page: dealerProducts.length || 50,
                    total: dealerProducts.length,
                    total_pages: 1,
                  }),
                  onPageChange: setProductPage,
                }}
                columns={[
                  { key: "article_code", label: "Product" },
                  { key: "sole_code", label: "Series", render: (row) => getSeriesName(row.sole_code) },
                  { key: "color", label: "Color" },
                  ...(analysisMode === "OFFERS" ? [{
                    key: "offer_state",
                    label: "Offer",
                    render: (row) => <StatusBadge tone={Number(row.is_active_offer) === 1 ? "success" : "neutral"}>{Number(row.is_active_offer) === 1 ? "ACTIVE" : "ENDED"}</StatusBadge>,
                  }] : []),
                  {
                    key: "ordered",
                    label: analysisMode === "OFFERS" ? "Taken / shown" : "Taken",
                    exportValue: (row) =>
                      analysisMode === "OFFERS"
                        ? `${row.ordered_cartons} CTN / ${row.total_quantity} pairs taken out of ${row.assigned_cartons || 0} CTN / ${row.assigned_quantity || 0} pairs shown`
                        : `${row.ordered_cartons} CTN / ${row.total_quantity} pairs`,
                    render: (row) => (
                      <div className="min-w-36">
                        <strong>{formatNumber(row.ordered_cartons)} CTN</strong>
                        <p className="text-xs text-slate-500">{formatNumber(row.total_quantity)} pairs taken</p>
                        {analysisMode === "OFFERS" ? (
                          row.assigned_quantity > 0 ? (
                            <p className="mt-1 border-t border-slate-200 pt-1 text-xs font-semibold text-indigo-700">
                              out of {formatNumber(row.assigned_cartons)} CTN · {formatNumber(row.assigned_quantity)} pairs shown
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">No saved shown-limit snapshot</p>
                          )
                        ) : null}
                      </div>
                    ),
                  },
                  { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
                  { key: "last_order_at", label: "Last order", render: (row) => row.last_order_at ? formatDate(row.last_order_at) : "-" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge tone={row.status === "GREAT" ? "success" : row.status === "OUT OF STOCK" ? "danger" : row.status === "LOW SALES" ? "warning" : "neutral"}>{row.status}</StatusBadge> },
                  { key: "reason", label: "Why / evidence" },
                ]}
              />
            </div>

            <div>
              <h3 className="font-bold text-slate-950">Suggested products to discuss with this dealer</h3>
              <p className="mb-3 text-sm text-slate-500">In-stock products ranked by demand from other dealers.</p>
              <DataTable
                rows={dealerDetail.suggestions || []}
                emptyTitle="No product suggestions"
                columns={[
                  { key: "article_code", label: "Product" },
                  { key: "sole_code", label: "Series", render: (row) => getSeriesName(row.sole_code) },
                  { key: "color", label: "Color" },
                  { key: "status", label: "Dealer status" },
                  { key: "global_quantity", label: "Other dealer demand", render: (row) => `${formatNumber(row.global_quantity)} pairs` },
                  { key: "current_stock", label: "Stock", render: (row) => `${formatNumber(row.current_stock)} pairs` },
                  { key: "reason", label: "Recommendation reason" },
                ]}
              />
            </div>
          </div>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">Select a dealer to view product intelligence.</div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Most Interested Products By Account" subtitle="Products opened or added from Gallery, Offers, or Our Products." icon="finishedGoods">
          <DataTable
            rows={displayedAccountInterest}
            emptyTitle={data?.product_interest_tracking_ready ? "No product interest recorded yet" : "Run the product-interest SQL migration"}
            columns={[
              { key: "account_name", label: "Account" },
              { key: "email", label: "Email" },
              { key: "article_code", label: "Product" },
              { key: "color", label: "Color" },
              { key: "surface", label: "Page" },
              { key: "interest_count", label: "Interest", render: (row) => formatNumber(row.interest_count) },
              { key: "converted_order_count", label: "Orders after interest", render: (row) => formatNumber(row.converted_order_count) },
              { key: "converted_quantity", label: "Ordered pairs", render: (row) => formatNumber(row.converted_quantity) },
              { key: "account_conversion_rate", label: "Account conversion", render: (row) => `${Number(row.account_conversion_rate || 0).toFixed(1)}%` },
              { key: "conversion", label: "Conversion", render: (row) => <StatusBadge tone={Number(row.converted_order_count || 0) > 0 ? "success" : "warning"}>{Number(row.converted_order_count || 0) > 0 ? "ORDERED" : "NOT ORDERED"}</StatusBadge> },
              { key: "last_interested_at", label: "Last interest", render: (row) => formatDate(row.last_interested_at) },
            ]}
          />
        </SectionCard>
        <SectionCard title="Most Searched Terms By Account" subtitle="Debounced searches, recorded after the user stops typing." icon="users">
          <DataTable
            rows={displayedSearchTerms}
            emptyTitle={data?.product_interest_tracking_ready ? "No searches recorded yet" : "Run the product-interest SQL migration"}
            columns={[
              { key: "account_name", label: "Account" },
              { key: "email", label: "Email" },
              { key: "search_term", label: "Search" },
              { key: "surface", label: "Page" },
              { key: "search_count", label: "Searches", render: (row) => formatNumber(row.search_count) },
              { key: "last_searched_at", label: "Last searched", render: (row) => formatDate(row.last_searched_at) },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Dealer Quantity Ranking" subtitle="Top dealers by total quantity ordered." icon="users">
          {dealerQuantityRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Dealers", value: formatNumber(dealerQuantityRows.length) },
                  { label: "Qty Ordered", value: formatNumber(sumRows(dealerQuantityRows, "total_quantity")) },
                  { label: "Orders", value: formatNumber(sumRows(dealerQuantityRows, "order_count")) },
                  { label: "Top Dealer", value: topDealerByQuantity?.dealer_name || "-" },
                ]}
              />
              <ChartFrame height={dealerQuantityChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dealerQuantityRows}
                    layout="vertical"
                    margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="dealer_label"
                      width={136}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Bar dataKey="total_quantity" name="Qty Ordered" fill="#0f766e" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No dealer quantity to chart yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Dealer Order Ranking" subtitle="Top dealers by number of orders." icon="orders">
          {dealerOrderRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Dealers", value: formatNumber(dealerOrderRows.length) },
                  { label: "Orders", value: formatNumber(sumRows(dealerOrderRows, "order_count")) },
                  { label: "Qty Ordered", value: formatNumber(sumRows(dealerOrderRows, "total_quantity")) },
                  { label: "Top Dealer", value: topDealerByOrders?.dealer_name || "-" },
                ]}
              />
              <ChartFrame height={dealerOrderChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dealerOrderRows}
                    layout="vertical"
                    margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="dealer_label"
                      width={136}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Bar dataKey="order_count" name="Orders" fill="#4f46e5" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="order_count" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No dealer orders to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Dealer Orders By Status" subtitle="Top dealers split by current order status." icon="orders">
        {dealerStatusRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: "Dealers", value: formatNumber(dealerStatusRows.length) },
                { label: "Orders", value: formatNumber(sumRows(dealerStatusRows, "total_orders")) },
                { label: "Pending", value: formatNumber(sumRows(dealerStatusRows, "PENDING")) },
                { label: "Top Dealer", value: topDealerByStatus?.dealer_name || "-" },
              ]}
            />
            <ChartFrame height={dealerStatusChartHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dealerStatusRows}
                  layout="vertical"
                  margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="dealer_label"
                    width={136}
                    tick={{ fontSize: 12, fill: "#475569" }}
                    interval={0}
                  />
                  <Tooltip content={<WorkflowTooltip />} />
                  <Legend verticalAlign="top" height={32} />
                  <Bar dataKey="PENDING" name="Pending" stackId="dealerStatus" fill="#f59e0b" />
                  <Bar dataKey="CONFIRMED" name="Confirmed" stackId="dealerStatus" fill="#059669" />
                  <Bar dataKey="PACKED" name="Packed" stackId="dealerStatus" fill="#4f46e5" />
                  <Bar dataKey="DELIVERED" name="Delivered" stackId="dealerStatus" fill="#0f766e" />
                  <Bar dataKey="FULFILLED" name="Fulfilled" stackId="dealerStatus" fill="#22c55e" />
                  <Bar dataKey="DUPLICATE" name="Duplicate order" stackId="dealerStatus" fill="#94a3b8" />
                  <Bar dataKey="CANCELLED" name="Cancelled" stackId="dealerStatus" fill="#dc2626" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="total_orders" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No dealer status data to chart yet.</div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Dealers By Quantity" icon="users">
          <DataTable
            rows={data?.top_dealers_by_quantity || []}
            emptyTitle="No dealer quantity data"
            summaryColumns={[
              { key: "customer_count", label: "Customers" },
              { key: "total_quantity", label: "Qty Ordered" },
              { key: "order_count", label: "Orders" },
            ]}
            columns={[
              { key: "dealer_name", label: "Dealer" },
              { key: "dealer_email", label: "Email" },
              { key: "customer_count", label: "Customers", render: (row) => formatNumber(row.customer_count) },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Top Dealers By Order Count" icon="users">
          <DataTable
            rows={data?.top_dealers_by_order_count || []}
            emptyTitle="No dealer order data"
            summaryColumns={[
              { key: "customer_count", label: "Customers" },
              { key: "order_count", label: "Orders" },
              { key: "total_quantity", label: "Qty Ordered" },
            ]}
            columns={[
              { key: "dealer_name", label: "Dealer" },
              { key: "dealer_email", label: "Email" },
              { key: "customer_count", label: "Customers", render: (row) => formatNumber(row.customer_count) },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Dealer Order Status Summary" icon="orders">
          <DataTable
            rows={data?.dealer_order_status_summary || []}
            emptyTitle="No dealer status data"
            summaryColumns={[
              { key: "order_count", label: "Orders" },
              { key: "total_quantity", label: "Qty Ordered" },
            ]}
            columns={[
              { key: "dealer_name", label: "Dealer" },
              { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status] || "neutral"}>{row.status}</StatusBadge> },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Dealer Monthly Order Trend" icon="orders">
          <DataTable
            rows={monthlyTopRows}
            emptyTitle="No dealer monthly trend"
            summaryColumns={[
              { key: "order_count", label: "Orders" },
              { key: "total_quantity", label: "Qty Ordered" },
            ]}
            columns={[
              { key: "month", label: "Month" },
              { key: "dealer_name", label: "Dealer" },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Dealer Customers" icon="users">
        <DataTable
          rows={data?.dealer_customer_summary || []}
          emptyTitle="No dealer customer data"
          summaryColumns={[
            { key: "order_count", label: "Orders" },
            { key: "total_quantity", label: "Qty Ordered" },
          ]}
          columns={[
            { key: "dealer_name", label: "Dealer" },
            { key: "customer_name", label: "Customer" },
            { key: "customer_phone", label: "Customer Phone" },
            { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
            { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
          ]}
        />
      </SectionCard>
    </div>
  );
}
