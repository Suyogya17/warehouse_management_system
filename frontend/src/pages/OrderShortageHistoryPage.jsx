import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "../components/Button";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

const emptyFilters = {
  search: "",
  status: "ALL",
  warehouse_id: "",
  date_from: "",
  date_to: "",
};

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

const quantity = (row) => (
  <div className="whitespace-nowrap">
    <p className="font-semibold text-slate-950">{formatNumber(row.affected_ctn)} CTN</p>
    <p className="mt-0.5 text-xs text-slate-500">{formatNumber(row.affected_pairs)} pairs</p>
  </div>
);

export default function OrderShortageHistoryPage() {
  const { token } = useAuth();
  const [draft, setDraft] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [report, setReport] = useState({ data: [], summary: {}, filters: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOrderShortageHistory(applied, token);
      setReport(result || { data: [], summary: {}, filters: {} });
    } catch (requestError) {
      setError(requestError?.message || "Could not load order shortage history.");
    } finally {
      setLoading(false);
    }
  }, [applied, token]);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
  };

  const columns = useMemo(() => [
    {
      key: "verified_at",
      label: "Date",
      minWidth: 135,
      render: (row) => <div><p className="font-medium text-slate-900">{formatDate(row.verified_at || row.closed_at)}</p><p className="mt-1 text-xs text-slate-500">Order placed {formatDate(row.order_placed_at)}</p></div>,
    },
    {
      key: "order_id",
      label: "Order / DN",
      minWidth: 160,
      render: (row) => <div><p className="font-semibold text-slate-950">Order #{row.order_id}</p><p className="mt-1 text-xs text-indigo-700">{row.delivery_note_numbers || "No DN assigned"}</p><p className="mt-1 text-xs text-slate-500">{row.order_status}</p></div>,
    },
    {
      key: "customer_name",
      label: "Customer",
      minWidth: 180,
      render: (row) => <div><p className="font-semibold text-slate-900">{row.customer_name || "Unknown"}</p><p className="mt-1 text-xs text-slate-500">{row.customer_phone || "No phone"}</p></div>,
    },
    {
      key: "product_name",
      label: "Product",
      minWidth: 230,
      render: (row) => <div><p className="font-semibold text-slate-950">{row.finished_good_id} - {row.product_name}</p><p className="mt-1 text-xs text-slate-500">{[row.article_code, row.sole_code, row.color, row.size].filter(Boolean).join(" · ")}</p></div>,
    },
    {
      key: "shortage_status",
      label: "Result",
      minWidth: 130,
      render: (row) => <StatusBadge tone={row.shortage_status === "OUT_OF_STOCK" ? "warning" : "danger"}>{row.shortage_status === "OUT_OF_STOCK" ? "Out of stock" : "Not found"}</StatusBadge>,
    },
    { key: "affected_pairs", label: "Quantity", minWidth: 110, render: quantity },
    {
      key: "warehouse_name",
      label: "Warehouse",
      minWidth: 150,
      render: (row) => row.warehouse_name || "Unknown warehouse",
    },
    {
      key: "verification_note",
      label: "Check details",
      minWidth: 230,
      render: (row) => <div><p className="text-slate-800">{row.verification_note || "No note"}</p><p className="mt-1 text-xs text-slate-500">Checked by {row.verified_by_name || row.verified_by_email || "Unknown"}</p></div>,
    },
  ], []);

  const summary = report.summary || {};

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Orders"
        title="Not Found & Out-of-Stock History"
        description="Product-level warehouse checks that were marked not found or closed as out of stock, with order and delivery-note details."
        icon="ledger"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="History records" value={formatNumber(summary.records)} icon="ledger" />
        <StatCard label="Affected orders" value={formatNumber(summary.orders)} icon="orders" />
        <StatCard label="Out of stock" value={`${formatNumber(summary.out_of_stock_pairs)} pairs`} tone="alert" icon="box" />
        <StatCard label="Not found / pending" value={`${formatNumber(summary.not_found_pairs)} pairs`} tone="alert" icon="search" />
      </div>

      <SectionCard title="History filters" subtitle="Search by order, DN, product, customer, FG.ID, or warehouse." icon="search">
        <form className="grid gap-3 px-5 py-5 md:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => { event.preventDefault(); setApplied(draft); }}>
          <label className="text-xs font-semibold text-slate-600">Search
            <input className={inputClass} type="search" value={draft.search} placeholder="Order, DN, product, customer..." onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Result
            <select className={inputClass} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="ALL">All shortage results</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
              <option value="NOT_FOUND">Not found / pending</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Warehouse
            <select className={inputClass} value={draft.warehouse_id} onChange={(event) => setDraft((current) => ({ ...current, warehouse_id: event.target.value }))}>
              <option value="">All warehouses</option>
              {(report.filters?.warehouses || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Checked from
            <input className={inputClass} type="date" value={draft.date_from} onChange={(event) => setDraft((current) => ({ ...current, date_from: event.target.value }))} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Checked to
            <input className={inputClass} type="date" value={draft.date_to} onChange={(event) => setDraft((current) => ({ ...current, date_to: event.target.value }))} />
          </label>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-5">
            <Button type="submit" icon="search">Apply filters</Button>
            <Button type="button" variant="secondary" onClick={reset}>Clear</Button>
          </div>
        </form>
      </SectionCard>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{error}</p><Button className="mt-3" variant="secondary" onClick={load}>Retry</Button></div> : null}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading shortage history…</div> : !error ? (
        <DataTable
          columns={columns}
          rows={report.data || []}
          exportFilename="order-shortage-history"
          emptyTitle="No shortage history found"
          emptyDescription="No not-found or out-of-stock products match these filters."
          wrapCells
          responsiveScroll
          minTableWidth={1400}
          density="comfortable"
        />
      ) : null}
    </div>
  );
}
