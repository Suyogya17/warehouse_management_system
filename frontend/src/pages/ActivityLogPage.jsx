import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatEnglishDate, formatNumber, formatTime, titleCase } from "../utils/format";

const initialFilters = {
  search: "",
  user_id: "",
  module: "",
  action_type: "",
  entity_type: "",
  date_from: "",
  date_to: "",
};

const actionTone = {
  CREATE: "success",
  UPDATE: "info",
  DELETE: "danger",
  HIDE: "warning",
  SHOW: "success",
  ORDER_PLACED: "info",
  CONFIRMED: "success",
  PACKED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
  PRINTED: "info",
  TRANSFER: "warning",
  CONSUMPTION: "danger",
  STOCK_ADDED: "success",
};

const moduleTone = {
  finished_goods: "info",
  raw_materials: "warning",
  orders: "success",
  warehouse: "neutral",
  consumption: "danger",
  stock: "success",
  product_visibility: "warning",
};

const PAGE_SIZE = 25;

const formatLabel = (value) => titleCase(String(value || "-").replace(/-/g, "_"));

const metadataSummary = (metadata) => {
  if (!metadata) return "-";
  if (typeof metadata === "string") return metadata;

  const keys = [
    "quantity",
    "quantity_added",
    "from_warehouse_name",
    "to_warehouse_name",
    "warehouse_name",
    "reason",
    "notes",
    "delivery_note_number",
  ];

  const parts = keys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== "")
    .map((key) => `${formatLabel(key)}: ${metadata[key]}`);

  return parts.length ? parts.join(" | ") : "-";
};

const hasOrderItemComparison = (metadata) =>
  metadata &&
  typeof metadata === "object" &&
  Array.isArray(metadata.before) &&
  Array.isArray(metadata.after);

const buildOrderItemChanges = (metadata) => {
  if (!hasOrderItemComparison(metadata)) return [];

  const itemKey = (item, index) =>
    Number(item?.finished_good_id) > 0
      ? `product:${Number(item.finished_good_id)}`
      : `name:${String(item?.product_name || "Unknown product").toLowerCase()}:${index}`;
  const before = new Map(
    metadata.before.map((item, index) => [itemKey(item, index), item])
  );
  const after = new Map(
    metadata.after.map((item, index) => [itemKey(item, index), item])
  );
  const changes = [];

  for (const [key, previous] of before) {
    const current = after.get(key);
    if (!current) {
      changes.push({ type: "Removed", product: previous.product_name, before: previous, after: null });
      continue;
    }
    if (Math.abs(Number(previous.qty_ordered || 0) - Number(current.qty_ordered || 0)) > 0.001) {
      changes.push({ type: "Quantity changed", product: current.product_name || previous.product_name, before: previous, after: current });
    }
  }
  for (const [key, current] of after) {
    if (!before.has(key)) {
      changes.push({ type: "Added", product: current.product_name, before: null, after: current });
    }
  }

  return changes;
};

const formatOrderItemQuantity = (item) => {
  if (!item) return "0 pairs";
  const pairs = Number(item.qty_ordered || 0);
  const cartons = Number(item.carton_qty);
  return Number.isFinite(cartons)
    ? `${formatNumber(cartons)} CTN / ${formatNumber(pairs)} pairs`
    : `${formatNumber(pairs)} pairs`;
};

export default function ActivityLogPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [filterOptions, setFilterOptions] = useState({
    users: [],
    modules: [],
    action_types: [],
    entity_types: [],
  });
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [selectedChangeLog, setSelectedChangeLog] = useState(null);

  const selectedItemChanges = useMemo(
    () => buildOrderItemChanges(selectedChangeLog?.metadata),
    [selectedChangeLog]
  );

  const params = useMemo(
    () => ({
      ...filters,
      page: pagination.page,
      limit: PAGE_SIZE,
    }),
    [filters, pagination.page]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getActivityLogs(token, params);
      setLogs(result.data || []);
      setFilterOptions((current) => result.filters || current);
      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (error) {
      showToast({
        tone: "error",
        title: "Activity logs failed to load",
        message: error.message || "Could not load activity logs.",
      });
    } finally {
      setLoading(false);
    }
  }, [params, showToast, token]);

  useEffect(() => {
    load();
  }, [load]);

  const updateFilter = (key, value) => {
    setPagination((current) => ({ ...current, page: 1 }));
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPagination((current) => ({ ...current, page: 1 }));
    setFilters(initialFilters);
  };

  const exportExcel = () => {
    const rows = logs.map((log) => ({
      "Date & Time": log.created_at_formatted || formatEnglishDate(log.created_at),
      User: log.user_name || "-",
      Role: log.user_role || "-",
      Module: formatLabel(log.module),
      Action: formatLabel(log.action_type),
      Details: log.description || "-",
      Entity: log.entity_name || log.entity_id || "-",
      "Extra Info": metadataSummary(log.metadata),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Activity Logs");
    XLSX.writeFile(workbook, "activity-logs.xlsx");
  };

  const pageStart = pagination.total ? (pagination.page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  const renderLogCard = (log) => (
    <article key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{log.user_name || "Unknown user"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatEnglishDate(log.created_at)} · {formatTime(log.created_at)}
          </p>
        </div>
        <StatusBadge tone={actionTone[log.action_type] || "neutral"}>
          {formatLabel(log.action_type)}
        </StatusBadge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge tone={moduleTone[log.module] || "neutral"}>{formatLabel(log.module)}</StatusBadge>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {log.user_role || "-"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-700">{log.description || "-"}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{log.entity_name || log.entity_id || "-"}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{metadataSummary(log.metadata)}</p>
      {hasOrderItemComparison(log.metadata) ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => setSelectedChangeLog(log)}
        >
          View Changes
        </Button>
      ) : null}
    </article>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Activity Logs"
        description="Search important product, order, stock, warehouse, and consumption activity."
        icon="ledger"
        actions={
          <Button variant="secondary" icon="download" onClick={exportExcel} disabled={!logs.length}>
            Export Excel
          </Button>
        }
      />

      <SectionCard title="Filters" icon="search">
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search logs..."
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 sm:col-span-2 xl:col-span-2"
          />

          <select
            value={filters.user_id}
            onChange={(event) => updateFilter("user_id", event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">All users</option>
            {filterOptions.users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>

          <select
            value={filters.module}
            onChange={(event) => updateFilter("module", event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">All modules</option>
            {filterOptions.modules.map((module) => (
              <option key={module} value={module}>{formatLabel(module)}</option>
            ))}
          </select>

          <select
            value={filters.action_type}
            onChange={(event) => updateFilter("action_type", event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">All actions</option>
            {filterOptions.action_types.map((action) => (
              <option key={action} value={action}>{formatLabel(action)}</option>
            ))}
          </select>

          <select
            value={filters.entity_type}
            onChange={(event) => updateFilter("entity_type", event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">All entity types</option>
            {filterOptions.entity_types.map((entityType) => (
              <option key={entityType} value={entityType}>{formatLabel(entityType)}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.date_from}
            onChange={(event) => updateFilter("date_from", event.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />

          <input
            type="date"
            value={filters.date_to}
            onChange={(event) => updateFilter("date_to", event.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />

          <div className="flex gap-2 sm:col-span-2 xl:col-span-2">
            <Button variant="secondary" icon="refresh" onClick={load}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Activity"
        subtitle={`${pageStart}-${pageEnd} of ${pagination.total} logs`}
        icon="ledger"
      >
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading activity logs...</div>
        ) : logs.length ? (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {logs.map(renderLogCard)}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] text-left">
                <thead className="bg-indigo-50">
                  <tr>
                    {["Date & Time", "User", "Role", "Module", "Action", "Details", "Entity/Product/Order", "Extra Info"].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="transition hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">{formatEnglishDate(log.created_at)}</p>
                        <p className="text-xs text-slate-500">{formatTime(log.created_at)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-900">{log.user_name || "-"}</td>
                      <td className="px-4 py-4 text-sm text-slate-500">{log.user_role || "-"}</td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={moduleTone[log.module] || "neutral"}>{formatLabel(log.module)}</StatusBadge>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={actionTone[log.action_type] || "neutral"}>{formatLabel(log.action_type)}</StatusBadge>
                      </td>
                      <td className="max-w-sm px-4 py-4 text-sm text-slate-600">{log.description || "-"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{log.entity_name || log.entity_id || "-"}</td>
                      <td className="max-w-xs px-4 py-4 text-xs leading-5 text-slate-500">
                        <div>{metadataSummary(log.metadata)}</div>
                        {hasOrderItemComparison(log.metadata) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-2"
                            onClick={() => setSelectedChangeLog(log)}
                          >
                            View Changes
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.total_pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No activity logs found"
            description="Try clearing filters or perform a tracked admin action."
          />
        )}
      </SectionCard>

      {selectedChangeLog ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={() => setSelectedChangeLog(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-change-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="order-change-title" className="text-lg font-bold text-slate-900">
                  Order Item Changes
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedChangeLog.entity_name || `Order #${selectedChangeLog.entity_id}`} · {selectedChangeLog.user_name || "Unknown user"} · {formatEnglishDate(selectedChangeLog.created_at)} {formatTime(selectedChangeLog.created_at)}
                </p>
                {selectedChangeLog.metadata?.reason ? (
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    Reason: {selectedChangeLog.metadata.reason}
                  </p>
                ) : null}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelectedChangeLog(null)}>
                Close
              </Button>
            </header>

            <div className="max-h-[70vh] overflow-auto p-4 sm:p-5">
              {selectedItemChanges.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[680px] text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Change', 'Product', 'Before', 'After'].map((heading) => (
                          <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedItemChanges.map((change, index) => (
                        <tr key={`${change.type}:${change.product}:${index}`}>
                          <td className="px-4 py-3">
                            <StatusBadge
                              tone={
                                change.type === 'Removed'
                                  ? 'danger'
                                  : change.type === 'Added'
                                    ? 'success'
                                    : 'warning'
                              }
                            >
                              {change.type}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                            {change.product || 'Unknown product'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatOrderItemQuantity(change.before)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatOrderItemQuantity(change.after)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                  The saved before and after lists contain no product or quantity differences.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
