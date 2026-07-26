import { useCallback, useEffect, useMemo, useState } from "react";
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

import Button from "../components/Button";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

const tabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inventory", label: "Inventory" },
  { key: "production", label: "Production" },
  { key: "sales", label: "Sales" },
  { key: "dealers", label: "Dealers" },
  { key: "users", label: "Users" },
  { key: "support", label: "Suggestions" },
];

const statusTone = {
  DELIVERED: "success",
  FULFILLED: "success",
  PACKED: "info",
  CONFIRMED: "info",
  PENDING: "warning",
  CANCELLED: "danger",
};

const numberTooltip = (value) => formatNumber(value);

const productName = (row) =>
  [row.article_code || row.name, row.color, row.size].filter(Boolean).join(" / ");

const shortLabel = (value = "", maxLength = 18) => {
  const text = String(value || "Unknown").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
};

const getSeriesName = (soleCode = "") =>
  String(soleCode || "Unassigned")
    .replace(/[-_\s]*sole$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Unassigned";

const SERIES_COLORS = [
  "#4f46e5",
  "#0f766e",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0284c7",
  "#65a30d",
  "#db2777",
  "#64748b",
];

const getSeriesColor = (index) =>
  SERIES_COLORS[index] || `hsl(${Math.round((index * 137.508) % 360)} 68% 46%)`;

const getProductLineColor = (color = "") => {
  const value = String(color).toLowerCase();
  if (value.includes("red") || value.includes("maroon")) return "#dc2626";
  if (value.includes("blue")) return "#2563eb";
  if (value.includes("green")) return "#059669";
  if (value.includes("orange")) return "#ea580c";
  if (value.includes("pink")) return "#db2777";
  if (value.includes("yellow") || value.includes("gold")) return "#ca8a04";
  if (value.includes("black")) return "#0f172a";
  if (value.includes("grey") || value.includes("gray") || value.includes("white")) return "#64748b";
  return "#4f46e5";
};

function ChartFrame({ children, height = 300 }) {
  return <div className="h-[300px] w-full px-2 py-4 md:px-6" style={{ height }}>{children}</div>;
}

function ChartSummary({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

const sumRows = (rows = [], key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

function WorkflowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const title = row.tooltip_label || row.user_name || row.product_name || row.product_label || row.status || label;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg shadow-slate-900/10">
      <p className="font-semibold text-slate-900">{title}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-900">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
      {row.reason ? <p className="mt-2 max-w-xs text-xs text-slate-500">{row.reason}</p> : null}
    </div>
  );
}

function SeriesSalesTooltip({ active, payload, totalQuantity }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const percentage = totalQuantity > 0
    ? (Number(row.total_quantity || 0) / totalQuantity) * 100
    : 0;

  return (
    <div className="min-w-52 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg shadow-slate-900/10">
      <p className="font-bold text-slate-950">{row.series}</p>
      <div className="mt-2 space-y-1.5 text-slate-600">
        <p className="flex justify-between gap-6"><span>Quantity</span><strong className="text-slate-950">{formatNumber(row.total_quantity)} pairs</strong></p>
        <p className="flex justify-between gap-6"><span>Sales share</span><strong className="text-slate-950">{percentage.toFixed(1)}%</strong></p>
        <p className="flex justify-between gap-6"><span>Orders</span><strong className="text-slate-950">{formatNumber(row.order_count)}</strong></p>
        <p className="flex justify-between gap-6"><span>Products</span><strong className="text-slate-950">{formatNumber(row.product_count)}</strong></p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <SectionCard title="Loading analytics" icon="dashboard">
      <div className="px-6 py-10 text-sm text-slate-500">Loading factory analytics...</div>
    </SectionCard>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <SectionCard title="Analytics unavailable" icon="dashboard">
      <div className="flex flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-red-600">{message}</p>
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </SectionCard>
  );
}

function DashboardTab({ data }) {
  const totals = data?.totals || {};
  const countryVisibilitySummary = data?.country_visibility_summary || [];
  const totalShownProducts = countryVisibilitySummary.reduce(
    (sum, row) => sum + Number(row.shown_product_count || 0),
    0
  );
  const totalOnHoldProducts = countryVisibilitySummary.reduce(
    (sum, row) => sum + Number(row.on_hold_product_count || 0),
    0
  );
  const totalShownStock = countryVisibilitySummary.reduce(
    (sum, row) => sum + Number(row.shown_quantity || 0),
    0
  );
  const totalOnHoldStock = countryVisibilitySummary.reduce(
    (sum, row) => sum + Number(row.on_hold_quantity || 0),
    0
  );
  const countryProductGroups = countryVisibilitySummary.map((row) => ({
    country_code: row.country_code,
    country_label: row.country_label,
    shown_products: (data?.country_shown_products || []).filter(
      (product) => product.country_code === row.country_code
    ),
    on_hold_products: (data?.country_on_hold_products || []).filter(
      (product) => product.country_code === row.country_code
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Raw Material Qty" value={formatNumber(totals.raw_material_quantity)} icon="materials" />
        <StatCard label="Finished Goods Qty" value={formatNumber(totals.finished_goods_quantity)} icon="finishedGoods" />
        <StatCard label="Produced This Month" value={formatNumber(totals.production_this_month)} icon="production" />
        <StatCard label="Orders This Month" value={formatNumber(totals.orders_this_month)} icon="orders" />
        <StatCard label="Reserved Stock" value={formatNumber(totals.reserved_stock)} tone="alert" icon="stock" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Shown Products" value={formatNumber(totalShownProducts)} tone="success" icon="finishedGoods" />
        <StatCard label="On Hold Products" value={formatNumber(totalOnHoldProducts)} tone="alert" icon="eye" />
        <StatCard label="Shown Stock" value={formatNumber(totalShownStock)} icon="stock" />
        <StatCard label="On Hold Stock" value={formatNumber(totalOnHoldStock)} tone="alert" icon="stock" />
      </div>

      <SectionCard title="Customer Catalog by Country" subtitle="How many products customers can see in Nepal and India." icon="eye">
        <ChartSummary
          items={[
            { label: "Countries", value: formatNumber(countryVisibilitySummary.length) },
            { label: "Can See", value: formatNumber(totalShownProducts) },
            { label: "Hidden", value: formatNumber(totalOnHoldProducts) },
            { label: "Visible Stock", value: formatNumber(totalShownStock) },
          ]}
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ChartFrame height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryVisibilitySummary} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="country_label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Bar dataKey="shown_product_count" name="Can See" stackId="products" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="on_hold_product_count" name="Hidden" stackId="products" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <DataTable
            rows={countryVisibilitySummary}
            emptyTitle="No display analytics"
            summaryColumns={[
              { key: "shown_product_count", label: "Can See" },
              { key: "on_hold_product_count", label: "Hidden" },
              { key: "shown_quantity", label: "Visible Stock" },
              { key: "on_hold_quantity", label: "Hidden Stock" },
            ]}
            columns={[
              { key: "country_label", label: "Country" },
              { key: "shown_product_count", label: "Products Customers Can See", render: (row) => formatNumber(row.shown_product_count) },
              { key: "on_hold_product_count", label: "Hidden Products", render: (row) => formatNumber(row.on_hold_product_count) },
              { key: "shown_quantity", label: "Visible Stock", render: (row) => formatNumber(row.shown_quantity) },
              { key: "on_hold_quantity", label: "Hidden Stock", render: (row) => formatNumber(row.on_hold_quantity) },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard title="Hidden Products by Country" subtitle="Products that no customer can see in each country." icon="eye">
        <ChartSummary
          items={[
            { label: "Countries", value: formatNumber(countryVisibilitySummary.length) },
            { label: "Hidden Products", value: formatNumber(totalOnHoldProducts) },
            { label: "Hidden Stock", value: formatNumber(totalOnHoldStock) },
          ]}
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ChartFrame height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryVisibilitySummary} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="country_label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Bar dataKey="on_hold_product_count" name="Hidden Products" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <DataTable
            rows={countryVisibilitySummary}
            emptyTitle="No on-hold analytics"
            summaryColumns={[
              { key: "on_hold_product_count", label: "Hidden" },
              { key: "on_hold_quantity", label: "Hidden Stock" },
            ]}
            columns={[
              { key: "country_label", label: "Country" },
              { key: "on_hold_product_count", label: "Hidden Products", render: (row) => formatNumber(row.on_hold_product_count) },
              { key: "on_hold_quantity", label: "Hidden Stock", render: (row) => formatNumber(row.on_hold_quantity) },
              { key: "total_product_count", label: "Total Products", render: (row) => formatNumber(row.total_product_count) },
            ]}
          />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Selling Products" icon="orders">
          <DataTable
            rows={data?.top_selling_products || []}
            emptyTitle="No product sales yet"
            summaryColumns={[
              { key: "total_quantity", label: "Qty Ordered" },
              { key: "order_count", label: "Orders" },
            ]}
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "total_quantity", label: "Qty Ordered", render: (row) => formatNumber(row.total_quantity) },
              { key: "order_count", label: "Orders", render: (row) => formatNumber(row.order_count) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Top Dealers" icon="users">
          <DataTable
            rows={data?.top_dealers || []}
            emptyTitle="No dealer orders yet"
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
      </div>

      <SectionCard title="Hidden Product List" subtitle="Products customers cannot see, separated by country." icon="eye">
        <div className="space-y-5 p-4">
          {countryProductGroups.map((group) => (
            <div key={`hold-${group.country_code}`} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-950">{group.country_label}</h3>
                <StatusBadge tone={group.on_hold_products.length ? "warning" : "success"}>
                  {formatNumber(group.on_hold_products.length)} hidden
                </StatusBadge>
              </div>
              <DataTable
                rows={group.on_hold_products}
                emptyTitle={`No on-hold products for ${group.country_label}`}
                summaryColumns={[
                  { key: "quantity", label: "Stock" },
                  { key: "country_user_count", label: "Customers" },
                ]}
                columns={[
                  { key: "product", label: "Product", render: productName },
                  { key: "quantity", label: "Stock", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
                  { key: "min_quantity", label: "Minimum", render: (row) => formatNumber(row.min_quantity) },
                  { key: "country_user_count", label: "Customers in Country", render: (row) => formatNumber(row.country_user_count) },
                ]}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Visible Product List" subtitle="Products customers can see, separated by country." icon="finishedGoods">
        <div className="space-y-5 p-4">
          {countryProductGroups.map((group) => (
            <div key={`shown-${group.country_code}`} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-950">{group.country_label}</h3>
                <StatusBadge tone={group.shown_products.length ? "success" : "neutral"}>
                  {formatNumber(group.shown_products.length)} visible
                </StatusBadge>
              </div>
              <DataTable
                rows={group.shown_products}
                emptyTitle={`No shown products for ${group.country_label}`}
                summaryColumns={[
                  { key: "quantity", label: "Stock" },
                  { key: "visible_user_count", label: "Customer Access" },
                ]}
                columns={[
                  { key: "product", label: "Product", render: productName },
                  { key: "quantity", label: "Stock", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
                  { key: "min_quantity", label: "Minimum", render: (row) => formatNumber(row.min_quantity) },
                  { key: "visible_user_count", label: "Customers Who Can See It", render: (row) => `${formatNumber(row.visible_user_count)}/${formatNumber(row.country_user_count)}` },
                ]}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Low Stock Raw Materials" icon="materials">
        <DataTable
          rows={data?.low_stock_raw_materials || []}
          emptyTitle="No low stock materials"
          summaryColumns={[
            { key: "quantity", label: "Current Qty" },
            { key: "min_quantity", label: "Minimum Qty" },
          ]}
          columns={[
            { key: "name", label: "Material" },
            { key: "article_code", label: "Article" },
            { key: "category", label: "Category" },
            { key: "quantity", label: "Current", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
            { key: "min_quantity", label: "Minimum", render: (row) => formatNumber(row.min_quantity) },
          ]}
        />
      </SectionCard>
    </div>
  );
}

function InventoryTab({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Raw Material Stock Summary" icon="materials">
          <DataTable
            rows={data?.raw_material_stock_summary || []}
            emptyTitle="No raw material stock"
            summaryColumns={[
              { key: "material_count", label: "Materials" },
              { key: "total_quantity", label: "Total Qty" },
              { key: "low_stock_count", label: "Low Stock" },
            ]}
            columns={[
              { key: "category", label: "Category" },
              { key: "unit", label: "Unit" },
              { key: "material_count", label: "Materials", render: (row) => formatNumber(row.material_count) },
              { key: "total_quantity", label: "Total Qty", render: (row) => formatNumber(row.total_quantity) },
              { key: "low_stock_count", label: "Low Stock", render: (row) => formatNumber(row.low_stock_count) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Finished Goods Stock Summary" icon="finishedGoods">
          <DataTable
            rows={data?.finished_goods_stock_summary || []}
            emptyTitle="No finished goods stock"
            summaryColumns={[
              { key: "product_count", label: "Products" },
              { key: "total_quantity", label: "Total Qty" },
              { key: "low_stock_count", label: "Low Stock" },
            ]}
            columns={[
              { key: "warehouse_name", label: "Warehouse", render: (row) => row.warehouse_name || "All warehouses" },
              { key: "unit", label: "Unit" },
              { key: "product_count", label: "Products", render: (row) => formatNumber(row.product_count) },
              { key: "total_quantity", label: "Total Qty", render: (row) => formatNumber(row.total_quantity) },
              { key: "low_stock_count", label: "Low Stock", render: (row) => formatNumber(row.low_stock_count) },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Reserved Stock" icon="stock">
        <DataTable
          rows={data?.reserved_stock || []}
          emptyTitle="No reserved stock"
          summaryColumns={[
            { key: "reserved_quantity", label: "Reserved Qty" },
          ]}
          columns={[
            { key: "product", label: "Product", render: productName },
            { key: "reserved_quantity", label: "Reserved Qty", render: (row) => `${formatNumber(row.reserved_quantity)} ${row.unit || ""}` },
          ]}
        />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Low Stock Materials" icon="materials">
          <DataTable
            rows={data?.low_stock_materials || []}
            emptyTitle="No low stock materials"
            summaryColumns={[
              { key: "quantity", label: "Current Qty" },
              { key: "min_quantity", label: "Minimum Qty" },
            ]}
            columns={[
              { key: "name", label: "Material" },
              { key: "article_code", label: "Article" },
              { key: "quantity", label: "Current", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
              { key: "min_quantity", label: "Minimum", render: (row) => formatNumber(row.min_quantity) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Dead Stock Finished Goods" icon="finishedGoods">
          <DataTable
            rows={data?.dead_stock_finished_goods || []}
            emptyTitle="No dead stock products"
            summaryColumns={[
              { key: "quantity", label: "Stock" },
              { key: "reserved_quantity", label: "Reserved" },
            ]}
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "quantity", label: "Stock", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
              { key: "reserved_quantity", label: "Reserved", render: (row) => formatNumber(row.reserved_quantity) },
              { key: "last_order_at", label: "Last Order", render: (row) => formatDate(row.last_order_at) },
              { key: "suggested_action", label: "Suggested Action" },
              { key: "production_action", label: "Production" },
              { key: "suggestion_reason", label: "Reason" },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function ProductionTab({ data }) {
  const [productionSearch, setProductionSearch] = useState("");
  const [productionSeries, setProductionSeries] = useState("");
  const latestProductionRows = data?.latest_product_production || [];
  const productionSeriesOptions = useMemo(() => [...new Set(latestProductionRows
    .map((row) => String(row.sole_code || "").replace(/[-_\s]*sole$/i, "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })), [latestProductionRows]);
  const filteredLatestProduction = useMemo(() => {
    const terms = productionSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return latestProductionRows.filter((row) => {
      const series = String(row.sole_code || "").replace(/[-_\s]*sole$/i, "").trim();
      if (productionSeries && series !== productionSeries) return false;
      const searchable = [row.name, row.article_code, row.sole_code, row.color, row.size]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [latestProductionRows, productionSearch, productionSeries]);
  const latestProductionMatch = filteredLatestProduction[0];
  const productionUserRows = useMemo(
    () =>
      (data?.production_by_user || [])
        .slice()
        .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
        .slice(0, 10)
        .map((row) => ({
          ...row,
          user_label: shortLabel(row.user_name),
          tooltip_label: row.user_name,
        })),
    [data?.production_by_user]
  );
  const producedProductRows = useMemo(
    () =>
      (data?.top_produced_products || [])
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
    [data?.top_produced_products]
  );
  const productionUserChartHeight = Math.max(300, productionUserRows.length * 44 + 96);
  const producedProductChartHeight = Math.max(300, producedProductRows.length * 44 + 96);
  const monthlyProductionRows = data?.monthly_production_trend || [];
  const totalProducedQty = sumRows(monthlyProductionRows, "total_quantity");
  const totalProductionRuns = sumRows(monthlyProductionRows, "production_runs");
  const topProducedProduct = producedProductRows[0];
  const topProductionUser = productionUserRows[0];

  return (
    <div className="space-y-4">
      <SectionCard title="Latest Product Production" subtitle="Search a product and series to see its most recent production date." icon="production">
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_240px]">
          <label className="text-sm font-semibold text-slate-700">Product search
            <input value={productionSearch} onChange={(event) => setProductionSearch(event.target.value)} placeholder="Product, article, color or size..." className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Series
            <select value={productionSeries} onChange={(event) => setProductionSeries(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
              <option value="">All series</option>
              {productionSeriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
            </select>
          </label>
        </div>
        {(productionSearch || productionSeries) && latestProductionMatch && (
          <div className="mx-4 mb-4 grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 sm:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Latest product</p><p className="mt-1 font-bold text-indigo-950">{productName(latestProductionMatch)}</p></div>
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Production date</p><p className="mt-1 font-bold text-indigo-950">{formatDate(latestProductionMatch.latest_production_at)}</p></div>
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Latest produced qty</p><p className="mt-1 font-bold text-indigo-950">{formatNumber(latestProductionMatch.latest_quantity)} {latestProductionMatch.unit || ""}</p></div>
          </div>
        )}
        <DataTable
          rows={filteredLatestProduction}
          emptyTitle="No matching production found"
          columns={[
            { key: "product", label: "Product", render: productName },
            { key: "sole_code", label: "Series", render: (row) => row.sole_code || "-" },
            { key: "latest_production_at", label: "Latest Production", render: (row) => formatDate(row.latest_production_at) },
            { key: "latest_quantity", label: "Latest Qty", render: (row) => `${formatNumber(row.latest_quantity)} ${row.unit || ""}` },
          ]}
        />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Production Trend" icon="production">
          <ChartSummary
            items={[
              { label: "Months", value: formatNumber(monthlyProductionRows.length) },
              { label: "Produced Qty", value: formatNumber(totalProducedQty) },
              { label: "Production Runs", value: formatNumber(totalProductionRuns) },
            ]}
          />
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyProductionRows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Line type="monotone" dataKey="total_quantity" name="Produced Qty" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="production_runs" name="Runs" stroke="#059669" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>

        <SectionCard title="Production By User" icon="users">
          {productionUserRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Users", value: formatNumber(productionUserRows.length) },
                  { label: "Produced Qty", value: formatNumber(sumRows(productionUserRows, "total_quantity")) },
                  { label: "Runs", value: formatNumber(sumRows(productionUserRows, "production_runs")) },
                  { label: "Top User", value: topProductionUser?.user_name || "-" },
                ]}
              />
              <ChartFrame height={productionUserChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={productionUserRows}
                    layout="vertical"
                    margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="user_label"
                      width={118}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Bar dataKey="total_quantity" name="Produced Qty" fill="#0f766e" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No user production to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top Produced Products Chart" subtitle="Products ranked by produced quantity." icon="finishedGoods">
        {producedProductRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: "Products", value: formatNumber(producedProductRows.length) },
                { label: "Produced Qty", value: formatNumber(sumRows(producedProductRows, "total_quantity")) },
                { label: "Runs", value: formatNumber(sumRows(producedProductRows, "production_runs")) },
                { label: "Top Product", value: topProducedProduct?.tooltip_label || "-" },
              ]}
            />
            <ChartFrame height={producedProductChartHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={producedProductRows}
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
                  <Bar dataKey="total_quantity" name="Produced Qty" fill="#4f46e5" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No produced products to chart yet.</div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Produced Products" icon="finishedGoods">
          <DataTable
            rows={data?.top_produced_products || []}
            emptyTitle="No production yet"
            summaryColumns={[
              { key: "total_quantity", label: "Produced Qty" },
              { key: "production_runs", label: "Runs" },
            ]}
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "total_quantity", label: "Produced Qty", render: (row) => `${formatNumber(row.total_quantity)} ${row.unit || ""}` },
              { key: "production_runs", label: "Runs", render: (row) => formatNumber(row.production_runs) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Raw Material Consumption" icon="materials">
          <DataTable
            rows={data?.raw_material_consumption || []}
            emptyTitle="No material consumption"
            summaryColumns={[
              { key: "total_consumed", label: "Consumed" },
            ]}
            columns={[
              { key: "name", label: "Material" },
              { key: "article_code", label: "Article" },
              { key: "category", label: "Category" },
              { key: "total_consumed", label: "Consumed", render: (row) => `${formatNumber(row.total_consumed)} ${row.unit || ""}` },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function SalesTab({ data, token }) {
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
                Cancelled: {formatNumber(selectedProductSummary.cancelled_quantity)} pairs
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
                      <div><dt className="text-slate-400">Cancelled</dt><dd className="font-bold text-red-600">{formatNumber(summary.cancelled_quantity)}</dd></div>
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

function DealersTab({ data, token }) {
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
  const selectedDealer = dealerOptions[Number(selectedDealerIndex)] || null;

  const filteredDealerOptions = useMemo(() => {
    const query = dealerSearch.trim().toLowerCase();
    if (!query) return dealerOptions;
    return dealerOptions.filter((row) =>
      [row.dealer_name, row.dealer_email, row.dealer_role]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [dealerOptions, dealerSearch]);

  useEffect(() => {
    if (selectedDealerIndex || !dealerOptions.length) return;
    setSelectedDealerIndex("0");
  }, [dealerOptions, selectedDealerIndex]);

  useEffect(() => {
    const selected = dealerOptions[Number(selectedDealerIndex)];
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
  }, [analysisMode, dealerOptions, selectedDealerIndex, token]);

  useEffect(() => {
    setSelectedDealerIndex("");
    setDealerDetail(null);
    setProductStatus("ALL");
    setProductSearch("");
  }, [analysisMode]);

  const dealerProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (dealerDetail?.products || []).filter((row) => {
      const matchesStatus = productStatus === "ALL" || row.status === productStatus;
      const matchesSearch = !query || [row.article_code, row.sole_code, row.color, row.size]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [dealerDetail?.products, productSearch, productStatus]);
  const dealerTotalCartons = (dealerDetail?.products || []).reduce(
    (sum, row) => sum + Number(row.ordered_cartons || 0),
    0
  );
  const dealerStatusCounts = (dealerDetail?.products || []).reduce((acc, row) => {
    acc[row.status] = Number(acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const displayedAccountInterest = useMemo(
    () =>
      (data?.account_product_interest || []).filter(
        (row) =>
          Number(row.user_id) === Number(selectedDealer?.dealer_id) &&
          (
            analysisMode !== "OFFERS" ||
            ["OFFERS", "OFFER_GALLERY"].includes(String(row.surface || "").toUpperCase())
          )
      ),
    [analysisMode, data?.account_product_interest, selectedDealer?.dealer_id]
  );
  const displayedSearchTerms = useMemo(
    () =>
      (data?.account_search_terms || []).filter(
        (row) =>
          Number(row.user_id) === Number(selectedDealer?.dealer_id) &&
          (
            analysisMode !== "OFFERS" ||
            ["OFFERS", "OFFER_GALLERY"].includes(String(row.surface || "").toUpperCase())
          )
      ),
    [analysisMode, data?.account_search_terms, selectedDealer?.dealer_id]
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
            onChange={(event) => setSelectedDealerIndex(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Orders" value={formatNumber(dealerDetail.summary?.order_count)} icon="orders" />
              <StatCard label="Ordered Pairs" value={formatNumber(dealerDetail.summary?.total_quantity)} icon="finishedGoods" />
              <StatCard label="Ordered CTN" value={formatNumber(dealerTotalCartons)} icon="stock" />
              <StatCard label="Cancelled Pairs" value={formatNumber(dealerDetail.summary?.cancelled_quantity)} tone="alert" icon="orders" />
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
                    onChange={(event) => setProductStatus(event.target.value)}
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

function UsersTab({ data }) {
  const summary = data?.summary || {};
  const chartRows = useMemo(
    () =>
      (data?.user_workflow_report || [])
        .slice()
        .sort((a, b) => Number(b.total_actions || 0) - Number(a.total_actions || 0))
        .slice(0, 10)
        .map((row) => ({
          ...row,
          user_label: shortLabel(row.user_name),
        })),
    [data?.user_workflow_report]
  );
  const chartHeight = Math.max(300, chartRows.length * 44 + 96);
  const topWorkflowUser = chartRows[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Users" value={formatNumber(summary.active_users)} icon="users" />
        <StatCard label="Confirmed Orders" value={formatNumber(summary.confirmed_orders)} tone="calm" icon="check" />
        <StatCard label="Packed Orders" value={formatNumber(summary.packed_orders)} icon="box" />
        <StatCard label="Delivered Orders" value={formatNumber(summary.delivered_orders)} icon="orders" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Confirmed Qty" value={formatNumber(summary.confirmed_quantity)} tone="calm" icon="check" />
        <StatCard label="Packed Qty" value={formatNumber(summary.packed_quantity)} icon="box" />
        <StatCard label="Delivered Qty" value={formatNumber(summary.delivered_quantity)} tone="alert" icon="orders" />
      </div>

      {data?.missing_workflow_columns?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          User workflow tracking columns are missing. Run the order workflow migration to enable this report.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Orders Handled By User" subtitle="Top users ranked by total workflow actions." icon="users">
          {chartRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Users", value: formatNumber(chartRows.length) },
                  { label: "Total Actions", value: formatNumber(sumRows(chartRows, "total_actions")) },
                  { label: "Delivered", value: formatNumber(sumRows(chartRows, "delivered_orders")) },
                  { label: "Top User", value: topWorkflowUser?.user_name || "-" },
                ]}
              />
              <ChartFrame height={chartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ top: 8, right: 28, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="user_label"
                      width={118}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Legend verticalAlign="top" height={32} />
                    <Bar dataKey="confirmed_orders" name="Confirmed" stackId="orders" fill="#059669" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="packed_orders" name="Packed" stackId="orders" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="delivered_orders" name="Delivered" stackId="orders" fill="#dc2626" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total_actions" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No workflow activity to chart yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Quantity Handled By User" subtitle="Total product quantity across confirmed, packed, and delivered stages." icon="orders">
          {chartRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Users", value: formatNumber(chartRows.length) },
                  { label: "Total Qty", value: formatNumber(sumRows(chartRows, "total_quantity_handled")) },
                  { label: "Delivered Qty", value: formatNumber(sumRows(chartRows, "delivered_quantity")) },
                  { label: "Top User", value: topWorkflowUser?.user_name || "-" },
                ]}
              />
              <ChartFrame height={chartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ top: 8, right: 28, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="user_label"
                      width={118}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Legend verticalAlign="top" height={32} />
                    <Bar dataKey="confirmed_quantity" name="Confirmed Qty" stackId="quantity" fill="#0f766e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="packed_quantity" name="Packed Qty" stackId="quantity" fill="#7c3aed" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="delivered_quantity" name="Delivered Qty" stackId="quantity" fill="#ea580c" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total_quantity_handled" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No workflow quantity to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="User Workflow Report" subtitle="Orders and quantities each user confirmed, packed, and delivered." icon="users">
        <DataTable
          rows={data?.user_workflow_report || []}
          emptyTitle="No user workflow activity"
          emptyDescription="Confirmed, packed, and delivered order activity will appear here."
          exportFilename="user-workflow-report"
          summaryColumns={[
            { key: "confirmed_orders", label: "Confirmed Orders" },
            { key: "confirmed_quantity", label: "Confirmed Qty" },
            { key: "packed_orders", label: "Packed Orders" },
            { key: "packed_quantity", label: "Packed Qty" },
            { key: "delivered_orders", label: "Delivered Orders" },
            { key: "delivered_quantity", label: "Delivered Qty" },
          ]}
          columns={[
            { key: "user_name", label: "User" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role" },
            { key: "confirmed_orders", label: "Confirmed Orders", render: (row) => formatNumber(row.confirmed_orders) },
            { key: "confirmed_quantity", label: "Confirmed Qty", render: (row) => formatNumber(row.confirmed_quantity) },
            { key: "packed_orders", label: "Packed Orders", render: (row) => formatNumber(row.packed_orders) },
            { key: "packed_quantity", label: "Packed Qty", render: (row) => formatNumber(row.packed_quantity) },
            { key: "delivered_orders", label: "Delivered Orders", render: (row) => formatNumber(row.delivered_orders) },
            { key: "delivered_quantity", label: "Delivered Qty", render: (row) => formatNumber(row.delivered_quantity) },
            { key: "total_actions", label: "Total Actions", render: (row) => formatNumber(row.total_actions) },
            { key: "total_quantity_handled", label: "Total Qty", render: (row) => formatNumber(row.total_quantity_handled) },
            { key: "last_confirmed_at", label: "Last Confirmed", render: (row) => formatDate(row.last_confirmed_at) },
            { key: "last_packed_at", label: "Last Packed", render: (row) => formatDate(row.last_packed_at) },
            { key: "last_delivered_at", label: "Last Delivered", render: (row) => formatDate(row.last_delivered_at) },
          ]}
        />
      </SectionCard>
    </div>
  );
}

function SupportTab({ data }) {
  const summary = data?.summary || {};
  const makeSuggestionRows = useMemo(
    () =>
      (data?.make_recommendations || [])
        .slice()
        .sort((a, b) => {
          const priorityDiff = Number(b.priority_score || 0) - Number(a.priority_score || 0);
          if (priorityDiff) return priorityDiff;
          return Number(b.suggested_quantity || 0) - Number(a.suggested_quantity || 0);
        })
        .slice(0, 10)
        .map((row) => ({
          ...row,
          product_label: shortLabel(row.product_name, 24),
          tooltip_label: row.product_name,
        })),
    [data?.make_recommendations]
  );
  const makeSuggestionChartHeight = Math.max(300, makeSuggestionRows.length * 46 + 108);
  const topMakeSuggestion = makeSuggestionRows[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Make Now" value={formatNumber(summary.make_now_count)} tone="alert" icon="production" />
        <StatCard label="Hold Production" value={formatNumber(summary.hold_count)} icon="stock" />
        <StatCard label="Material Risks" value={formatNumber(summary.raw_material_risk_count)} tone="alert" icon="materials" />
        <StatCard label="Urgent Shortages" value={formatNumber(summary.urgent_order_shortage_count)} tone="alert" icon="orders" />
      </div>

      <SectionCard title="Products Suitable To Make" subtitle="Recommended products ranked by shortage, demand, and stock level." icon="production">
        {makeSuggestionRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: "Products", value: formatNumber(makeSuggestionRows.length) },
                { label: "Suggested Qty", value: formatNumber(sumRows(makeSuggestionRows, "suggested_quantity")) },
                { label: "Urgent Shortages", value: formatNumber(summary.urgent_order_shortage_count) },
                { label: "Top Product", value: topMakeSuggestion?.tooltip_label || "-" },
              ]}
            />
            <ChartFrame height={makeSuggestionChartHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={makeSuggestionRows}
                  layout="vertical"
                  margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="product_label"
                    width={166}
                    tick={{ fontSize: 12, fill: "#475569" }}
                    interval={0}
                  />
                  <Tooltip content={<WorkflowTooltip />} />
                  <Legend verticalAlign="top" height={32} />
                  <Bar dataKey="suggested_quantity" name="Suggested Qty" fill="#dc2626" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="suggested_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No products need production right now.</div>
        )}
      </SectionCard>

      <SectionCard title="Suggested To Make" subtitle="Products where active or recent demand is above current stock." icon="production">
        <DataTable
          rows={data?.make_recommendations || []}
          emptyTitle="No production suggestions"
          summaryColumns={[
            { key: "suggested_quantity", label: "Suggested Qty" },
            { key: "reserved_quantity", label: "Reserved Qty" },
            { key: "ordered_last_30_days", label: "30 Day Demand" },
            { key: "current_stock", label: "Current Stock" },
          ]}
          columns={[
            { key: "product_name", label: "Product" },
            { key: "current_stock", label: "Stock", render: (row) => `${formatNumber(row.current_stock)} ${row.unit || ""}` },
            { key: "reserved_quantity", label: "Reserved", render: (row) => formatNumber(row.reserved_quantity) },
            { key: "ordered_last_30_days", label: "30 Day Demand", render: (row) => formatNumber(row.ordered_last_30_days) },
            { key: "suggested_quantity", label: "Suggested Qty", render: (row) => formatNumber(row.suggested_quantity) },
            { key: "reason", label: "Why" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Suggested To Hold" subtitle="Products with high stock and weak recent demand." icon="stock">
        <DataTable
          rows={data?.hold_recommendations || []}
          emptyTitle="No hold suggestions"
          summaryColumns={[
            { key: "current_stock", label: "Current Stock" },
            { key: "ordered_last_90_days", label: "90 Day Demand" },
            { key: "produced_last_30_days", label: "Produced 30 Days" },
          ]}
          columns={[
            { key: "product_name", label: "Product" },
            { key: "current_stock", label: "Stock", render: (row) => `${formatNumber(row.current_stock)} ${row.unit || ""}` },
            { key: "ordered_last_90_days", label: "90 Day Demand", render: (row) => formatNumber(row.ordered_last_90_days) },
            { key: "produced_last_30_days", label: "Produced 30 Days", render: (row) => formatNumber(row.produced_last_30_days) },
            { key: "months_of_stock", label: "Months Stock", render: (row) => formatNumber(row.months_of_stock) },
            { key: "reason", label: "Why" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Raw Material Risks" subtitle="Materials that may block upcoming production." icon="materials">
        <DataTable
          rows={data?.raw_material_risks || []}
          emptyTitle="No raw material risks"
          summaryColumns={[
            { key: "quantity", label: "Current Qty" },
            { key: "min_quantity", label: "Minimum Qty" },
          ]}
          columns={[
            { key: "name", label: "Material" },
            { key: "article_code", label: "Article" },
            { key: "category", label: "Category" },
            { key: "color", label: "Color" },
            { key: "quantity", label: "Current", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
            { key: "min_quantity", label: "Minimum", render: (row) => formatNumber(row.min_quantity) },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dataByTab, setDataByTab] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTab = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await api.getAnalytics(activeTab, token);
      setDataByTab((current) => ({ ...current, [activeTab]: result.data || {} }));
    } catch (err) {
      setError(err.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, token]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const activeData = dataByTab[activeTab];

  const content = () => {
    if (loading && !activeData) return <LoadingState />;
    if (error && !activeData) return <ErrorState message={error} onRetry={loadTab} />;
    if (activeTab === "inventory") return <InventoryTab data={activeData} />;
    if (activeTab === "production") return <ProductionTab data={activeData} />;
    if (activeTab === "sales") return <SalesTab data={activeData} token={token} />;
    if (activeTab === "dealers") return <DealersTab data={activeData} token={token} />;
    if (activeTab === "users") return <UsersTab data={activeData} />;
    if (activeTab === "support") return <SupportTab data={activeData} />;
    return <DashboardTab data={activeData} />;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Factory Analytics"
        title="Factory Analytics"
        description="Inventory, production, sales, dealer performance, and decision support in one operational view."
        icon="dashboard"
        actions={
          <Button variant="secondary" icon="refresh" onClick={loadTab} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`h-10 rounded-xl px-4 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && activeData ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {content()}
    </div>
  );
}
