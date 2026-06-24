import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

function ChartFrame({ children, height = 300 }) {
  return <div className="h-[300px] w-full px-2 py-4 md:px-6" style={{ height }}>{children}</div>;
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Raw Material Qty" value={formatNumber(totals.raw_material_quantity)} icon="materials" />
        <StatCard label="Finished Goods Qty" value={formatNumber(totals.finished_goods_quantity)} icon="finishedGoods" />
        <StatCard label="Produced This Month" value={formatNumber(totals.production_this_month)} icon="production" />
        <StatCard label="Orders This Month" value={formatNumber(totals.orders_this_month)} icon="orders" />
        <StatCard label="Reserved Stock" value={formatNumber(totals.reserved_stock)} tone="alert" icon="stock" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Selling Products" icon="orders">
          <DataTable
            rows={data?.top_selling_products || []}
            emptyTitle="No product sales yet"
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

      <SectionCard title="Low Stock Raw Materials" icon="materials">
        <DataTable
          rows={data?.low_stock_raw_materials || []}
          emptyTitle="No low stock materials"
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
            columns={[
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
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "quantity", label: "Stock", render: (row) => `${formatNumber(row.quantity)} ${row.unit || ""}` },
              { key: "last_order_at", label: "Last Order", render: (row) => formatDate(row.last_order_at) },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function ProductionTab({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Production Trend" icon="production">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly_production_trend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Line type="monotone" dataKey="total_quantity" name="Produced Qty" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="production_runs" name="Runs" stroke="#059669" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>

        <SectionCard title="Production By User" icon="users">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.production_by_user || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="user_name" />
                <YAxis />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Bar dataKey="total_quantity" name="Produced Qty" fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Produced Products" icon="finishedGoods">
          <DataTable
            rows={data?.top_produced_products || []}
            emptyTitle="No production yet"
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

function SalesTab({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Order Trend" icon="orders">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly_order_trend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Line type="monotone" dataKey="order_count" name="Orders" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="total_quantity" name="Qty Ordered" stroke="#dc2626" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>

        <SectionCard title="Order Status Summary" icon="orders">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.order_status_summary || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip formatter={numberTooltip} />
                <Bar dataKey="order_count" name="Orders" fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Selling Products" icon="finishedGoods">
          <DataTable
            rows={data?.top_selling_products || []}
            emptyTitle="No product sales yet"
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

function DealersTab({ data }) {
  const monthlyTopRows = useMemo(
    () => (data?.dealer_monthly_order_trend || []).slice(0, 50),
    [data?.dealer_monthly_order_trend]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Dealers By Quantity" icon="users">
          <DataTable
            rows={data?.top_dealers_by_quantity || []}
            emptyTitle="No dealer quantity data"
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
    if (activeTab === "sales") return <SalesTab data={activeData} />;
    if (activeTab === "dealers") return <DealersTab data={activeData} />;
    return <DashboardTab data={activeData} />;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Factory Analytics"
        title="Factory Analytics"
        description="Inventory, production, sales, and dealer performance in one operational view."
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
