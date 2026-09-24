import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "../components/Button";
import DataTable from "../components/DataTable";
import MultiSeriesFilter from "../components/MultiSeriesFilter";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

const emptyFilters = {
  search: "",
  dealer_user_id: "",
  party: "",
  status: "ALL",
  date_from: "",
  date_to: "",
  series: [],
};

const quantity = (row, prefix) => (
  <div className="whitespace-nowrap">
    <p className="font-semibold text-slate-900">{formatNumber(row[`${prefix}_ctn`])} CTN</p>
    <p className="mt-0.5 text-xs text-slate-500">{formatNumber(row[`${prefix}_pairs`])} pairs</p>
  </div>
);

const compactQuantity = (row, prefix, label, tone = "slate") => {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${tones[tone] || tones.slate}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-sm font-bold">{formatNumber(row[`${prefix}_ctn`])} CTN</p>
      <p className="whitespace-nowrap text-[11px] opacity-75">{formatNumber(row[`${prefix}_pairs`])} pairs</p>
    </div>
  );
};

function ReportDefinitions({ definitions = {} }) {
  return (
    <div className="grid gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(definitions).map(([key, value]) => (
        <p key={key}><span className="font-semibold capitalize text-slate-800">{key.replaceAll("_", " ")}:</span> {value}</p>
      ))}
    </div>
  );
}

function OrderDetails({ row, onClose }) {
  if (!row) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Party and article history</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{row.party_name} · {row.article_code || row.product_name}</h2>
            <p className="mt-1 text-sm text-slate-500">FG.ID {row.finished_good_id} · {row.color} · {row.size} · {row.order_count} order(s)</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          {["ordered", "delivered", "remaining", "reserved", "warehouse_planned", "cancelled"].map((key) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{key.replaceAll("_", " ")}</p>
              <p className="mt-1 font-semibold text-slate-950">{formatNumber(row[`${key}_ctn`])} CTN</p>
              <p className="text-xs text-slate-500">{formatNumber(row[`${key}_pairs`])} pairs</p>
            </div>
          ))}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-indigo-50 text-xs uppercase tracking-wide text-slate-700">
              <tr>{["Order", "Placed", "Status", "Created by", "Ordered", "Delivered", "Left", "Reserved", "Warehouse planned", "DNs / reason"].map((label) => <th key={label} className="border-b border-slate-300 px-4 py-3">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {row.orders.map((order) => (
                <tr key={order.order_item_id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-950">#{order.order_id}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(order.placed_at)}</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold">{order.status}</span></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{order.dealer_name}</p><p className="text-xs text-slate-500">{order.dealer_email}</p></td>
                  <td className="px-4 py-3">{quantity(order, "ordered")}</td>
                  <td className="px-4 py-3">{quantity(order, "delivered")}</td>
                  <td className="px-4 py-3">{quantity(order, "remaining")}</td>
                  <td className="px-4 py-3">{quantity(order, "reserved")}</td>
                  <td className="px-4 py-3">{quantity(order, "warehouse_planned")}</td>
                  <td className="max-w-xs px-4 py-3"><p className="font-medium text-slate-800">{order.delivery_note_numbers || "Not assigned"}</p>{order.cancel_reason ? <p className="mt-1 text-xs text-red-600">Cancelled: {order.cancel_reason}</p> : null}{order.out_of_stock_pairs > 0 ? <p className="mt-1 text-xs text-amber-700">Out of stock: {formatNumber(order.out_of_stock_pairs)} pairs</p> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PartyOrderReportPage() {
  const { token } = useAuth();
  const [draft, setDraft] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [report, setReport] = useState({ data: [], summary: {}, filters: {}, definitions: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getPartyOrderReport({
        ...applied,
        series: applied.series.join(","),
      }, token);
      setReport(result || { data: [], summary: {}, filters: {}, definitions: {} });
    } catch (requestError) {
      setError(requestError?.message || "Could not load the party order report.");
    } finally {
      setLoading(false);
    }
  }, [applied, token]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    {
      key: "party_name", label: "1. Party / customer", minWidth: 220,
      render: (row) => <div><p className="font-semibold text-slate-950">{row.party_name}</p><p className="mt-1 text-xs text-slate-500">{row.customer_phone || "No phone"} · {row.customer_address || "No address"}</p>{row.party_aliases?.length > 1 ? <p className="mt-1 text-[11px] text-indigo-600">Aliases: {row.party_aliases.join(", ")}</p> : null}</div>,
      exportValue: (row) => row.party_name,
    },
    {
      key: "product_name", label: "2. Article / product", minWidth: 230,
      render: (row) => <div><p className="font-semibold text-slate-950">{row.finished_good_id} - {row.product_name}</p><p className="mt-1 text-xs text-slate-500">{row.series} · {row.color} · {row.size}</p><p className="mt-2 text-xs font-medium text-slate-600">Current stock: {formatNumber(row.physical_stock_ctn)} CTN / {formatNumber(row.physical_stock_pairs)} pairs</p></div>,
      exportValue: (row) => `${row.finished_good_id} - ${row.product_name} - ${row.color} - ${row.size}`,
    },
    {
      key: "ordered_ctn", label: "3. Party ordered", minWidth: 155,
      render: (row) => <div className="space-y-2">{compactQuantity(row, "ordered", "Active order", "indigo")}<p className="text-xs text-slate-500">Across <span className="font-semibold text-slate-800">{row.order_count}</span> order(s)</p><p className="text-[11px] text-slate-500">By {row.dealer_names.join(", ") || "Unknown"}</p></div>,
      exportValue: (row) => `${row.ordered_ctn} CTN / ${row.ordered_pairs} pairs; ${row.order_count} orders; ${row.dealer_names.join(", ")}`,
    },
    {
      key: "delivery_progress", label: "4. Delivery progress", minWidth: 235,
      render: (row) => {
        const percent = row.ordered_pairs > 0 ? Math.min(100, Math.round((row.delivered_pairs / row.ordered_pairs) * 100)) : 0;
        return <div className="space-y-2"><div className="grid grid-cols-2 gap-2">{compactQuantity(row, "delivered", "Delivered", "green")}{compactQuantity(row, "remaining", "Still left", "amber")}</div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div><p className="text-xs font-semibold text-slate-600">{percent}% delivered</p></div>;
      },
      exportValue: (row) => `Delivered ${row.delivered_ctn} CTN / ${row.delivered_pairs} pairs; Left ${row.remaining_ctn} CTN / ${row.remaining_pairs} pairs`,
    },
    {
      key: "reserved_ctn", label: "5. Stock held", minWidth: 225,
      render: (row) => <div className="grid grid-cols-2 gap-2">{compactQuantity(row, "reserved", "Reserved", "indigo")}{compactQuantity(row, "warehouse_planned", "On warehouse DN", "slate")}</div>,
      exportValue: (row) => `Reserved ${row.reserved_ctn} CTN / ${row.reserved_pairs} pairs; Warehouse planned ${row.warehouse_planned_ctn} CTN / ${row.warehouse_planned_pairs} pairs`,
    },
    {
      key: "exceptions", label: "6. Problems / changes", minWidth: 210,
      render: (row) => row.cancelled_pairs > 0 || row.out_of_stock_pairs > 0
        ? <div className="grid grid-cols-2 gap-2">{compactQuantity(row, "cancelled", "Cancelled", "red")}{compactQuantity(row, "out_of_stock", "Out of stock", "amber")}</div>
        : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">No cancellation or stock issue</div>,
      exportValue: (row) => `Cancelled ${row.cancelled_ctn} CTN / ${row.cancelled_pairs} pairs; Out of stock ${row.out_of_stock_ctn} CTN / ${row.out_of_stock_pairs} pairs`,
    },
    { key: "details", label: "7. Full details", minWidth: 125, searchable: false, render: (row) => <Button size="sm" variant="secondary" onClick={() => setDetails(row)}>View orders</Button>, exportValue: () => "" },
  ], []);

  const summary = report.summary || {};
  const tableTotals = useMemo(() => [
    { label: "Placed total", value: (row) => row.placed_ctn, suffix: "CTN", secondaryValue: (row) => row.placed_pairs, secondarySuffix: "pairs" },
    { label: "Active ordered", value: (row) => row.ordered_ctn, suffix: "CTN", secondaryValue: (row) => row.ordered_pairs, secondarySuffix: "pairs" },
    { label: "Delivered", value: (row) => row.delivered_ctn, suffix: "CTN", secondaryValue: (row) => row.delivered_pairs, secondarySuffix: "pairs" },
    { label: "Left to deliver", value: (row) => row.remaining_ctn, suffix: "CTN", secondaryValue: (row) => row.remaining_pairs, secondarySuffix: "pairs" },
    { label: "Reserved now", value: (row) => row.reserved_ctn, suffix: "CTN", secondaryValue: (row) => row.reserved_pairs, secondarySuffix: "pairs" },
    { label: "Warehouse planned", value: (row) => row.warehouse_planned_ctn, suffix: "CTN", secondaryValue: (row) => row.warehouse_planned_pairs, secondarySuffix: "pairs" },
    { label: "Cancelled", value: (row) => row.cancelled_ctn, suffix: "CTN", secondaryValue: (row) => row.cancelled_pairs, secondarySuffix: "pairs" },
    { label: "Out of stock", value: (row) => row.out_of_stock_ctn, suffix: "CTN", secondaryValue: (row) => row.out_of_stock_pairs, secondarySuffix: "pairs" },
  ], []);

  const dealerSummary = useMemo(() => {
    const dealers = new Map();

    (report.data || []).forEach((row) => {
      const dealerKey = row.dealer_user_id
        ? `dealer-${row.dealer_user_id}`
        : `dealer-${row.dealer_emails?.[0] || row.dealer_names?.[0] || "unknown"}`;
      if (!dealers.has(dealerKey)) {
        dealers.set(dealerKey, {
          id: dealerKey,
          dealer_name: row.dealer_names?.[0] || "Unknown dealer",
          dealer_email: row.dealer_emails?.[0] || "",
          party_keys: new Set(),
          product_ids: new Set(),
          order_ids: new Set(),
          allocation_keys: new Set(),
          allocated_pairs: 0,
          allocation_used_pairs: 0,
          allocation_available_pairs: 0,
          allocated_ctn: 0,
          allocation_used_ctn: 0,
          allocation_available_ctn: 0,
          ordered_pairs: 0,
          ordered_ctn: 0,
          delivered_pairs: 0,
          delivered_ctn: 0,
          remaining_pairs: 0,
          remaining_ctn: 0,
          reserved_pairs: 0,
          reserved_ctn: 0,
          cancelled_pairs: 0,
          cancelled_ctn: 0,
          out_of_stock_pairs: 0,
          out_of_stock_ctn: 0,
        });
      }

      const dealer = dealers.get(dealerKey);
      dealer.party_keys.add(row.party_key || row.party_name);
      dealer.product_ids.add(row.finished_good_id);
      (row.orders || []).forEach((order) => dealer.order_ids.add(order.order_id));
      ["ordered", "delivered", "remaining", "reserved", "cancelled", "out_of_stock"].forEach((field) => {
        dealer[`${field}_pairs`] += Number(row[`${field}_pairs`] || 0);
        dealer[`${field}_ctn`] += Number(row[`${field}_ctn`] || 0);
      });

      (row.dealer_allocations || []).forEach((allocation) => {
        const allocationKey = `${allocation.user_id || row.dealer_user_id}:${row.finished_good_id}`;
        if (dealer.allocation_keys.has(allocationKey)) return;
        dealer.allocation_keys.add(allocationKey);
        dealer.allocated_pairs += Number(allocation.allocation_quantity || 0);
        dealer.allocation_used_pairs += Number(allocation.used_quantity || 0);
        dealer.allocation_available_pairs += Number(allocation.available_quantity || 0);
        const pairsPerCarton = Number(row.pairs_per_carton || 30) || 30;
        dealer.allocated_ctn += Number(allocation.allocation_quantity || 0) / pairsPerCarton;
        dealer.allocation_used_ctn += Number(allocation.used_quantity || 0) / pairsPerCarton;
        dealer.allocation_available_ctn += Number(allocation.available_quantity || 0) / pairsPerCarton;
      });
    });

    return [...dealers.values()].map((dealer) => {
      ["allocated", "allocation_used", "allocation_available", "ordered", "delivered", "remaining", "reserved", "cancelled", "out_of_stock"].forEach((field) => {
        dealer[`${field}_pairs`] = Math.round((Number(dealer[`${field}_pairs`] || 0) + Number.EPSILON) * 100) / 100;
        dealer[`${field}_ctn`] = Math.round((Number(dealer[`${field}_ctn`] || 0) + Number.EPSILON) * 100) / 100;
      });
      dealer.party_count = dealer.party_keys.size;
      dealer.product_count = dealer.product_ids.size;
      dealer.order_count = dealer.order_ids.size;
      return dealer;
    });
  }, [report.data]);

  const dealerColumns = useMemo(() => [
    {
      key: "dealer_name", label: "Dealer", minWidth: 230,
      render: (row) => <div><p className="font-semibold text-slate-950">{row.dealer_name}</p><p className="mt-1 text-xs text-slate-500">{row.dealer_email || "No email"}</p><p className="mt-2 text-xs text-slate-600">{row.party_count} parties · {row.product_count} products · {row.order_count} orders</p></div>,
      exportValue: (row) => `${row.dealer_name} · ${row.dealer_email}`,
    },
    {
      key: "allocated_ctn", label: "Current product allocation", minWidth: 350,
      render: (row) => <div className="grid grid-cols-3 gap-2">{compactQuantity(row, "allocated", "Allocated", "indigo")}{compactQuantity(row, "allocation_used", "Used", "slate")}{compactQuantity(row, "allocation_available", "Available", "green")}</div>,
      exportValue: (row) => `Allocated ${row.allocated_ctn} CTN / ${row.allocated_pairs} pairs; Used ${row.allocation_used_ctn} CTN / ${row.allocation_used_pairs} pairs; Available ${row.allocation_available_ctn} CTN / ${row.allocation_available_pairs} pairs`,
    },
    {
      key: "ordered_ctn", label: "Orders in this report", minWidth: 160,
      render: (row) => compactQuantity(row, "ordered", "Ordered", "indigo"),
      exportValue: (row) => `${row.ordered_ctn} CTN / ${row.ordered_pairs} pairs`,
    },
    {
      key: "delivered_ctn", label: "Delivery", minWidth: 240,
      render: (row) => <div className="grid grid-cols-2 gap-2">{compactQuantity(row, "delivered", "Delivered", "green")}{compactQuantity(row, "remaining", "Still left", "amber")}</div>,
      exportValue: (row) => `Delivered ${row.delivered_ctn} CTN / ${row.delivered_pairs} pairs; Still left ${row.remaining_ctn} CTN / ${row.remaining_pairs} pairs`,
    },
    {
      key: "reserved_ctn", label: "Reserved", minWidth: 145,
      render: (row) => compactQuantity(row, "reserved", "Reserved now", "slate"),
      exportValue: (row) => `${row.reserved_ctn} CTN / ${row.reserved_pairs} pairs`,
    },
    {
      key: "cancelled_ctn", label: "Cancelled / issue", minWidth: 240,
      render: (row) => <div className="grid grid-cols-2 gap-2">{compactQuantity(row, "cancelled", "Cancelled", "red")}{compactQuantity(row, "out_of_stock", "Out of stock", "amber")}</div>,
      exportValue: (row) => `Cancelled ${row.cancelled_ctn} CTN / ${row.cancelled_pairs} pairs; Out of stock ${row.out_of_stock_ctn} CTN / ${row.out_of_stock_pairs} pairs`,
    },
  ], []);

  const dealerTotals = useMemo(() => [
    { label: "Dealer allocated", value: (row) => row.allocated_ctn, suffix: "CTN", secondaryValue: (row) => row.allocated_pairs, secondarySuffix: "pairs" },
    { label: "Allocation used", value: (row) => row.allocation_used_ctn, suffix: "CTN", secondaryValue: (row) => row.allocation_used_pairs, secondarySuffix: "pairs" },
    { label: "Allocation available", value: (row) => row.allocation_available_ctn, suffix: "CTN", secondaryValue: (row) => row.allocation_available_pairs, secondarySuffix: "pairs" },
    { label: "Ordered", value: (row) => row.ordered_ctn, suffix: "CTN", secondaryValue: (row) => row.ordered_pairs, secondarySuffix: "pairs" },
    { label: "Delivered", value: (row) => row.delivered_ctn, suffix: "CTN", secondaryValue: (row) => row.delivered_pairs, secondarySuffix: "pairs" },
    { label: "Left to deliver", value: (row) => row.remaining_ctn, suffix: "CTN", secondaryValue: (row) => row.remaining_pairs, secondarySuffix: "pairs" },
  ], []);
  const reset = () => { setDraft(emptyFilters); setApplied(emptyFilters); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Orders audit"
        title="Party Order Report"
        description="See what every party ordered by article, what was delivered, what remains reserved, and what was cancelled. Open any row for order and warehouse-DN details."
        icon="ledger"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Parties" value={formatNumber(summary.party_count)} icon="users" />
        <StatCard label="Active ordered" value={`${formatNumber(summary.ordered_pairs)} pairs`} icon="orders" />
        <StatCard label="Delivered" value={`${formatNumber(summary.delivered_pairs)} pairs`} tone="calm" icon="check" />
        <StatCard label="Left to deliver" value={`${formatNumber(summary.remaining_pairs)} pairs`} tone="alert" icon="box" />
        <StatCard label="Reserved now" value={`${formatNumber(summary.reserved_pairs)} pairs`} tone="alert" icon="stock" />
        <StatCard label="Cancelled" value={`${formatNumber(summary.cancelled_pairs)} pairs`} icon="hidden" />
      </div>

      <SectionCard title="Report filters" subtitle="Combine party, dealer, article, series, order status, and order-date filters." icon="search">
        <form className="grid gap-3 px-5 py-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setApplied(draft); }}>
          <label className="text-xs font-semibold text-slate-600">Search article, FG.ID, party or order
            <input type="search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Article, FG.ID, party, order ID..." className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Dealer / created by
            <select value={draft.dealer_user_id} onChange={(event) => setDraft((current) => ({ ...current, dealer_user_id: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="">All dealers</option>{(report.filters?.dealers || []).map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.name} · {dealer.email}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Party / customer
            <select value={draft.party} onChange={(event) => setDraft((current) => ({ ...current, party: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="">All parties</option>{(report.filters?.parties || []).map((party) => <option key={party.key} value={party.name}>{party.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Order status
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              {["ALL", "PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELLED"].map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : value}</option>)}
            </select>
          </label>
          <MultiSeriesFilter options={report.filters?.series || []} values={draft.series} onChange={(series) => setDraft((current) => ({ ...current, series }))} />
          <label className="text-xs font-semibold text-slate-600">Order date from
            <input type="date" value={draft.date_from} onChange={(event) => setDraft((current) => ({ ...current, date_from: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Order date to
            <input type="date" value={draft.date_to} onChange={(event) => setDraft((current) => ({ ...current, date_to: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          </label>
          <div className="flex items-end gap-2"><Button type="submit" icon="search" className="flex-1">Apply filters</Button><Button variant="secondary" onClick={reset}>Clear</Button></div>
        </form>
        <ReportDefinitions definitions={report.definitions} />
      </SectionCard>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-5 py-4">
        <p className="text-sm font-semibold text-indigo-950">How to read each row</p>
        <div className="mt-2 grid gap-2 text-xs leading-5 text-indigo-900 md:grid-cols-2 xl:grid-cols-4">
          <p><span className="font-bold">Active order</span> excludes cancelled orders.</p>
          <p><span className="font-bold">Still left</span> is ordered quantity not delivered yet.</p>
          <p><span className="font-bold">Reserved</span> is stock held for active orders.</p>
          <p><span className="font-bold">On warehouse DN</span> is reserved stock already assigned to warehouse slips.</p>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{error}</p><Button className="mt-3" variant="secondary" onClick={load}>Retry</Button></div> : null}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading party and article details…</div> : !error ? (
        <>
          <DataTable columns={columns} rows={report.data || []} summaryColumns={tableTotals} exportFilename="party-order-report" emptyTitle="No party orders found" emptyDescription="Try clearing some report filters." wrapCells responsiveScroll minTableWidth={1400} density="comfortable" />
          <SectionCard className="mt-5" title="Dealer Allocation Summary" subtitle="Allocation belongs to the dealer account, not to a customer party. Each dealer-product allocation is counted only once; order totals follow the filters above." icon="users">
            <DataTable columns={dealerColumns} rows={dealerSummary} summaryColumns={dealerTotals} exportFilename="dealer-allocation-summary" emptyTitle="No dealer allocation found" emptyDescription="No dealer allocation matches the current report." wrapCells responsiveScroll minTableWidth={1400} density="comfortable" />
          </SectionCard>
        </>
      ) : null}
      <OrderDetails row={details} onClose={() => setDetails(null)} />
    </div>
  );
}
