import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatOrderDateTimes = (dateTimes = []) =>
  dateTimes.length ? dateTimes.map((value) => formatDate(value)).join(", ") : "-";

const formatWarehouseTotals = (warehouseTotals = [], unit = "pairs") =>
  warehouseTotals.length
    ? warehouseTotals
        .map((warehouse) => `${warehouse.name} (${formatNumber(warehouse.quantity)} ${unit})`)
        .join(", ")
    : "-";

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
              order_date_times: new Map(),
              warehouse_totals: new Map(),
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

          if (order.created_at) {
            row.order_date_times.set(order.created_at, new Date(order.created_at));
          }
          (item.warehouse_allocations || [])
            .filter((warehouse) => Number(warehouse.quantity || 0) > 0)
            .forEach((warehouse) => {
              const warehouseName = warehouse.warehouse_name || "Unknown warehouse";
              const currentQty = row.warehouse_totals.get(warehouseName) || 0;
              row.warehouse_totals.set(warehouseName, currentQty + Number(warehouse.quantity || 0));
            });
          statusTotals.pairs   += pairs;
          statusTotals.cartons += getItemCartons(item);
          statusTotals.orders.add(order.id);
        });
      });

    return Array.from(rowsByKey.values())
      .map((row) => ({
        ...row,
        order_date_times: Array.from(row.order_date_times.values()).sort((a, b) => a - b),
        warehouse_totals: Array.from(row.warehouse_totals.entries())
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        total_pairs:
         row.PENDING.pairs + row.CONFIRMED.pairs + row.PACKED.pairs + row.DELIVERED.pairs + row.CANCELLED.pairs,
        total_cartons:
         row.PENDING.cartons + row.CONFIRMED.cartons + row.PACKED.cartons + row.DELIVERED.cartons + row.CANCELLED.cartons,
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
      [
        row.created_by_name,
        row.product_name,
        row.article_code,
        formatWarehouseTotals(row.warehouse_totals, row.unit),
      ].some((v) =>
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

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        "Created By": row.created_by_name,
        "Date / Time": formatOrderDateTimes(row.order_date_times),
        Warehouse: formatWarehouseTotals(row.warehouse_totals, row.unit),
        Product: row.product_name,
        Article: row.article_code,
        Unit: row.unit,
        "Pending Pairs": row.PENDING.pairs,
        "Pending Cartons": row.PENDING.cartons,
        "Confirmed Pairs": row.CONFIRMED.pairs,
        "Confirmed Cartons": row.CONFIRMED.cartons,
        "Packed Pairs": row.PACKED.pairs,
        "Packed Cartons": row.PACKED.cartons,
        "Delivered Pairs": row.DELIVERED.pairs,
        "Delivered Cartons": row.DELIVERED.cartons,
        "Cancelled Pairs": row.CANCELLED.pairs,
        "Cancelled Cartons": row.CANCELLED.cartons,
        "Total Pairs": row.total_pairs,
        "Total Cartons": row.total_cartons,
      })),
    [filteredRows]
  );

  const dateRangeLabel =
    fromDate && toDate
      ? fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`
      : fromDate ? `From ${fromDate}`
      : toDate ? `To ${toDate}`
      : "All dates";

  const handleExportExcel = () => {
    if (!filteredRows.length) {
      showToast({
        tone: "error",
        title: "Nothing to export",
        message: "No summary rows match the current filter.",
      });
      return;
    }

    const rows = [
      ...exportRows,
      {},
      {
        "Created By": "Totals",
        "Pending Pairs": pageTotals.PENDING.pairs,
        "Pending Cartons": pageTotals.PENDING.cartons,
        "Confirmed Pairs": pageTotals.CONFIRMED.pairs,
        "Confirmed Cartons": pageTotals.CONFIRMED.cartons,
        "Packed Pairs": pageTotals.PACKED.pairs,
        "Packed Cartons": pageTotals.PACKED.cartons,
        "Delivered Pairs": pageTotals.DELIVERED.pairs,
        "Delivered Cartons": pageTotals.DELIVERED.cartons,
        "Cancelled Pairs": pageTotals.CANCELLED.pairs,
        "Cancelled Cartons": pageTotals.CANCELLED.cartons,
        "Total Pairs": pageTotals.total_pairs,
        "Total Cartons": pageTotals.total_cartons,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 32 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
      { wch: 15 }, { wch: 17 }, { wch: 13 }, { wch: 15 },
      { wch: 15 }, { wch: 17 }, { wch: 15 }, { wch: 17 },
      { wch: 12 }, { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Order Summary");
    XLSX.writeFile(workbook, `order-summary-${fromDate || "all"}-${toDate || "all"}.xlsx`);

    showToast({
      tone: "success",
      title: "Excel exported",
      message: `${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"} exported.`,
    });
  };

  const handlePrint = () => {
    if (!filteredRows.length) {
      showToast({
        tone: "error",
        title: "Nothing to print",
        message: "No summary rows match the current filter.",
      });
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      showToast({
        tone: "error",
        title: "Print blocked",
        message: "Please allow popups for this site and try again.",
      });
      return;
    }

    const statusCells = (row) =>
      TRACKED_STATUSES.map(
        (status) => `
          <td class="num">${formatNumber(row[status].pairs)}</td>
          <td class="num muted">${formatNumber(row[status].cartons)}</td>
        `
      ).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Daily Order Summary</title>
          <style>
            body { font-family: Arial, sans-serif; color: #1e293b; padding: 24px; font-size: 11px; }
            h1 { margin: 0 0 4px; font-size: 18px; }
            .meta { margin: 0 0 16px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f8fafc; color: #64748b; font-size: 9px; padding: 7px; text-align: left; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
            td { padding: 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            .num { text-align: right; white-space: nowrap; }
            .muted { color: #64748b; }
            tfoot td { font-weight: 700; background: #eef2ff; border-top: 2px solid #c7d2fe; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Daily Order Summary</h1>
          <p class="meta">${escapeHtml(dateRangeLabel)} · ${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"}</p>
          <table>
            <thead>
              <tr>
                <th>Created By</th>
                <th>Date / Time</th>
                <th>Warehouse</th>
                <th>Product</th>
                <th>Article</th>
                <th>Unit</th>
                ${TRACKED_STATUSES.map((status) => `<th class="num">${status}<br>Pairs</th><th class="num">${status}<br>Cartons</th>`).join("")}
                <th class="num">Total<br>Pairs</th>
                <th class="num">Total<br>Cartons</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.created_by_name)}</td>
                  <td>${escapeHtml(formatOrderDateTimes(row.order_date_times))}</td>
                  <td>${escapeHtml(formatWarehouseTotals(row.warehouse_totals, row.unit))}</td>
                  <td>${escapeHtml(row.product_name)}</td>
                  <td>${escapeHtml(row.article_code)}</td>
                  <td>${escapeHtml(row.unit)}</td>
                  ${statusCells(row)}
                  <td class="num">${formatNumber(row.total_pairs)}</td>
                  <td class="num">${formatNumber(row.total_cartons)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6">Totals</td>
                ${TRACKED_STATUSES.map((status) => `
                  <td class="num">${formatNumber(pageTotals[status].pairs)}</td>
                  <td class="num">${formatNumber(pageTotals[status].cartons)}</td>
                `).join("")}
                <td class="num">${formatNumber(pageTotals.total_pairs)}</td>
                <td class="num">${formatNumber(pageTotals.total_cartons)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // ── columns ───────────────────────────────────────────────
  const columns = [
    { key: "created_by_name", label: "Created By" },
    {
      key: "order_date_times",
      label: "Date / Time",
      render: (row) => (
        <div className="max-w-48 space-y-1 text-xs text-slate-500">
          {row.order_date_times.length
            ? row.order_date_times.map((value) => <p key={value.toISOString()}>{formatDate(value)}</p>)
            : <p>-</p>}
        </div>
      ),
    },
    {
      key: "warehouse_totals",
      label: "Warehouse",
      render: (row) => (
        <div className="max-w-48 space-y-1 text-xs text-slate-500">
          {row.warehouse_totals.length
            ? row.warehouse_totals.map((warehouse) => (
                <p key={warehouse.name}>
                  {warehouse.name} ({formatNumber(warehouse.quantity)} {row.unit})
                </p>
              ))
            : <p>-</p>}
        </div>
      ),
    },
    { key: "product_name",    label: "Product" },
    { key: "article_code",    label: "Article" },
    {
      key: "pending",
      label: "Pending",
      render: (row) => (
        <div className="space-y-2">
          <StatusBadge tone={statusTone.PENDING}>PENDING</StatusBadge>
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
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={handleExportExcel}>
              Export Excel
            </Button>
            <Button variant="secondary" icon="orders" onClick={handlePrint}>
              Print
            </Button>
          </>
        }
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
