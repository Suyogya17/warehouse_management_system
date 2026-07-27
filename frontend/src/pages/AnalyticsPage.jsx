import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import DealerAnalytics from "./analytics/DealerAnalytics";
import ProductionAnalytics from "./analytics/ProductionAnalytics";
import SalesAnalytics from "./analytics/SalesAnalytics";
import {
  ChartFrame,
  ChartSummary,
  WorkflowTooltip,
  numberTooltip,
  productName,
  shortLabel,
  statusTone,
  sumRows,
} from "./analytics/analyticsShared";
import useAnalytics from "./analytics/useAnalytics";

const ProductIntelligence = lazy(
  () => import("./analytics/ProductIntelligence")
);

const tabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inventory", label: "Inventory" },
  { key: "products", label: "Product Intelligence" },
  { key: "production", label: "Production" },
  { key: "sales", label: "Sales" },
  { key: "dealers", label: "Dealers" },
  { key: "users", label: "Users" },
  { key: "support", label: "Suggestions" },
];

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
  const {
    activeTab,
    setActiveTab,
    activeData,
    loading,
    error,
    loadTab,
  } = useAnalytics(token);

  const content = () => {
    if (activeTab === "products") {
      return (
        <Suspense fallback={<LoadingState />}>
          <ProductIntelligence token={token} />
        </Suspense>
      );
    }
    if (loading && !activeData) return <LoadingState />;
    if (error && !activeData) return <ErrorState message={error} onRetry={loadTab} />;
    if (activeTab === "inventory") return <InventoryTab data={activeData} />;
    if (activeTab === "production") return <ProductionAnalytics data={activeData} />;
    if (activeTab === "sales") return <SalesAnalytics data={activeData} token={token} />;
    if (activeTab === "dealers") return <DealerAnalytics data={activeData} token={token} />;
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
          activeTab === "products" ? null : (
            <Button variant="secondary" icon="refresh" onClick={loadTab} disabled={loading}>
              Refresh
            </Button>
          )
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
