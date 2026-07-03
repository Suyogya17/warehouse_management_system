import { useCallback, useEffect, useMemo, useState } from "react";
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

function ChartFrame({ children, height = 300 }) {
  return <div className="h-[300px] w-full px-2 py-4 md:px-6" style={{ height }}>{children}</div>;
}

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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Production Trend" icon="production">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly_production_trend || []} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
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
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No user production to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top Produced Products Chart" subtitle="Products ranked by produced quantity." icon="finishedGoods">
        {producedProductRows.length ? (
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

function SalesTab({ data }) {
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
  const statusChartHeight = Math.max(260, statusRows.length * 46 + 72);
  const sellingProductChartHeight = Math.max(300, sellingProductRows.length * 44 + 96);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Order Trend" icon="orders">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly_order_trend || []} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Line type="monotone" dataKey="order_count" name="Orders" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="total_quantity" name="Qty Ordered" stroke="#dc2626" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>

        <SectionCard title="Order Status Summary" icon="orders">
          {statusRows.length ? (
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
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No order status data to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top Selling Products Chart" subtitle="Products ranked by ordered quantity." icon="finishedGoods">
        {sellingProductRows.length ? (
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
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No product sales to chart yet.</div>
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

function DealersTab({ data }) {
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Dealer Quantity Ranking" subtitle="Top dealers by total quantity ordered." icon="users">
          {dealerQuantityRows.length ? (
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
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No dealer quantity to chart yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Dealer Order Ranking" subtitle="Top dealers by number of orders." icon="orders">
          {dealerOrderRows.length ? (
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
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No dealer orders to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Dealer Orders By Status" subtitle="Top dealers split by current order status." icon="orders">
        {dealerStatusRows.length ? (
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
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No workflow activity to chart yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Quantity Handled By User" subtitle="Total product quantity across confirmed, packed, and delivered stages." icon="orders">
          {chartRows.length ? (
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
    if (activeTab === "sales") return <SalesTab data={activeData} />;
    if (activeTab === "dealers") return <DealersTab data={activeData} />;
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
