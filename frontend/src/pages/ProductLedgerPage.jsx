import { useCallback, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import * as XLSX from "xlsx";

import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const TOTAL_STOCK_MOVEMENTS = new Set([
  "PRODUCTION_IN",
  "ORDER_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
]);

const getMovementLabel = (movement) => {
  const type = String(movement.movement_type || "").toUpperCase();
  const notes = String(movement.notes || "").toLowerCase();
  const referenceType = String(movement.reference_type || "").toLowerCase();

  if (type === "PRODUCTION_IN") return "Added from production";
  if (type === "ORDER_OUT") return "Sold / delivered";
  if (type === "ADJUSTMENT_IN" && notes.startsWith("finished goods purchase")) {
    return "Added from purchase";
  }
  if (type === "ADJUSTMENT_OUT" && referenceType === "consumption") {
    return "Consumed / removed";
  }
  if (type === "ADJUSTMENT_IN") return "Stock added";
  if (type === "ADJUSTMENT_OUT") return "Stock removed";
  return type || "Movement";
};

const getMovementKind = (movement) => {
  const type = String(movement.movement_type || "").toUpperCase();
  return type.endsWith("_IN") ? "IN" : "OUT";
};

const getMovementReference = (movement) => {
  const parts = [];
  const type = String(movement.movement_type || "").toUpperCase();

  if (type === "ORDER_OUT") {
    if (movement.delivery_note_number) parts.push(`Delivery ${movement.delivery_note_number}`);
    if (movement.order_customer_name) parts.push(`Customer: ${movement.order_customer_name}`);
  }

  if (movement.notes) parts.push(movement.notes);
  if (movement.warehouse_name) parts.push(movement.warehouse_name);
  if (movement.reference_type && movement.reference_id) {
    parts.push(`${movement.reference_type} #${movement.reference_id}`);
  }
  return parts.join(" · ") || "-";
};

export default function ProductLedgerPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [finishedGoods, setFinishedGoods] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const fgRes = await api.getFinishedGoods(token);
      setFinishedGoods(fgRes.data || fgRes || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Products failed to load",
        message: error.message || "Could not load products.",
      });
    } finally {
      setLoadingProducts(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!selectedProduct) {
      setWarehouseMovements([]);
      return;
    }

    let isActive = true;

    const loadLedger = async () => {
      try {
        setLoadingLedger(true);
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
            title: "Ledger failed to load",
            message: error.message || "Could not load warehouse movement ledger.",
          });
        }
      } finally {
        if (isActive) setLoadingLedger(false);
      }
    };

    loadLedger();
    return () => {
      isActive = false;
    };
  }, [selectedProduct, token, showToast]);

  const productOptions = useMemo(
    () => [...finishedGoods].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [finishedGoods]
  );

  const selectedFG = useMemo(
    () => productOptions.find((product) => String(product.id) === String(selectedProduct)),
    [productOptions, selectedProduct]
  );

  const ledgerEntries = useMemo(() => {
    if (!selectedProduct || !selectedFG) return [];

    const rows = warehouseMovements
      .filter((movement) => TOTAL_STOCK_MOVEMENTS.has(String(movement.movement_type || "").toUpperCase()))
      .map((movement) => {
        const qty = Number(movement.quantity || 0);
        const raw = new Date(movement.created_at || movement.updated_at || Date.now());
        const kind = getMovementKind(movement);

        return {
          id: movement.id,
          raw,
          date: toDateInputValue(raw),
          kind,
          movement: getMovementLabel(movement),
          productName: movement.product_name || selectedFG.name,
          warehouse: movement.warehouse_name || "-",
          reference: getMovementReference(movement),
          deliveryNoteNumber: movement.delivery_note_number || "",
          customerName: movement.order_customer_name || "",
          qty_in: kind === "IN" ? qty : 0,
          qty_out: kind === "OUT" ? qty : 0,
        };
      })
      .filter((row) => row.raw.toString() !== "Invalid Date" && (row.qty_in > 0 || row.qty_out > 0))
      .sort((a, b) => {
        const dateDiff = a.raw - b.raw;
        if (dateDiff !== 0) return dateDiff;
        return Number(a.id || 0) - Number(b.id || 0);
      });

    const currentStock = Number(selectedFG.quantity || 0);
    const netMovement = rows.reduce((sum, row) => sum + row.qty_in - row.qty_out, 0);
    let runningBalance = currentStock - netMovement;

    return rows.map((row) => {
      runningBalance += row.qty_in - row.qty_out;
      return { ...row, balance: runningBalance };
    });
  }, [selectedProduct, selectedFG, warehouseMovements]);

  const openingBalance = useMemo(() => {
    if (!ledgerEntries.length || !selectedFG) return Number(selectedFG?.quantity || 0);
    const currentStock = Number(selectedFG.quantity || 0);
    const netMovement = ledgerEntries.reduce((sum, row) => sum + row.qty_in - row.qty_out, 0);
    return currentStock - netMovement;
  }, [ledgerEntries, selectedFG]);

  const filteredEntries = useMemo(() => {
    let rows = ledgerEntries;
    if (fromDate) rows = rows.filter((row) => row.date >= fromDate);
    if (toDate) rows = rows.filter((row) => row.date <= toDate);

    const term = search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) =>
        [
          row.date,
          row.movement,
          row.productName,
          row.warehouse,
          row.reference,
          row.deliveryNoteNumber,
          row.customerName,
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        )
      );
    }

    return rows;
  }, [ledgerEntries, fromDate, toDate, search]);

  const rangeOpeningBalance = useMemo(() => {
    if (!fromDate) return openingBalance;
    const before = ledgerEntries.filter((row) => row.date < fromDate);
    return before.length ? before[before.length - 1].balance : openingBalance;
  }, [ledgerEntries, fromDate, openingBalance]);

  const stats = useMemo(() => {
    const totalAdded = filteredEntries.reduce((sum, row) => sum + row.qty_in, 0);
    const totalRemoved = filteredEntries.reduce((sum, row) => sum + row.qty_out, 0);
    const currentStock = Number(selectedFG?.quantity || 0);
    const closingBalance = filteredEntries.length
      ? filteredEntries[filteredEntries.length - 1].balance
      : rangeOpeningBalance;

    return {
      totalAdded,
      totalRemoved,
      currentStock,
      closingBalance,
      openingBalance: rangeOpeningBalance,
    };
  }, [filteredEntries, rangeOpeningBalance, selectedFG]);

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setSearch("");
  };

  const handleExport = () => {
    if (!selectedFG) return;

    const rows = [
      {
        Date: fromDate || "Opening",
        Movement: "Opening / previous balance",
        Product: selectedFG.name,
        Warehouse: "",
        "Delivery No": "",
        Customer: "",
        Reference: "",
        Added: "",
        "Sold / Removed": "",
        Remaining: stats.openingBalance,
      },
      ...filteredEntries.map((entry) => ({
        Date: entry.date,
        Movement: entry.movement,
        Product: entry.productName,
        Warehouse: entry.warehouse,
        "Delivery No": entry.deliveryNoteNumber,
        Customer: entry.customerName,
        Reference: entry.reference,
        Added: entry.qty_in || "",
        "Sold / Removed": entry.qty_out || "",
        Remaining: entry.balance,
      })),
      {},
      { Date: "Total Added", Added: stats.totalAdded },
      { Date: "Total Sold / Removed", "Sold / Removed": stats.totalRemoved },
      { Date: "Current Stock", Remaining: stats.currentStock },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 30 },
      { wch: 16 },
      { wch: 16 },
      { wch: 24 },
      { wch: 34 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    const sheetName = (selectedFG.name || "Ledger").replace(/[:\\/?*\[\]]/g, "-").slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const today = new Date().toISOString().slice(0, 10);
    const safeName = (selectedFG.name || "product").replace(/[\\/:*?"<>|]/g, "-");
    XLSX.writeFile(workbook, `ledger-${safeName}-${today}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm " +
    "focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Current Stock"
          value={`${formatNumber(stats.currentStock)} ${selectedFG?.unit || "pairs"}`}
          tone="calm"
          icon="stock"
        />
        <StatCard
          label="Added"
          value={formatNumber(stats.totalAdded)}
          tone="success"
          icon="arrowUp"
        />
        <StatCard
          label="Sold / Removed"
          value={formatNumber(stats.totalRemoved)}
          tone="alert"
          icon="arrowDown"
        />
        <StatCard
          label="Remaining"
          value={formatNumber(stats.closingBalance)}
          tone={stats.closingBalance > 0 ? "success" : stats.closingBalance === 0 ? "calm" : "alert"}
          icon="check"
        />
      </div>

      <SectionCard
        title="Product Ledger"
        subtitle="Actual product movement from warehouse records: added, sold or removed, and remaining stock."
        icon="ledger"
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
          <div className="flex min-w-72 flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Product</label>
            <Select
              options={productOptions.map((product) => ({
                value: String(product.id),
                label: `${product.name || product.product_name}${product.article_code ? ` (${product.article_code})` : ""}`,
              }))}
              value={
                productOptions
                  .map((product) => ({
                    value: String(product.id),
                    label: `${product.name || product.product_name}${product.article_code ? ` (${product.article_code})` : ""}`,
                  }))
                  .find((option) => option.value === String(selectedProduct)) || null
              }
              onChange={(selected) => {
                setSelectedProduct(selected?.value || "");
                clearFilters();
              }}
              placeholder="Select a product"
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
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              className={inputClass}
            />
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search movement, warehouse, reference..."
            className={`${inputClass} w-full md:max-w-sm md:ml-auto`}
          />

          {(fromDate || toDate || search) && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Clear
            </button>
          )}

          {selectedProduct && filteredEntries.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                Print
              </button>
            </div>
          )}
        </div>

        {!selectedProduct && !loadingProducts ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
            <p className="text-sm font-medium text-slate-500">Select a product to view its ledger.</p>
            <p className="mt-1 text-xs text-slate-400">Purchases, production, sales, consumption, and adjustments will appear here.</p>
          </div>
        ) : null}

        {(loadingProducts || loadingLedger) && selectedProduct ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading ledger...</div>
        ) : null}

        {!loadingProducts && !loadingLedger && selectedProduct ? (
          <div id="ledger-print-area" className="space-y-4">
            {selectedFG ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-400">
                  Ledger for <span className="font-semibold text-slate-700">{selectedFG.name}</span>
                  {selectedFG.article_code ? <span className="ml-1">· {selectedFG.article_code}</span> : null}
                  <span className="ml-2">· {filteredEntries.length} entr{filteredEntries.length === 1 ? "y" : "ies"}</span>
                </p>
                <StatusBadge tone="info">
                  Current stock: {formatNumber(stats.currentStock)} {selectedFG.unit || "pairs"}
                </StatusBadge>
              </div>
            ) : null}

            {stats.openingBalance !== 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Opening / previous balance is {formatNumber(stats.openingBalance)} {selectedFG?.unit || "pairs"}.
                This keeps the final remaining balance equal to the actual current stock.
              </div>
            ) : null}

            {filteredEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
                <p className="text-sm font-medium text-slate-500">No ledger entries found.</p>
                <p className="mt-1 text-xs text-slate-400">Try clearing filters or check whether this product has warehouse movements.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Movement</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Warehouse</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Reference</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-emerald-500">Added</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-rose-400">Sold / Removed</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-indigo-500">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fromDate ? (
                      <tr className="bg-amber-50/60">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{fromDate}</td>
                        <td className="px-4 py-3 font-semibold text-amber-700" colSpan={5}>
                          Opening / previous balance
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">
                          {formatNumber(stats.openingBalance)}
                        </td>
                      </tr>
                    ) : null}

                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="transition-colors hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{entry.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              entry.kind === "IN"
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-rose-100 text-rose-500"
                            }`}>
                              {entry.kind === "IN" ? "↑" : "↓"}
                            </span>
                            <span className="font-medium text-slate-800">{entry.movement}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.warehouse}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{entry.reference}</td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_in > 0 ? (
                            <span className="font-semibold text-emerald-600">+{formatNumber(entry.qty_in)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_out > 0 ? (
                            <span className="font-semibold text-rose-500">-{formatNumber(entry.qty_out)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600">
                          {formatNumber(entry.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredEntries.length > 0 ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                  Summary
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-amber-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Opening</p>
                    <p className="font-bold text-amber-600">{formatNumber(stats.openingBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Added</p>
                    <p className="font-bold text-emerald-600">{formatNumber(stats.totalAdded)}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">Sold / Removed</p>
                    <p className="font-bold text-rose-500">{formatNumber(stats.totalRemoved)}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-500 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Remaining</p>
                    <p className="font-bold text-white">{formatNumber(stats.closingBalance)}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
