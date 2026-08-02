import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";
import { formatDate, formatNumber } from "../../utils/format";
import {
  ChartFrame,
  getProductLineColor,
  productName,
} from "./analyticsShared";

const statusTone = {
  FAST: "success",
  HEALTHY: "info",
  SLOW: "warning",
  DEAD_STOCK_RISK: "danger",
  OUT_OF_STOCK: "neutral",
};

const getCartons = (pairs, pairsPerCarton) =>
  Number(pairsPerCarton || 0) > 0
    ? Number(pairs || 0) / Number(pairsPerCarton)
    : 0;

const formatVelocity = (value) =>
  `${Number(value || 0).toFixed(2)} pairs/day`;

const formatPairsAndCartons = (pairs, cartons) =>
  `${formatNumber(pairs)} pairs / ${formatNumber(cartons)} CTN`;

const getStatusMeaning = (status) => {
  switch (status) {
    case "FAST":
      return "is selling quickly and may need production soon";
    case "HEALTHY":
      return "has a healthy balance between recent demand and available stock";
    case "SLOW":
      return "is selling more slowly than most matching products";
    case "DEAD_STOCK_RISK":
      return "has stock but shows a risk of becoming dead stock";
    case "OUT_OF_STOCK":
      return "has no unreserved stock currently available";
    default:
      return "has been analysed using its recent orders and current stock";
  }
};

export default function ProductIntelligence({ token }) {
  const [days, setDays] = useState("90");
  const [mode, setMode] = useState("ALL");
  const [series, setSeries] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("VELOCITY_DESC");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDetail, setProductDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await api.getProductIntelligence(
        {
          days,
          mode,
          series: series === "ALL" ? undefined : series,
          status: status === "ALL" ? undefined : status,
          sort,
          search: debouncedSearch || undefined,
          page,
          per_page: 50,
        },
        token
      );
      setData(result.data || {});
    } catch (requestError) {
      setError(requestError.message || "Could not load product intelligence.");
    } finally {
      setLoading(false);
    }
  }, [days, debouncedSearch, mode, page, series, sort, status, token]);

  useEffect(() => {
    load();
  }, [load]);

  const openProduct = async (row) => {
    try {
      setSelectedProduct(row);
      setProductDetail(null);
      setDetailLoading(true);
      const result = await api.getProductSalesAnalytics(row.id, token);
      setProductDetail(result.data || {});
    } catch (requestError) {
      setError(requestError.message || "Could not load product details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const summary = data?.summary || {};
  const rows = data?.products || [];
  const statusCounts = data?.status_counts || {};
  const selectedSummary = productDetail?.summary || selectedProduct || {};
  const selectedPairsPerCarton = Number(
    selectedProduct?.pairs_per_carton || 0
  );
  const selectedTrend = useMemo(
    () => productDetail?.daily_trend || [],
    [productDetail?.daily_trend]
  );
  const selectedProductLabel = [
    selectedProduct?.article_code || selectedProduct?.name,
    selectedProduct?.color,
  ]
    .filter(Boolean)
    .join(" ");
  const selectedAvailableStock = Number(
    selectedProduct?.available_stock || 0
  );
  const selectedOrderedQuantity = Number(
    selectedProduct?.total_quantity || 0
  );
  const selectedOrderCount = Number(selectedProduct?.order_count || 0);
  const selectedDealerCount = Number(selectedProduct?.dealer_count || 0);
  const selectedInterestCount = Number(selectedProduct?.interest_count || 0);
  const selectedGenuineCancelled = Number(
    selectedProduct?.genuine_cancelled_quantity || 0
  );
  const selectedDuplicateCancelled = Number(
    selectedProduct?.duplicate_cancelled_quantity || 0
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Product Intelligence"
        subtitle="Understand sales speed, slow stock, product interest and initial production requirements."
        icon="finishedGoods"
        actions={
          <Button
            variant="secondary"
            icon="refresh"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      >
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search article, color or size..."
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 xl:col-span-2"
          />
          <select
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
          >
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
            <option value="365">Last 365 days</option>
          </select>
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
          >
            <option value="ALL">All orders</option>
            <option value="NORMAL">Normal orders</option>
            <option value="OFFERS">Offer orders</option>
          </select>
          <select
            value={series}
            onChange={(event) => {
              setSeries(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
          >
            <option value="ALL">All series</option>
            {(data?.series_options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
          >
            <option value="ALL">All statuses</option>
            <option value="FAST">Fast</option>
            <option value="HEALTHY">Healthy</option>
            <option value="SLOW">Slow</option>
            <option value="DEAD_STOCK_RISK">Dead-stock risk</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Fast", statusCounts.FAST],
            ["Healthy", statusCounts.HEALTHY],
            ["Slow", statusCounts.SLOW],
            ["Dead-stock risk", statusCounts.DEAD_STOCK_RISK],
            ["Out of stock", statusCounts.OUT_OF_STOCK],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setStatus(
                  label.toUpperCase().replace(/-/g, "_").replace(/ /g, "_")
                );
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50"
            >
              <span className="text-xs font-semibold uppercase text-slate-500">
                {label}
              </span>
              <strong className="mt-1 block text-xl text-slate-950">
                {formatNumber(value)}
              </strong>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Products"
          value={formatNumber(summary.product_count)}
          icon="finishedGoods"
        />
        <StatCard
          label="Available Stock"
          value={formatPairsAndCartons(
            summary.available_stock,
            summary.available_stock_cartons
          )}
          icon="stock"
        />
        <StatCard
          label={`Ordered · ${days} days`}
          value={formatPairsAndCartons(
            summary.ordered_quantity,
            summary.ordered_quantity_cartons
          )}
          tone="success"
          icon="orders"
        />
        <StatCard
          label="Production Signal"
          value={formatPairsAndCartons(
            summary.recommended_production_pairs,
            summary.recommended_production_cartons
          )}
          tone="calm"
          icon="production"
        />
        <StatCard
          label="Genuine Cancelled"
          value={formatPairsAndCartons(
            summary.genuine_cancelled_quantity,
            summary.genuine_cancelled_cartons
          )}
          tone="alert"
          icon="orders"
        />
        <StatCard
          label="Duplicate Orders"
          value={formatPairsAndCartons(
            summary.duplicate_cancelled_quantity,
            summary.duplicate_cancelled_cartons
          )}
          tone="neutral"
          icon="orders"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Product performance"
        subtitle={data?.velocity_note}
        icon="orders"
        actions={
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
          >
            <option value="VELOCITY_DESC">Fastest first</option>
            <option value="SALES_DESC">Most ordered first</option>
            <option value="STOCK_AGE_DESC">Oldest production first</option>
            <option value="PRODUCTION_DESC">Production needed first</option>
            <option value="ARTICLE_ASC">Article A–Z</option>
          </select>
        }
      >
        {loading && !data ? (
          <div className="px-6 py-12 text-sm text-slate-500">
            Calculating product intelligence...
          </div>
        ) : (
          <DataTable
            rows={rows}
            showToolbar={false}
            wrapCells
            responsiveScroll
            emptyTitle="No matching products"
            serverPagination={{
              ...(data?.pagination || {
                page,
                per_page: 50,
                total: 0,
                total_pages: 1,
              }),
              onPageChange: setPage,
            }}
            columns={[
              {
                key: "product",
                label: "Product",
                render: (row) => (
                  <div>
                    <strong>{row.article_code || row.name}</strong>
                    <div className="text-xs text-slate-500">
                      {row.color || "No color"} · {row.size || "No size"}
                    </div>
                  </div>
                ),
              },
              { key: "sole_code", label: "Series" },
              {
                key: "available_stock",
                label: "Stock",
                render: (row) => (
                  <div>
                    <strong>{formatNumber(row.available_stock)} pairs</strong>
                    <div className="text-xs text-slate-500">
                      {formatNumber(
                        getCartons(row.available_stock, row.pairs_per_carton)
                      )}{" "}
                      CTN · {formatNumber(row.reserved_quantity)} reserved
                    </div>
                  </div>
                ),
              },
              {
                key: "total_quantity",
                label: "Ordered",
                render: (row) => (
                  <div>
                    <strong>{formatNumber(row.total_quantity)} pairs</strong>
                    <div className="text-xs text-slate-500">
                      {formatNumber(
                        getCartons(row.total_quantity, row.pairs_per_carton)
                      )}{" "}
                      CTN · {formatNumber(row.order_count)} orders
                    </div>
                  </div>
                ),
              },
              {
                key: "sales_velocity",
                label: "Velocity",
                render: (row) => formatVelocity(row.sales_velocity),
              },
              {
                key: "dealer_count",
                label: "Dealers / Interest",
                render: (row) => (
                  <div>
                    <strong>{formatNumber(row.dealer_count)} dealers</strong>
                    <div className="text-xs text-slate-500">
                      {formatNumber(row.interest_count)} product opens
                    </div>
                  </div>
                ),
              },
              {
                key: "last_activity",
                label: "Last activity",
                render: (row) => (
                  <div className="text-xs">
                    <div>Order: {formatDate(row.last_order_at)}</div>
                    <div>Production: {formatDate(row.last_production_at)}</div>
                  </div>
                ),
              },
              {
                key: "cancellations",
                label: "Cancelled",
                render: (row) => (
                  <div className="text-xs">
                    <div className="font-semibold text-red-600">
                      Genuine:{" "}
                      {formatNumber(row.genuine_cancelled_quantity)}
                    </div>
                    <div className="text-slate-500">
                      Duplicate:{" "}
                      {formatNumber(row.duplicate_cancelled_quantity)}
                    </div>
                  </div>
                ),
              },
              {
                key: "recommended_production_pairs",
                label: "Initial production signal",
                render: (row) => (
                  <div>
                    <strong>
                      {formatNumber(row.recommended_production_cartons)} CTN
                    </strong>
                    <div className="text-xs text-slate-500">
                      {formatNumber(row.recommended_production_pairs)} pairs
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <div className="space-y-1">
                    <StatusBadge tone={statusTone[row.status]}>
                      {String(row.status || "").replace(/_/g, " ")}
                    </StatusBadge>
                    <div className="max-w-xs text-xs text-slate-500">
                      {row.reason}
                    </div>
                  </div>
                ),
              },
              {
                key: "details",
                label: "",
                render: (row) => (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openProduct(row)}
                  >
                    Details
                  </Button>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      {selectedProduct ? (
        <SectionCard
          title={`Product details · ${productName(selectedProduct)}`}
          subtitle="Day-wise demand and verified order-status quantities."
          icon="finishedGoods"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedProduct(null);
                setProductDetail(null);
              }}
            >
              Close
            </Button>
          }
        >
          {detailLoading ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              Loading product details...
            </div>
          ) : (
            <>
              <div className="m-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:p-5">
                <h3 className="text-base font-bold text-slate-950">
                  How to understand this product
                </h3>
                <p className="mt-1 text-sm text-slate-700">
                  This means{" "}
                  <strong>{selectedProductLabel || "this product"}</strong>{" "}
                  {getStatusMeaning(selectedProduct.status)}.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      Stock: {formatNumber(selectedAvailableStock)} pairs /{" "}
                      {formatNumber(
                        getCartons(
                          selectedAvailableStock,
                          selectedPairsPerCarton
                        )
                      )}{" "}
                      CTN
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      This is the stock currently available after reserved
                      quantities.
                      {selectedPairsPerCarton > 0
                        ? ` One full carton contains ${formatNumber(selectedPairsPerCarton)} pairs.`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      Ordered: {formatNumber(selectedOrderedQuantity)} pairs /{" "}
                      {formatNumber(
                        getCartons(
                          selectedOrderedQuantity,
                          selectedPairsPerCarton
                        )
                      )}{" "}
                      CTN / {formatNumber(selectedOrderCount)} orders
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      During the selected {days} days, customers ordered this
                      quantity through {formatNumber(selectedOrderCount)}{" "}
                      non-cancelled {selectedOrderCount === 1 ? "order" : "orders"}.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      Velocity: {formatVelocity(selectedProduct.sales_velocity)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Calculation: {formatNumber(selectedOrderedQuantity)} pairs
                      {" ÷ "}
                      {days} calendar days ={" "}
                      {Number(selectedProduct.sales_velocity || 0).toFixed(2)}{" "}
                      pairs per day.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      {formatNumber(selectedDealerCount)}{" "}
                      {selectedDealerCount === 1 ? "dealer" : "dealers"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {formatNumber(selectedDealerCount)} different
                      user/dealer{" "}
                      {selectedDealerCount === 1 ? "account placed" : "accounts placed"}{" "}
                      the non-cancelled orders.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      {formatNumber(selectedInterestCount)} product opens
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {selectedInterestCount > 0
                        ? `${formatNumber(selectedInterestCount)} tracked product-interest events were recorded during this period.`
                        : "No tracked user opened this product during this period. Tracking only includes activity recorded after product-interest tracking was deployed."}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900">
                      Cancelled — Genuine:{" "}
                      {formatNumber(selectedGenuineCancelled)}, Duplicate:{" "}
                      {formatNumber(selectedDuplicateCancelled)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Cancelled quantities are shown separately and are not
                      included in ordered quantity or sales velocity.
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone[selectedProduct.status]}>
                      {String(selectedProduct.status || "UNKNOWN").replace(
                        /_/g,
                        " "
                      )}
                    </StatusBadge>
                    <p className="text-xs leading-5 text-slate-600">
                      {selectedProduct.reason ||
                        "The status is based on recent sales velocity and available stock."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
                <StatCard
                  label="Ordered"
                  value={`${formatNumber(selectedSummary.total_quantity)} pairs`}
                  icon="orders"
                />
                <StatCard
                  label="Delivered"
                  value={`${formatNumber(selectedSummary.delivered_quantity)} pairs`}
                  tone="success"
                  icon="orders"
                />
                <StatCard
                  label="Active"
                  value={`${formatNumber(selectedSummary.active_quantity)} pairs`}
                  icon="stock"
                />
                <StatCard
                  label="Genuine Cancelled"
                  value={`${formatNumber(selectedSummary.cancelled_quantity)} pairs`}
                  tone="alert"
                  icon="orders"
                />
                <StatCard
                  label="Duplicate"
                  value={`${formatNumber(selectedSummary.duplicate_cancelled_quantity)} pairs`}
                  tone="neutral"
                  icon="orders"
                />
                <StatCard
                  label="Current Stock"
                  value={`${formatNumber(selectedSummary.current_stock)} pairs`}
                  icon="finishedGoods"
                />
              </div>
              {selectedTrend.length ? (
                <ChartFrame height={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={selectedTrend}
                      margin={{ top: 10, right: 24, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatNumber(value)} />
                      <Line
                        type="monotone"
                        dataKey="total_quantity"
                        name="Ordered pairs"
                        stroke={getProductLineColor(selectedProduct.color)}
                        strokeWidth={3}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartFrame>
              ) : (
                <div className="px-6 py-10 text-sm text-slate-500">
                  No non-cancelled day-wise orders for this product.
                </div>
              )}
              {selectedPairsPerCarton > 0 ? (
                <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
                  Packaging: {formatNumber(selectedPairsPerCarton)} pairs per
                  CTN.
                </p>
              ) : null}
            </>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
