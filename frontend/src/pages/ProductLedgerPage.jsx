import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";
import Select from "react-select";
import * as XLSX from "xlsx";

const toDateInputValue = (date = new Date()) => {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ACTIVE_STATUSES = ["CONFIRMED", "PACKED", "DELIVERED"];
const WAREHOUSE_ADJUSTMENT_TYPES = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT"];

export default function ProductLedgerPage() {
  const { token }     = useAuth();
  const { showToast } = useToast();

  const [finishedGoods, setFinishedGoods] = useState([]);
  const [productions,   setProductions]   = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [search,   setSearch]   = useState("");
  const [adjustments, setAdjustments] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");

  // ── load ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [fgRes, prodRes, ordersRes, adjRes] = await Promise.all([
        api.getFinishedGoods(token),
        api.getProductionHistory(token, { limit: 500, include_total: 0 }),
        api.getOrders(token, { limit: 500 }),
        api.getStockAdjustments(token, undefined, { limit: 500, include_total: 0 }),
      ]);
      setFinishedGoods(fgRes.data   || fgRes   || []);
      setProductions(  prodRes.data || prodRes || []);
      setOrders(       ordersRes.data || ordersRes || []);
      setAdjustments(  adjRes.data  || adjRes  || []);
    } catch (error) {
      showToast({ tone: "error", title: "Ledger failed", message: error.message || "Could not load ledger data." });
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedProduct) {
      setWarehouseMovements([]);
      return;
    }

    let isActive = true;

    const loadWarehouseMovements = async () => {
      try {
        const movementRes = await api.getWarehouseMovements(token, {
          finished_good_id: selectedProduct,
          limit: 500,
        });
        if (isActive) {
          setWarehouseMovements(movementRes.data || movementRes || []);
        }
      } catch (error) {
        if (isActive) {
          setWarehouseMovements([]);
          showToast({
            tone: "error",
            title: "Warehouse movements failed",
            message: error.message || "Could not load warehouse movement data.",
          });
        }
      }
    };

    loadWarehouseMovements();
    return () => { isActive = false; };
  }, [selectedProduct, token, showToast]);

  // ── product options ───────────────────────────────────────
  const productOptions = useMemo(() =>
    [...finishedGoods].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  [finishedGoods]);

  const selectedFG = useMemo(() =>
    productOptions.find((p) => String(p.id) === String(selectedProduct)),
  [productOptions, selectedProduct]);

  // ── build ALL ledger entries (no date filter yet) ────────
  const allEntries = useMemo(() => {
    if (!selectedProduct) return [];

    const entries = [];
    const product = finishedGoods.find((fg) => String(fg.id) === String(selectedProduct));

    // Production → IN
    productions
      .filter((p) => {
        const fgId =
          p.finished_good_id ??
          p.finishedGoodId ??
          p.fg_id ??
          p.product_id ??
          p.finished_good?.id ??
          p.finishedGood?.id;

        if (fgId !== undefined && fgId !== null) {
          if (String(fgId) === String(selectedProduct)) return true;
        }

        if (p.finished_good_name && product) {
          return p.finished_good_name === (product.name || product.product_name);
        }

        return false;
      })
      .forEach((p) => {
        const rawDate = p.produced_at || p.created_at || p.date || p.production_date;
        const qty = Number(
          p.qty_produced ?? p.quantity_produced ?? p.quantity ?? p.qty ?? p.pairs ?? 0
        );
        if (!rawDate || qty <= 0) return;
        entries.push({
          date:        toDateInputValue(new Date(rawDate)),
          raw:         new Date(rawDate),
          type:        "IN",
          description: product?.name || product?.product_name || "Product",
          reference:   p.produced_by_name || p.created_by_name || p.produced_by || `Batch #${p.production_id ?? p.id ?? "–"}`,
          qty_in:      qty,
          qty_out:     0,
        });
      });

    // Stock Adjustments → IN or OUT
    adjustments
      .filter((a) => String(a.finished_good_id) === String(selectedProduct))
      .forEach((a) => {
        const qty = Number(a.qty);
        if (!a.adjusted_at || qty === 0) return;
        entries.push({
          date:        toDateInputValue(new Date(a.adjusted_at)),
          raw:         new Date(a.adjusted_at),
          type:        qty > 0 ? "IN" : "OUT",
          description: a.finished_good_name || "Stock Adjustment",
          reference:   a.reason || "Manual Adjustment",
          qty_in:      qty > 0 ? qty  : 0,
          qty_out:     qty < 0 ? -qty : 0,
        });
      });

    // Warehouse manual adjustments → IN or OUT
    warehouseMovements
      .filter((movement) =>
        String(movement.finished_good_id) === String(selectedProduct) &&
        WAREHOUSE_ADJUSTMENT_TYPES.includes(movement.movement_type)
      )
      .forEach((movement) => {
        const qty = Number(movement.quantity || 0);
        const rawDate = movement.created_at || movement.updated_at;
        if (!rawDate || qty <= 0) return;

        const isIn = movement.movement_type === "ADJUSTMENT_IN";
        const warehouseName = movement.warehouse_name ? ` · ${movement.warehouse_name}` : "";

        entries.push({
          date:        toDateInputValue(new Date(rawDate)),
          raw:         new Date(rawDate),
          type:        isIn ? "IN" : "OUT",
          description: movement.product_name || product?.name || "Warehouse Adjustment",
          reference:   `${movement.notes || "Warehouse Adjustment"}${warehouseName}`,
          qty_in:      isIn ? qty : 0,
          qty_out:     isIn ? 0 : qty,
        });
      });

    // Orders → OUT
    orders
      .filter((o) => ACTIVE_STATUSES.includes(o.status))
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          if (String(item.finished_good_id) !== String(selectedProduct)) return;
          const rawDate = order.created_at || order.order_date;
          const qty = Number(item.qty_ordered ?? item.quantity ?? 0);
          if (!rawDate || qty <= 0) return;
          entries.push({
            date:        toDateInputValue(new Date(rawDate)),
            raw:         new Date(rawDate),
            type:        "OUT",
            description: order.customer_name || order.created_by_name || "Customer",
            reference:   `Order #${order.id} · ${order.status}`,
            qty_in:      0,
            qty_out:     qty,
          });
        });
      });

    // ── Opening stock synthesis ──────────────────────────────
    const totalInSoFar   = entries.reduce((s, e) => s + e.qty_in,  0);
    const totalOutSoFar  = entries.reduce((s, e) => s + e.qty_out, 0);
    const currentQty     = Number(product?.quantity ?? 0);
    const impliedOpening = currentQty + totalOutSoFar - totalInSoFar;

    if (impliedOpening > 0) {
      const earliestRaw = entries.length > 0
        ? entries.reduce((min, e) => e.raw < min ? e.raw : min, entries[0].raw)
        : new Date();
      const openingDate = new Date(earliestRaw);
      openingDate.setDate(openingDate.getDate() - 1);

      entries.push({
        date:        toDateInputValue(openingDate),
        raw:         openingDate,
        type:        "IN",
        description: product?.name || "Opening Stock",
        reference:   "Opening Stock",
        qty_in:      impliedOpening,
        qty_out:     0,
        isOpening:   true,
      });
    }

    entries.sort((a, b) => a.raw - b.raw);

    let balance = 0;
    return entries.map((e) => {
      balance += e.qty_in - e.qty_out;
      return { ...e, balance };
    });
  }, [selectedProduct, productions, orders, finishedGoods, adjustments, warehouseMovements]);

  // ── opening balance for the selected date range ──────────
  const openingBalance = useMemo(() => {
    if (!fromDate || !allEntries.length) return null;
    const before = allEntries.filter((e) => e.date < fromDate);
    if (!before.length) return null;
    return before[before.length - 1].balance;
  }, [allEntries, fromDate]);

  // ── apply date + search filter ───────────────────────────
  const filteredEntries = useMemo(() => {
    let rows = allEntries;
    if (fromDate) rows = rows.filter((r) => r.date >= fromDate);
    if (toDate)   rows = rows.filter((r) => r.date <= toDate);
    const term = search.trim().toLowerCase();
    if (term) rows = rows.filter((r) =>
      [r.description, r.reference, r.date].some((v) =>
        String(v || "").toLowerCase().includes(term)
      )
    );
    return rows;
  }, [allEntries, fromDate, toDate, search]);

  // ── stats for the filtered window ────────────────────────
  const stats = useMemo(() => {
    const movementEntries = filteredEntries.filter((row) => !row.isOpening);
    const totalIn  = movementEntries.reduce((s, r) => s + r.qty_in,  0);
    const totalOut = movementEntries.reduce((s, r) => s + r.qty_out, 0);

    const lastEntry = filteredEntries[filteredEntries.length - 1];
    const closing = lastEntry ? lastEntry.balance : (openingBalance ?? 0);
    const currentStock = Number(selectedFG?.quantity ?? 0);

    return { totalIn, totalOut, closing, currentStock };
  }, [filteredEntries, openingBalance, selectedFG]);

  // ── helpers ───────────────────────────────────────────────
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

  const handlePrint = () => {
    const printContent = document.getElementById("ledger-print-area");
    if (!printContent) return;

    const dateRange = fromDate && toDate
      ? `${fromDate} → ${toDate}`
      : fromDate ? `From ${fromDate}`
      : toDate   ? `To ${toDate}`
      : "All dates";

    const win = window.open("", "_blank");
    win.document.write(`
      <html>
        <head>
          <title>Ledger – ${selectedFG?.name || "Product"}</title>
          <style>
            body { font-family: sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
            h2 { margin: 0 0 4px; font-size: 16px; }
            .meta { margin: 0 0 16px; color: #64748b; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; }
            th {
              background: #f8fafc;
              text-align: left;
              padding: 8px 10px;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: .05em;
              color: #94a3b8;
              border-bottom: 2px solid #e2e8f0;
            }
            th.right, td.right { text-align: right; }
            td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
            .in  { color: #16a34a; font-weight: 600; }
            .out { color: #e11d48; font-weight: 600; }
            .bal { color: #4f46e5; font-weight: 700; }
            .opening td { background: #fffbeb; color: #b45309; font-weight: 600; }
            .summary { margin-top: 20px; display: flex; gap: 16px; flex-wrap: wrap; }
            .summary-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
            .summary-box .label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 4px; }
            .summary-box .value { font-size: 14px; font-weight: 700; color: #1e293b; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h2>${selectedFG?.name || "Product"}${selectedFG?.article_code ? ` (${selectedFG.article_code})` : ""}</h2>
          <p class="meta">${dateRange} · Current stock: ${formatNumber(stats.currentStock)} ${selectedFG?.unit || "pairs"}</p>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name / Customer</th>
                <th>Reference</th>
                <th class="right">Stock In</th>
                <th class="right">Stock Out</th>
                <th class="right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              ${openingBalance !== null ? `
                <tr class="opening">
                  <td>${fromDate}</td>
                  <td colspan="2">Opening Balance</td>
                  <td class="right">—</td>
                  <td class="right">—</td>
                  <td class="right bal">${formatNumber(openingBalance)}</td>
                </tr>` : ""}
              ${filteredEntries.map((e) => `
                <tr>
                  <td>${e.date}</td>
                  <td>${e.description}</td>
                  <td>${e.reference}</td>
                  <td class="right">${e.qty_in  > 0 ? `<span class="in">+${formatNumber(e.qty_in)}</span>`  : "—"}</td>
                  <td class="right">${e.qty_out > 0 ? `<span class="out">-${formatNumber(e.qty_out)}</span>` : "—"}</td>
                  <td class="right bal">${formatNumber(e.balance)}</td>
                </tr>`).join("")}
            </tbody>
          </table>

          <div class="summary">
            ${openingBalance !== null ? `
              <div class="summary-box">
                <div class="label">Opening Balance</div>
                <div class="value">${formatNumber(openingBalance)} ${selectedFG?.unit || "pairs"}</div>
              </div>` : ""}
            <div class="summary-box">
              <div class="label">Total In</div>
              <div class="value" style="color:#16a34a">${formatNumber(stats.totalIn)} ${selectedFG?.unit || "pairs"}</div>
            </div>
            <div class="summary-box">
              <div class="label">Total Out</div>
              <div class="value" style="color:#e11d48">${formatNumber(stats.totalOut)} ${selectedFG?.unit || "pairs"}</div>
            </div>
            <div class="summary-box">
              <div class="label">Closing Balance</div>
              <div class="value" style="color:#4f46e5">${formatNumber(stats.closing)} ${selectedFG?.unit || "pairs"}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleExport = () => {
    if (!filteredEntries.length) {
      showToast({ tone: "error", title: "Nothing to export", message: "No ledger entries match the current filter." });
      return;
    }

    const rows = [];

    if (openingBalance !== null) {
      rows.push({
        Date: fromDate,
        "Name / Customer": "Opening Balance",
        Reference: "",
        "Stock In":  "",
        "Stock Out": "",
        Remaining: openingBalance,
      });
    }

    filteredEntries.forEach((e) => {
      rows.push({
        Date: e.date,
        "Name / Customer": e.description,
        Reference: e.reference,
        "Stock In":  e.qty_in  > 0 ? e.qty_in  : "",
        "Stock Out": e.qty_out > 0 ? e.qty_out : "",
        Remaining: e.balance,
      });
    });

    // Summary rows at the bottom
    rows.push({});
    if (openingBalance !== null) {
      rows.push({ Date: "Opening Balance", "Stock In": openingBalance });
    }
    rows.push({ Date: "Total In",       "Stock In":  stats.totalIn  });
    rows.push({ Date: "Total Out",      "Stock Out": stats.totalOut });
    rows.push({ Date: "Closing Balance", Remaining:  stats.closing  });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 12 }, // Date
      { wch: 28 }, // Name
      { wch: 28 }, // Reference
      { wch: 12 }, // Stock In
      { wch: 12 }, // Stock Out
      { wch: 14 }, // Remaining
    ];

    const workbook  = XLSX.utils.book_new();
    const sheetName = (selectedFG?.name || "Ledger")
  .replace(/[:\\/?*\[\]]/g, "-")
  .slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const today = new Date().toISOString().slice(0, 10);
    const safeName = (selectedFG?.name || "product")
  .replace(/[\\/:*?"<>|]/g, "-");

XLSX.writeFile(
  workbook,
  `ledger-${safeName}-${today}.xlsx`
);

    showToast({ tone: "success", title: "Excel exported", message: `${rows.length} rows exported.` });
  };

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm " +
    "focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100";

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── STAT CARDS ── */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Current Stock"
          value={`${formatNumber(stats.currentStock)} ${selectedFG?.unit || "pairs"}`}
          tone="calm"
          icon="stock"
        />
        <StatCard
          label="Total Produced (IN)"
          value={formatNumber(stats.totalIn)}
          tone="calm"
          icon="production"
        />
        <StatCard
          label="Total Dispatched (OUT)"
          value={formatNumber(stats.totalOut)}
          tone="alert"
          icon="orders"
        />
        <StatCard
          label="Closing Balance"
          value={formatNumber(stats.closing)}
          tone={stats.closing > 0 ? "success" : stats.closing === 0 ? "calm" : "alert"}
          icon="check"
        />
      </div>

      {/* ── LEDGER TABLE ── */}
      <SectionCard
        title="Product Ledger"
        subtitle="Stock movement per product — production IN, warehouse adjustments, and order OUT with running balance."
        icon="ledger"
      >
        {/* FILTERS */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Product</label>
            <Select
              options={productOptions.map((p) => ({
                value: String(p.id),
                label: `${p.name || p.product_name}${p.article_code ? ` (${p.article_code})` : ""}`,
              }))}
              value={
                productOptions
                  .map((p) => ({
                    value: String(p.id),
                    label: `${p.name || p.product_name}${p.article_code ? ` (${p.article_code})` : ""}`,
                  }))
                  .find((option) => option.value === String(selectedProduct)) || null
              }
              onChange={(selected) => {
                setSelectedProduct(selected?.value || "");
                setFromDate("");
                setToDate("");
                setSearch("");
              }}
              placeholder="— Select a product —"
              isClearable
              isSearchable
              className="text-sm"
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: "44px",
                  borderRadius: "12px",
                  borderColor: "#e2e8f0",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                  "&:hover": { borderColor: "#cbd5e1" },
                }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={handleFromChange} className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={handleToChange} className={inputClass} />
          </div>

          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="self-end px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-all"
            >
              Clear dates
            </button>
          )}

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, reference..."
            className={`${inputClass} w-full md:max-w-sm md:ml-auto`}
          />

          {selectedProduct && filteredEntries.length > 0 && (
            <div className="flex gap-2 self-end">
              <button
                onClick={handleExport}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none whitespace-nowrap"
              >
                Export Excel
              </button>
              <button
                onClick={handlePrint}
                className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none whitespace-nowrap"
              >
                Print
              </button>
            </div>
          )}
        </div>

        {/* NO PRODUCT */}
        {!selectedProduct && !loading && (
          <div className="py-16 text-center">
            <p className="text-2xl mb-2">📦</p>
            <p className="text-slate-500 text-sm font-medium">Select a product to view its ledger</p>
            <p className="text-slate-400 text-xs mt-1">All production and order movements will appear here.</p>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="py-8 text-center text-sm text-slate-500">Loading ledger…</div>
        )}

        {/* TABLE */}
        {!loading && selectedProduct && (
          <div id="ledger-print-area">
            {selectedFG && (
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <p className="text-xs text-slate-400">
                  Ledger for{" "}
                  <span className="font-semibold text-slate-700">{selectedFG.name}</span>
                  {selectedFG.article_code && (
                    <span className="ml-1 text-slate-400">· {selectedFG.article_code}</span>
                  )}
                  <span className="ml-2 text-slate-400">· {filteredEntries.length} entr{filteredEntries.length !== 1 ? "ies" : "y"}</span>
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 inline-block" />
                  Current stock: {formatNumber(stats.currentStock)} {selectedFG.unit || "pairs"}
                </span>
              </div>
            )}

            {filteredEntries.length === 0 ? (
              <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm font-medium">No entries found</p>
                <p className="text-slate-300 text-xs mt-1">
                  {allEntries.length > 0
                    ? "Try clearing the date filter to see all movements."
                    : "Production runs and orders for this product will appear here."}
                </p>
                {allEntries.length > 0 && (fromDate || toDate) && (
                  <button
                    onClick={() => { setFromDate(""); setToDate(""); }}
                    className="mt-3 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-all"
                  >
                    Clear date filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Name / Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Reference</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-emerald-500 whitespace-nowrap">Stock In</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-rose-400 whitespace-nowrap">Stock Out</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-indigo-500 whitespace-nowrap">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">

                    {/* Opening balance row — shown when date filter is active */}
                    {openingBalance !== null && (
                      <tr className="bg-amber-50/60">
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono whitespace-nowrap">{fromDate}</td>
                        <td className="px-4 py-3" colSpan={2}>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            Opening Balance
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right"><span className="text-slate-300">—</span></td>
                        <td className="px-4 py-3 text-right"><span className="text-slate-300">—</span></td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-amber-600">{formatNumber(openingBalance)}</span>
                        </td>
                      </tr>
                    )}

                    {filteredEntries.map((entry, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors hover:bg-slate-50/80 ${entry.type === "IN" ? "bg-emerald-50/20" : ""}`}
                      >
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                          {entry.date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                              entry.type === "IN"
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-rose-100 text-rose-500"
                            }`}>
                              {entry.type === "IN" ? "↑" : "↓"}
                            </span>
                            <span className="text-slate-800 font-medium">{entry.description}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{entry.reference}</td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_in > 0
                            ? <span className="font-semibold text-emerald-600">+{formatNumber(entry.qty_in)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_out > 0
                            ? <span className="font-semibold text-rose-500">-{formatNumber(entry.qty_out)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${
                            entry.balance > 0 ? "text-indigo-600"
                            : entry.balance === 0 ? "text-slate-400"
                            : "text-rose-500"
                          }`}>
                            {formatNumber(entry.balance)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TOTALS FOOTER */}
            {filteredEntries.length > 0 && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                  Summary — {filteredEntries.length} entr{filteredEntries.length !== 1 ? "ies" : "y"}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {openingBalance !== null && (
                    <div className="rounded-xl bg-white border border-amber-200 px-3 py-2.5 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Opening Balance</p>
                      <p className="font-bold text-amber-600">{formatNumber(openingBalance)} {selectedFG?.unit || "pairs"}</p>
                    </div>
                  )}
                  <div className="rounded-xl bg-white border border-emerald-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Total In</p>
                    <p className="font-bold text-emerald-600">{formatNumber(stats.totalIn)} {selectedFG?.unit || "pairs"}</p>
                  </div>
                  <div className="rounded-xl bg-white border border-rose-200 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">Total Out</p>
                    <p className="font-bold text-rose-500">{formatNumber(stats.totalOut)} {selectedFG?.unit || "pairs"}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-500 px-3 py-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Closing Balance</p>
                    <p className="font-bold text-white">{formatNumber(stats.closing)} {selectedFG?.unit || "pairs"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
