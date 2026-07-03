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
import { formatEnglishDate, formatTime, titleCase } from "../utils/format";

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
                      <td className="max-w-xs px-4 py-4 text-xs leading-5 text-slate-500">{metadataSummary(log.metadata)}</td>
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
    </div>
  );
}
