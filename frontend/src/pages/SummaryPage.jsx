import { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

const TRACKED_STATUSES = ["PENDING","CONFIRMED", "PACKED", "DELIVERED", "CANCELLED"];

const statusTone = {
  PENDING: "calm",
  CONFIRMED: "calm",
  PACKED:    "calm",
  DELIVERED: "success",
  CANCELLED: "alert",
};

const toDateInputValue = (date = new Date()) => {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getOrderDate = (order) => toDateInputValue(new Date(order.created_at));

const getItemCartons = (item) => {
  const pairs          = Number(item.qty_ordered || 0);
  const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);
  return pairsPerCarton > 0 ? pairs / pairsPerCarton : 0;
};

const emptyStatusTotals = () => ({ pairs: 0, cartons: 0, orders: new Set() });

const isInRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
};

export default function SummaryPage() {
  const { token }     = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const today = toDateInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate,   setToDate]   = useState(today);

  // ── load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getOrders(token);
      setOrders(result.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Summary failed",
        message: error.message || "Could not load order summary.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => { load(); }, [load]);

  // ── summary rows ──────────────────────────────────────────
  const summaryRows = useMemo(() => {
    const rowsByKey = new Map();

    orders
      .filter((order) => isInRange(getOrderDate(order), fromDate, toDate))
      .filter((order) => TRACKED_STATUSES.includes(order.status))
      .forEach((order) => {
        const createdBy = order.created_by_name || "Unknown";

        (order.items || []).forEach((item) => {
          const productName = item.product_name || "Unknown product";
          const key = [createdBy, item.finished_good_id || productName].join("::");

          if (!rowsByKey.has(key)) {
            rowsByKey.set(key, {
              id:              key,
              created_by_name: createdBy,
              product_name:    productName,
              article_code:    item.article_code || "-",
              unit:            item.unit || "pairs",
              PENDING: emptyStatusTotals(),
              CONFIRMED: emptyStatusTotals(),
              PACKED:    emptyStatusTotals(),
              DELIVERED: emptyStatusTotals(),
              CANCELLED: emptyStatusTotals(),
            });
          }

          const row          = rowsByKey.get(key);
          const statusTotals = row[order.status];
          const pairs        = Number(item.qty_ordered || 0);

          statusTotals.pairs   += pairs;
          statusTotals.cartons += getItemCartons(item);
          statusTotals.orders.add(order.id);
        });
      });

    return Array.from(rowsByKey.values())
      .map((row) => ({
        ...row,
        total_pairs:
         row.PENDING.pairs + row.CONFIRMED.pairs + row.PACKED.pairs + row.DELIVERED.pairs + row.CANCELLED.pairs,
        total_cartons:
         row.PENDING.pairs + row.CONFIRMED.cartons + row.PACKED.cartons + row.DELIVERED.cartons + row.CANCELLED.cartons,
      }))
      .sort((a, b) => {
        const u = a.created_by_name.localeCompare(b.created_by_name);
        return u !== 0 ? u : a.product_name.localeCompare(b.product_name);
      });
  }, [orders, fromDate, toDate]);

  // ── search filter ─────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return summaryRows;
    return summaryRows.filter((row) =>
      [row.created_by_name, row.product_name, row.article_code].some((v) =>
        String(v || "").toLowerCase().includes(term)
      )
    );
  }, [search, summaryRows]);

  // ── page totals ───────────────────────────────────────────
  const pageTotals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          TRACKED_STATUSES.forEach((status) => {
            acc[status].pairs   += row[status].pairs;
            acc[status].cartons += row[status].cartons;
          });
          acc.total_pairs   += row.total_pairs;
          acc.total_cartons += row.total_cartons;
          return acc;
        },
        {
          PENDING: { pairs: 0, cartons: 0 },
          CONFIRMED: { pairs: 0, cartons: 0 },
          PACKED:    { pairs: 0, cartons: 0 },
          DELIVERED: { pairs: 0, cartons: 0 },
          CANCELLED: { pairs: 0, cartons: 0 },
          total_pairs:   0,
          total_cartons: 0,
        }
      ),
    [filteredRows]
  );

  // ── helpers ───────────────────────────────────────────────
  const formatQty = (totals, unit = "pairs") => (
    <div className="space-y-1">
      <p>{formatNumber(totals.pairs)} {unit}</p>
      <p className="text-xs text-slate-400">{formatNumber(totals.cartons)} carton</p>
    </div>
  );

  const formatTotalQty = (totals, unit = "pairs") => (
    <div className="space-y-1">
      <p className="font-bold text-slate-900">{formatNumber(totals.pairs)} {unit}</p>
      <p className="text-xs text-slate-500 font-medium">{formatNumber(totals.cartons)} carton</p>
    </div>
  );

  const handleFromChange = (e) => {
    const val = e.target.value;
    setFromDate(val);
    if (toDate && val > toDate) setToDate(val);
  };

  const handleToChange = (e) => {
    const val = e.target.value;
    setToDate(val);
    if (fromDate && val < fromDate) setFromDate(val);
  };

  const resetDates = () => { setFromDate(today); setToDate(today); };

  // ── columns ───────────────────────────────────────────────
  const columns = [
    { key: "created_by_name", label: "Created By" },
    { key: "product_name",    label: "Product" },
    { key: "article_code",    label: "Article" },
    {
      key: "pending",
      label: "Pending",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.pending}>PENDING</StatusBadge>
          {formatQty(row.PENDING, row.unit)}
        </div>
      ),
    },
    {
      key: "confirmed",
      label: "Confirmed",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.CONFIRMED}>CONFIRMED</StatusBadge>
          {formatQty(row.CONFIRMED, row.unit)}
        </div>
      ),
    },
    {
      key: "packed",
      label: "Packed",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.PACKED}>PACKED</StatusBadge>
          {formatQty(row.PACKED, row.unit)}
        </div>
      ),
    },
    {
      key: "delivered",
      label: "Delivered",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.DELIVERED}>DELIVERED</StatusBadge>
          {formatQty(row.DELIVERED, row.unit)}
        </div>
      ),
    },
    {
      key: "cancelled",
      label: "Cancelled",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.CANCELLED}>CANCELLED</StatusBadge>
          {formatQty(row.CANCELLED, row.unit)}
        </div>
      ),
    },
    {
      key: "total",
      label: "Total",
      render: (row) => (
        <div className="space-y-1 font-semibold text-slate-900">
          <p>{formatNumber(row.total_pairs)} {row.unit}</p>
          <p className="text-xs text-slate-500">{formatNumber(row.total_cartons)} carton</p>
        </div>
      ),
    },
  ];

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── STAT CARDS ── */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Confirmed Pairs" value={formatNumber(pageTotals.CONFIRMED.pairs)} tone="calm"  icon="orders"  />
        <StatCard label="Packed Pairs"    value={formatNumber(pageTotals.PACKED.pairs)}    tone="calm"  icon="check"   />
        <StatCard label="Delivered Pairs" value={formatNumber(pageTotals.DELIVERED.pairs)} tone="calm"  icon="check"   />
        <StatCard label="Cancelled Pairs" value={formatNumber(pageTotals.CANCELLED.pairs)} tone="alert" icon="warning" />
        <StatCard label="Total Cartons"   value={formatNumber(pageTotals.total_cartons)}   icon="stock" />
      </div>

      {/* ── TABLE ── */}
      <SectionCard
        title="Daily order summary"
        subtitle="Products grouped by created-by and product across the selected date range."
        icon="orders"
      >
        {/* FILTERS */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={handleFromChange}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={handleToChange}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          {(fromDate !== today || toDate !== today) && (
            <button
              onClick={resetDates}
              className="self-end px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-all"
            >
              Today
            </button>
          )}

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, product, or article..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 md:max-w-sm md:ml-auto"
          />
        </div>

        {fromDate && toDate && fromDate !== toDate && (
          <p className="mb-3 text-xs text-slate-400">
            Showing results from <span className="font-semibold text-slate-600">{fromDate}</span> to{" "}
            <span className="font-semibold text-slate-600">{toDate}</span>
            {" "}— <span className="font-semibold text-slate-600">{filteredRows.length}</span> rows
          </p>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading summary...</div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={filteredRows}
              emptyTitle="No summary for this range"
              emptyDescription="Confirmed, packed, delivered, and cancelled orders will appear here."
            />

            {/* ── TOTALS FOOTER ── */}
            {filteredRows.length > 0 && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                  Totals — {filteredRows.length} row{filteredRows.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">

                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">PENDING</p>
                    {formatTotalQty(pageTotals.PENDING)}
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Confirmed</p>
                    {formatTotalQty(pageTotals.CONFIRMED)}
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Packed</p>
                    {formatTotalQty(pageTotals.PACKED)}
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Delivered</p>
                    {formatTotalQty(pageTotals.DELIVERED)}
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cancelled</p>
                    {formatTotalQty(pageTotals.CANCELLED)}
                  </div>

                  <div className="rounded-xl bg-indigo-500 px-3 py-2.5 space-y-1 col-span-2 sm:col-span-4 lg:col-span-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Grand Total</p>
                    <p className="font-bold text-white">{formatNumber(pageTotals.total_pairs)} pairs</p>
                    <p className="text-xs text-indigo-200 font-medium">{formatNumber(pageTotals.total_cartons)} carton</p>
                  </div>

                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}