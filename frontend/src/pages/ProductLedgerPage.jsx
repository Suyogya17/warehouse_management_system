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
  "DELIVERY_REVERSAL",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
]);

const getMovementLabel = (movement) => {
  const type = String(movement.movement_type || "").toUpperCase();
  const notes = String(movement.notes || "").toLowerCase();
  const referenceType = String(movement.reference_type || "").toLowerCase();

  if (type === "PRODUCTION_IN") return "Added from production";
  if (type === "ORDER_OUT") return "Sold / delivered";
  if (type === "DELIVERY_REVERSAL") return "Delivery reversed / stock restored";
  if (type === "ADJUSTMENT_IN" && notes.startsWith("finished goods purchase")) {
    return "Added from purchase";
  }
  if (type === "ADJUSTMENT_OUT" && referenceType === "consumption") {
    return "Consumed / removed";
  }
  if (type === "TRANSFER_IN") return "Transferred in";
  if (type === "TRANSFER_OUT") return "Transferred out";
  if (type === "ADJUSTMENT_IN") return "Stock added";
  if (type === "ADJUSTMENT_OUT") return "Stock removed";
  return type || "Movement";
};

const getMovementKind = (movement) => {
  const type = String(movement.movement_type || "").toUpperCase();
  if (type === "DELIVERY_REVERSAL") return "IN";
  return type.endsWith("_IN") ? "IN" : "OUT";
};

const getMovementReference = (movement) => {
  const parts = [];
  const type = String(movement.movement_type || "").toUpperCase();

  if (type === "ORDER_OUT" || type === "DELIVERY_REVERSAL") {
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

const getCartons = (pairs, product) => {
  const quantity = Number(pairs || 0);
  const pairsPerCarton = Number(product?.inner_boxes_per_outer_box || 0);
  return pairsPerCarton > 0 ? quantity / pairsPerCarton : null;
};

const formatCtnPairs = (pairs, product) => {
  const cartons = getCartons(pairs, product);
  return cartons === null
    ? `${formatNumber(pairs)} pairs`
    : `${formatNumber(cartons)} CTN / ${formatNumber(pairs)} pairs`;
};

export default function ProductLedgerPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [finishedGoods, setFinishedGoods] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [shortageEvents, setShortageEvents] = useState([]);
  const [reservations, setReservations] = useState([]);
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
      setShortageEvents([]);
      setReservations([]);
      return;
    }

    let isActive = true;

    const loadLedger = async () => {
      try {
        setLoadingLedger(true);
        const [movementResult, shortageResult, reservationResult] = await Promise.allSettled([
          api.getWarehouseMovements(token, {
            finished_good_id: selectedProduct,
            limit: 500,
          }),
          api.getOrderShortageHistory({ finished_good_id: selectedProduct }, token),
          api.getProductReservations(token, selectedProduct),
        ]);

        if (movementResult.status === "rejected") throw movementResult.reason;

        if (isActive) {
          const movementRes = movementResult.value;
          setWarehouseMovements(movementRes.data || movementRes || []);
          setShortageEvents(
            shortageResult.status === "fulfilled"
              ? shortageResult.value?.data || []
              : []
          );
          setReservations(
            reservationResult.status === "fulfilled"
              ? reservationResult.value?.data || []
              : []
          );
        }
      } catch (error) {
        if (isActive) {
          setWarehouseMovements([]);
          setShortageEvents([]);
          setReservations([]);
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

    const movementRows = warehouseMovements
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
      .filter((row) => row.raw.toString() !== "Invalid Date" && (row.qty_in > 0 || row.qty_out > 0));

    const shortageRows = shortageEvents.map((event) => {
      const raw = new Date(event.verified_at || event.closed_at || event.order_placed_at || Date.now());
      const details = [
        event.delivery_note_numbers ? `DN ${event.delivery_note_numbers}` : "",
        event.customer_name ? `Customer: ${event.customer_name}` : "",
        `Order #${event.order_id}`,
        `${formatNumber(event.affected_pairs)} pairs — no stock deducted`,
        event.verification_note || "",
      ].filter(Boolean);

      return {
        id: `shortage-${event.allocation_id}`,
        raw,
        date: toDateInputValue(raw),
        kind: "NEUTRAL",
        movement: event.shortage_status === "OUT_OF_STOCK" ? "Out of stock" : "Not found",
        productName: event.product_name || selectedFG.name,
        warehouse: event.warehouse_name || "-",
        reference: details.join(" · "),
        deliveryNoteNumber: event.delivery_note_numbers || "",
        customerName: event.customer_name || "",
        qty_in: 0,
        qty_out: 0,
      };
    }).filter((row) => row.raw.toString() !== "Invalid Date");

    const rows = [...movementRows, ...shortageRows]
      .sort((a, b) => {
        const dateDiff = a.raw - b.raw;
        if (dateDiff !== 0) return dateDiff;
        return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true });
      });

    return rows;
  }, [selectedProduct, selectedFG, shortageEvents, warehouseMovements]);

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

  const stats = useMemo(() => {
    const totalAdded = filteredEntries.reduce((sum, row) => sum + row.qty_in, 0);
    const totalRemoved = filteredEntries.reduce((sum, row) => sum + row.qty_out, 0);
    const currentStock = Number(selectedFG?.quantity || 0);
    const reservedStock = reservations.reduce(
      (sum, row) => sum + Number(row.reserved_quantity || 0),
      0
    );
    const allAdded = ledgerEntries.reduce((sum, row) => sum + row.qty_in, 0);
    const allRemoved = ledgerEntries.reduce((sum, row) => sum + row.qty_out, 0);
    const unrecordedDifference = currentStock - (allAdded - allRemoved);

    return {
      totalAdded,
      totalRemoved,
      currentStock,
      reservedStock,
      availableStock: Math.max(0, currentStock - reservedStock),
      unrecordedDifference,
    };
  }, [filteredEntries, ledgerEntries, reservations, selectedFG]);

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setSearch("");
  };

  const handleExport = () => {
    if (!selectedFG) return;

    const rows = [
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
        "Added CTN": entry.qty_in ? getCartons(entry.qty_in, selectedFG) : "",
        "Sold / Removed CTN": entry.qty_out ? getCartons(entry.qty_out, selectedFG) : "",
      })),
      {},
      { Date: "Total Added", Added: stats.totalAdded },
      { Date: "Total Sold / Removed", "Sold / Removed": stats.totalRemoved },
      { Date: "Current Physical Stock", Added: stats.currentStock },
      { Date: "Reserved in Active Orders", Added: stats.reservedStock },
      { Date: "Available after Reserve", Added: stats.availableStock },
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

    if (reservations.length > 0) {
      const reservationSheet = XLSX.utils.json_to_sheet(
        reservations.map((row) => ({
          "Order #": row.order_id,
          Date: row.ordered_at ? toDateInputValue(new Date(row.ordered_at)) : "",
          Status: row.status,
          Dealer: row.dealer_name || "-",
          Customer: row.customer_name || "-",
          "Delivery No": row.delivery_note_number || "-",
          "Reserved CTN": getCartons(row.reserved_quantity, selectedFG),
          "Reserved Pairs": Number(row.reserved_quantity || 0),
        }))
      );
      reservationSheet["!cols"] = [
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 24 },
        { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(workbook, reservationSheet, "Active Reservations");
    }

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Current Stock"
          value={formatCtnPairs(stats.currentStock, selectedFG)}
          tone="calm"
          icon="stock"
        />
        <StatCard
          label="Added"
          value={formatCtnPairs(stats.totalAdded, selectedFG)}
          tone="success"
          icon="arrowUp"
        />
        <StatCard
          label="Sold / Removed"
          value={formatCtnPairs(stats.totalRemoved, selectedFG)}
          tone="alert"
          icon="arrowDown"
        />
        <StatCard
          label="Reserved"
          value={formatCtnPairs(stats.reservedStock, selectedFG)}
          tone="alert"
          icon="ledger"
        />
        <StatCard
          label="Available after Reserve"
          value={formatCtnPairs(stats.availableStock, selectedFG)}
          tone="success"
          icon="check"
        />
      </div>

      <SectionCard
        title="Product Ledger"
        subtitle="Only actual recorded events are shown. No opening balance is invented."
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
                  Physical: {formatCtnPairs(stats.currentStock, selectedFG)}
                </StatusBadge>
                <StatusBadge tone="warning">
                  Reserved: {formatCtnPairs(stats.reservedStock, selectedFG)}
                </StatusBadge>
              </div>
            ) : null}

            {stats.unrecordedDifference !== 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                The recorded movement history is incomplete by {formatNumber(Math.abs(stats.unrecordedDifference))} {selectedFG?.unit || "pairs"}.
                No assumed opening stock has been added. Current physical stock remains the authoritative quantity.
              </div>
            ) : null}

            {reservations.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-amber-200">
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Active reservations</p>
                  <p className="text-xs text-amber-700">Pending, confirmed, and packed orders that have not yet been delivered.</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Order</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Dealer / Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-amber-600">Reserved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {reservations.map((row) => (
                      <tr key={row.order_id}>
                        <td className="px-4 py-3 font-semibold text-slate-700">#{row.order_id}</td>
                        <td className="px-4 py-3"><StatusBadge tone="warning">{row.status}</StatusBadge></td>
                        <td className="px-4 py-3 text-slate-600">
                          <p className="font-medium">{row.dealer_name || "-"}</p>
                          <p className="text-xs text-slate-400">{row.customer_name || "No customer name"}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">
                          {formatCtnPairs(row.reserved_quantity, selectedFG)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                This product has no active reserved quantity.
              </div>
            )}

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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="transition-colors hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{entry.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              entry.kind === "IN"
                                ? "bg-emerald-100 text-emerald-600"
                                : entry.kind === "NEUTRAL"
                                  ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-500"
                            }`}>
                              {entry.kind === "IN" ? "↑" : entry.kind === "NEUTRAL" ? "!" : "↓"}
                            </span>
                            <span className="font-medium text-slate-800">{entry.movement}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.warehouse}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{entry.reference}</td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_in > 0 ? (
                            <span className="font-semibold text-emerald-600">+{formatCtnPairs(entry.qty_in, selectedFG)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.qty_out > 0 ? (
                            <span className="font-semibold text-rose-500">-{formatCtnPairs(entry.qty_out, selectedFG)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
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
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Added</p>
                    <p className="font-bold text-emerald-600">{formatCtnPairs(stats.totalAdded, selectedFG)}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">Sold / Removed</p>
                    <p className="font-bold text-rose-500">{formatCtnPairs(stats.totalRemoved, selectedFG)}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-500 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Current physical stock</p>
                    <p className="font-bold text-white">{formatCtnPairs(stats.currentStock, selectedFG)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Reserved</p>
                    <p className="font-bold text-amber-700">{formatCtnPairs(stats.reservedStock, selectedFG)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Available after reserve</p>
                    <p className="font-bold text-emerald-700">{formatCtnPairs(stats.availableStock, selectedFG)}</p>
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
