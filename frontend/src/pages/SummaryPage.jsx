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
const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

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

const emptyStatusTotals = () => ({ pairs: 0, cartons: 0, orders: new Set(), details: [] });

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

const uniqueNames = (values = []) => [...new Set(values.filter(Boolean))];
const normalizedCustomerName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const getCustomerDiscount = (dealerId, customerName) => {
  const normalizedName = normalizedCustomerName(customerName);
  if (!dealerId || !normalizedName) return 0;
  const value = Number(window.localStorage.getItem(`warehouse-billing-discount:${dealerId}:${normalizedName}`));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

function StatusDetailsModal({ status, totals, details, onClose }) {
  if (!status) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={statusTone[status]}>{status}</StatusBadge>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matching order details</p>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {formatNumber(totals?.pairs)} pairs · {formatNumber(totals?.cartons)} carton
            </h2>
            <p className="mt-1 text-sm text-slate-500">{details.length} matching product line{details.length === 1 ? "" : "s"} from the current date and search filters.</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>

        <div className="max-h-[73vh] overflow-auto">
          <table className="w-full min-w-[1450px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-indigo-50 text-xs uppercase tracking-wide text-slate-700">
              <tr>
                {["Order / date", "Party", "Product", "Quantity", "Order placed by", "Confirmed by", "Packed by", "Delivered by", "Warehouse / DN", "Notes"].map((label) => (
                  <th key={label} className="border-b border-slate-300 px-4 py-3">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {details.map((detail) => (
                <tr key={`${detail.order_id}-${detail.order_item_id}`} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="font-bold text-slate-950">#{detail.order_id}</p><p className="mt-1 whitespace-nowrap text-xs text-slate-500">{formatDate(detail.created_at)}</p></td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{detail.customer_name}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{detail.finished_good_id} - {detail.product_name}</p><p className="mt-1 text-xs text-slate-500">{detail.article_code} · {detail.color || "No color"} · {detail.size || "No size"}</p></td>
                  <td className="px-4 py-3"><p className="font-bold text-slate-900">{formatNumber(detail.pairs)} pairs</p><p className="text-xs text-slate-500">{formatNumber(detail.cartons)} carton</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{detail.created_by_name || "Unknown"}</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{detail.confirmed_by_name || "Not confirmed"}</p>{detail.confirmed_at ? <p className="mt-1 text-xs text-slate-500">{formatDate(detail.confirmed_at)}</p> : null}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{detail.packed_by_name || "Not packed"}</p>{detail.packed_at ? <p className="mt-1 text-xs text-slate-500">{formatDate(detail.packed_at)}</p> : null}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{detail.delivered_by_names.length ? detail.delivered_by_names.join(", ") : "Not delivered"}</p>{detail.delivered_at ? <p className="mt-1 text-xs text-slate-500">{formatDate(detail.delivered_at)}</p> : null}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{detail.warehouse_names.length ? detail.warehouse_names.join(", ") : "Not assigned"}</p><p className="mt-1 text-xs text-slate-500">{detail.delivery_note_numbers.length ? detail.delivery_note_numbers.join(", ") : "DN not assigned"}</p></td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate-600">{detail.cancellation_reason || detail.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!details.length ? <div className="p-10 text-center text-sm text-slate-500">No matching {status.toLowerCase()} order details.</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function SummaryPage() {
  const { token }     = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders]   = useState([]);
  const [deliveryReport, setDeliveryReport] = useState({ data: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const today = toDateInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate,   setToDate]   = useState(today);
  const [deliveryFromDate, setDeliveryFromDate] = useState(today);
  const [deliveryToDate, setDeliveryToDate] = useState(today);
  const [deliveryFromTime, setDeliveryFromTime] = useState("");
  const [deliveryToTime, setDeliveryToTime] = useState("");
  const [deliveryPerson, setDeliveryPerson] = useState("");
  const [deliveryUser, setDeliveryUser] = useState("");

  // ── load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ordersResult, deliveriesResult] = await Promise.all([
        api.getOrders(token, { limit: 500 }),
        api.getDeliveryReport({ from_date: deliveryFromDate, to_date: deliveryToDate }, token),
      ]);
      setOrders(ordersResult.data || []);
      setDeliveryReport(deliveriesResult || { data: [], summary: {} });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Summary failed",
        message: error.message || "Could not load order summary.",
      });
    } finally {
      setLoading(false);
    }
  }, [deliveryFromDate, deliveryToDate, showToast, token]);

  const deliveryColumns = useMemo(() => [
    { key: "delivered_at", label: "Delivered at", render: (row) => formatDate(row.delivered_at) },
    { key: "delivery_note_number", label: "Warehouse DN", render: (row) => row.delivery_note_number || "-" },
    { key: "warehouse_name", label: "Warehouse" },
    { key: "order_id", label: "Order", render: (row) => `#${row.order_id}` },
    { key: "created_by_name", label: "Order user", render: (row) => row.created_by_name || "-" },
    { key: "customer_name", label: "Party / customer" },
    { key: "product_name", label: "Product", render: (row) => `${row.finished_good_id} · ${row.article_code || row.product_name}${row.color ? ` · ${row.color}` : ""}${row.size ? ` · ${row.size}` : ""}` },
    { key: "delivered_pairs", label: "Delivered pairs", render: (row) => `${formatNumber(row.delivered_pairs)} ${row.unit || "pairs"}` },
    { key: "delivered_cartons", label: "Cartons", render: (row) => formatNumber(row.delivered_cartons) },
    { key: "delivered_by_name", label: "Delivered by", render: (row) => row.delivered_by_name || "-" },
  ], []);

  useEffect(() => { load(); }, [load]);

  const deliveryPeople = useMemo(() => uniqueNames(
    (deliveryReport.data || []).map((row) => row.delivered_by_name)
  ).sort((a, b) => a.localeCompare(b)), [deliveryReport.data]);

  const deliveryUsers = useMemo(() => uniqueNames(
    (deliveryReport.data || []).map((row) => row.created_by_name)
  ).sort((a, b) => a.localeCompare(b)), [deliveryReport.data]);

  const filteredDeliveryRows = useMemo(() => (deliveryReport.data || []).filter((row) => {
    if (deliveryPerson && row.delivered_by_name !== deliveryPerson) return false;
    if (deliveryUser && row.created_by_name !== deliveryUser) return false;
    if (deliveryFromTime || deliveryToTime) {
      const deliveredDate = new Date(row.delivered_at);
      const deliveredTime = `${String(deliveredDate.getHours()).padStart(2, "0")}:${String(deliveredDate.getMinutes()).padStart(2, "0")}`;
      if (deliveryFromTime && deliveredTime < deliveryFromTime) return false;
      if (deliveryToTime && deliveredTime > deliveryToTime) return false;
    }
    return true;
  }), [deliveryFromTime, deliveryPerson, deliveryReport.data, deliveryToTime, deliveryUser]);

  const filteredDeliverySummary = useMemo(() => {
    const orderIds = new Set();
    const warehouseIds = new Set();
    const totals = filteredDeliveryRows.reduce((summary, row) => {
      orderIds.add(row.order_id);
      warehouseIds.add(row.warehouse_id);
      summary.delivered_pairs += Number(row.delivered_pairs || 0);
      summary.delivered_cartons += Number(row.delivered_cartons || 0);
      return summary;
    }, { delivered_pairs: 0, delivered_cartons: 0 });
    return {
      ...totals,
      delivered_cartons: Math.round(totals.delivered_cartons * 100) / 100,
      order_count: orderIds.size,
      warehouse_count: warehouseIds.size,
    };
  }, [filteredDeliveryRows]);

  const exportDeliveryBillingExcel = async () => {
    if (!filteredDeliveryRows.length) {
      showToast({ tone: "error", title: "Nothing to export", message: "No warehouse deliveries match the selected filters." });
      return;
    }

    const StyledXLSX = await import("xlsx-js-style");
    const workbook = StyledXLSX.utils.book_new();
    const groups = new Map();
    filteredDeliveryRows.forEach((row) => {
      const deliveredDate = toDateInputValue(new Date(row.delivered_at));
      const key = `${deliveredDate}::${row.created_by || row.created_by_name || "unknown"}`;
      if (!groups.has(key)) groups.set(key, { deliveredDate, dealer: row.created_by_name || "Unknown dealer", rows: [] });
      groups.get(key).rows.push(row);
    });

    const borderSide = { style: "thin", color: { rgb: "D7DEE8" } };
    const border = { top: borderSide, bottom: borderSide, left: borderSide, right: borderSide };
    const applyStyle = (sheet, range, style) => {
      const decoded = StyledXLSX.utils.decode_range(range);
      for (let rowIndex = decoded.s.r; rowIndex <= decoded.e.r; rowIndex += 1) {
        for (let columnIndex = decoded.s.c; columnIndex <= decoded.e.c; columnIndex += 1) {
          const address = StyledXLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          if (!sheet[address]) sheet[address] = { t: "s", v: "" };
          sheet[address].s = { ...(sheet[address].s || {}), ...style };
        }
      }
    };
    const cleanSheetName = (value) => String(value || "Dealer")
      .replace(/[\\/?*:[\]]/g, "-")
      .trim()
      .slice(0, 31) || "Dealer";
    const usedNames = new Set();
    const uniqueSheetName = (base) => {
      let name = cleanSheetName(base);
      let suffix = 2;
      while (usedNames.has(name)) {
        const suffixText = ` ${suffix}`;
        name = `${cleanSheetName(base).slice(0, 31 - suffixText.length)}${suffixText}`;
        suffix += 1;
      }
      usedNames.add(name);
      return name;
    };

    const summaryRows = [["DELIVERY BILLING SUMMARY"], ["From", new Date(`${deliveryFromDate}T00:00:00`), "To", new Date(`${deliveryToDate}T00:00:00`)], [], ["Delivery date", "Dealer", "CTN", "Pairs", "Total billing"]];

    Array.from(groups.values())
      .sort((a, b) => a.deliveredDate.localeCompare(b.deliveredDate) || a.dealer.localeCompare(b.dealer))
      .forEach((group) => {
        const sheetRows = [
          ["WAREHOUSE DELIVERY BILL"],
          ["Delivery date", new Date(`${group.deliveredDate}T00:00:00`), "Dealer", group.dealer],
          ["Report basis", "Actual delivery time", "Generated", new Date()],
          [],
          ["S.No", "Time", "Warehouse DN", "Warehouse", "Order", "Customer", "Product type", "Product", "CTN", "Qty", "Rate", "Discount %", "Amount"],
          ...group.rows.map((row, index) => {
            const deliveredAt = new Date(row.delivered_at);
            const discountPercent = row.is_commission ? getCustomerDiscount(row.created_by, row.customer_name) : 0;
            return [
              index + 1,
              deliveredAt,
              row.delivery_note_number || "-",
              row.warehouse_name || "-",
              Number(row.order_id),
              row.customer_name || "-",
              row.is_commission ? "Percentage" : "Non commission",
              `${row.article_code || row.product_name}${row.color ? ` · ${row.color}` : ""}${row.size ? ` · ${row.size}` : ""}`,
              Number(row.delivered_cartons || 0),
              Number(row.delivered_pairs || 0),
              Number(row.unit_price_snapshot || 0),
              discountPercent / 100,
              null,
            ];
          }),
        ];
        const firstItemRow = 6;
        const lastItemRow = firstItemRow + group.rows.length - 1;
        const totalRow = lastItemRow + 2;
        sheetRows.push([], ["", "", "", "", "", "", "", "TOTAL", null, null, "", "", null]);
        const sheet = StyledXLSX.utils.aoa_to_sheet(sheetRows);
        group.rows.forEach((_, index) => {
          const rowNumber = firstItemRow + index;
          sheet[`M${rowNumber}`] = { t: "n", f: `J${rowNumber}*K${rowNumber}*(1-L${rowNumber})` };
        });
        sheet[`I${totalRow}`] = { t: "n", f: `SUM(I${firstItemRow}:I${lastItemRow})` };
        sheet[`J${totalRow}`] = { t: "n", f: `SUM(J${firstItemRow}:J${lastItemRow})` };
        sheet[`M${totalRow}`] = { t: "n", f: `SUM(M${firstItemRow}:M${lastItemRow})` };
        sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }];
        sheet["!cols"] = [6, 11, 18, 16, 10, 22, 18, 38, 10, 10, 13, 13, 16].map((wch) => ({ wch }));
        sheet["!rows"] = [{ hpt: 28 }, { hpt: 22 }, { hpt: 20 }, { hpt: 8 }, { hpt: 28 }];
        sheet["!freeze"] = { xSplit: 0, ySplit: 5 };
        sheet["!autofilter"] = { ref: `A5:M${lastItemRow}` };
        sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 };
        sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 1, paperSize: 9 };
        applyStyle(sheet, `A1:M1`, { fill: { fgColor: { rgb: "312E81" } }, font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } });
        applyStyle(sheet, `A2:M3`, { font: { name: "Arial", sz: 10 }, alignment: { vertical: "center" } });
        applyStyle(sheet, `A5:M5`, { fill: { fgColor: { rgb: "4338CA" } }, font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border });
        applyStyle(sheet, `A${firstItemRow}:M${lastItemRow}`, { font: { name: "Arial", sz: 10, color: { rgb: "172033" } }, alignment: { vertical: "center" }, border });
        applyStyle(sheet, `H${totalRow}:M${totalRow}`, { fill: { fgColor: { rgb: "E0E7FF" } }, font: { name: "Arial", sz: 11, bold: true, color: { rgb: "1E1B4B" } }, border });
        sheet["B2"].z = "dd-mmm-yyyy";
        sheet["D3"].z = "dd-mmm-yyyy hh:mm";
        for (let rowNumber = firstItemRow; rowNumber <= lastItemRow; rowNumber += 1) {
          sheet[`B${rowNumber}`].z = "hh:mm";
          sheet[`I${rowNumber}`].z = "#,##0.00";
          sheet[`J${rowNumber}`].z = "#,##0";
          sheet[`K${rowNumber}`].z = "#,##0.00";
          sheet[`L${rowNumber}`].z = "0.00%";
          sheet[`M${rowNumber}`].z = "#,##0.00";
        }
        sheet[`I${totalRow}`].z = "#,##0.00";
        sheet[`J${totalRow}`].z = "#,##0";
        sheet[`M${totalRow}`].z = "#,##0.00";
        StyledXLSX.utils.book_append_sheet(workbook, sheet, uniqueSheetName(`${group.deliveredDate.slice(5)} ${group.dealer}`));

        const totalCartons = group.rows.reduce((sum, row) => sum + Number(row.delivered_cartons || 0), 0);
        const totalPairs = group.rows.reduce((sum, row) => sum + Number(row.delivered_pairs || 0), 0);
        const totalBilling = group.rows.reduce((sum, row) => {
          const discount = row.is_commission ? getCustomerDiscount(row.created_by, row.customer_name) / 100 : 0;
          return sum + Number(row.delivered_pairs || 0) * Number(row.unit_price_snapshot || 0) * (1 - discount);
        }, 0);
        summaryRows.push([new Date(`${group.deliveredDate}T00:00:00`), group.dealer, totalCartons, totalPairs, totalBilling]);
      });

    const summarySheet = StyledXLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    summarySheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
    summarySheet["!freeze"] = { xSplit: 0, ySplit: 4 };
    applyStyle(summarySheet, "A1:E1", { fill: { fgColor: { rgb: "312E81" } }, font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } });
    applyStyle(summarySheet, "A4:E4", { fill: { fgColor: { rgb: "4338CA" } }, font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center" }, border });
    if (summaryRows.length > 4) applyStyle(summarySheet, `A5:E${summaryRows.length}`, { font: { name: "Arial", sz: 10 }, border });
    for (let rowNumber = 5; rowNumber <= summaryRows.length; rowNumber += 1) {
      summarySheet[`A${rowNumber}`].z = "dd-mmm-yyyy";
      summarySheet[`C${rowNumber}`].z = "#,##0.00";
      summarySheet[`D${rowNumber}`].z = "#,##0";
      summarySheet[`E${rowNumber}`].z = "#,##0.00";
    }
    workbook.SheetNames.unshift("Summary");
    workbook.Sheets.Summary = summarySheet;
    StyledXLSX.writeFile(workbook, `warehouse-delivery-billing-${deliveryFromDate}-to-${deliveryToDate}.xlsx`, { cellStyles: true });
  };

  // ── summary rows ──────────────────────────────────────────
  const summaryRows = useMemo(() => {
    const rowsByKey = new Map();

    orders
      .filter((order) => isInRange(getOrderDate(order), fromDate, toDate))
      .filter((order) => TRACKED_STATUSES.includes(order.status))
      .forEach((order) => {
        const createdBy = order.created_by_name || "Unknown";
        const customerName = order.customer_name || "Unknown customer";

        (order.items || []).forEach((item) => {
          const productName = item.product_name || "Unknown product";
          const key = [createdBy, customerName, item.finished_good_id || productName].join("::");

          if (!rowsByKey.has(key)) {
            rowsByKey.set(key, {
              id:              key,
              created_by_name: createdBy,
              customer_name:   customerName,
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
          const allocations = item.warehouse_allocations || [];
          statusTotals.details.push({
            order_id: order.id,
            order_item_id: item.id,
            created_at: order.created_at,
            customer_name: customerName,
            created_by_name: createdBy,
            finished_good_id: item.finished_good_id,
            product_name: productName,
            article_code: item.article_code || "-",
            color: item.color || "",
            size: item.size || "",
            pairs,
            cartons: getItemCartons(item),
            confirmed_by_name: order.confirmed_by_name || "",
            confirmed_at: order.confirmed_at,
            packed_by_name: order.packed_by_name || "",
            packed_at: order.packed_at,
            delivered_by_names: uniqueNames([
              order.delivered_by_name,
              ...allocations.map((allocation) => allocation.delivered_by_name),
            ]),
            delivered_at: order.delivered_at,
            warehouse_names: uniqueNames(allocations.map((allocation) => allocation.warehouse_name)),
            delivery_note_numbers: uniqueNames([
              order.delivery_note_number,
              ...(order.warehouse_delivery_note_numbers || []),
            ]),
            notes: order.notes || "",
            cancellation_reason: order.cancellation_reason || "",
          });
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
        if (u !== 0) return u;
        const c = a.customer_name.localeCompare(b.customer_name);
        return c !== 0 ? c : a.product_name.localeCompare(b.product_name);
      });
  }, [orders, fromDate, toDate]);

  // ── search filter ─────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return summaryRows;
    return summaryRows.filter((row) =>
      [
        row.created_by_name,
        row.customer_name,
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

  const selectedStatusDetails = useMemo(() => {
    if (!selectedStatus) return [];
    return filteredRows
      .flatMap((row) => row[selectedStatus]?.details || [])
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [filteredRows, selectedStatus]);

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
        "Customer Name": row.customer_name,
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
        "Customer Name": "",
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
      { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 28 },
      { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 15 }, { wch: 17 }, { wch: 13 },
      { wch: 15 }, { wch: 15 }, { wch: 17 }, { wch: 15 },
      { wch: 17 }, { wch: 12 }, { wch: 14 },
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
                <th>Customer</th>
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
                  <td>${escapeHtml(row.customer_name)}</td>
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
                <td colspan="7">Totals</td>
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
    { key: "customer_name", label: "Customer" },
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

      <SectionCard
        title="Warehouse delivery report"
        subtitle="Filter actual warehouse deliveries by date, time, delivered-by person, or the user who placed the order."
        icon="check"
      >
        <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs font-semibold text-slate-600">From date<input type="date" className={`mt-1 ${inputClass}`} value={deliveryFromDate} max={deliveryToDate || undefined} onChange={(event) => setDeliveryFromDate(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">To date<input type="date" className={`mt-1 ${inputClass}`} value={deliveryToDate} min={deliveryFromDate || undefined} onChange={(event) => setDeliveryToDate(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">From time<input type="time" className={`mt-1 ${inputClass}`} value={deliveryFromTime} onChange={(event) => setDeliveryFromTime(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">To time<input type="time" className={`mt-1 ${inputClass}`} value={deliveryToTime} onChange={(event) => setDeliveryToTime(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">Delivered by<select className={`mt-1 ${inputClass}`} value={deliveryPerson} onChange={(event) => setDeliveryPerson(event.target.value)}><option value="">All people</option>{deliveryPeople.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Order user / dealer<select className={`mt-1 ${inputClass}`} value={deliveryUser} onChange={(event) => setDeliveryUser(event.target.value)}><option value="">All users</option>{deliveryUsers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <div className="sm:col-span-2 lg:col-span-6"><Button variant="secondary" onClick={() => { setDeliveryFromDate(today); setDeliveryToDate(today); setDeliveryFromTime(""); setDeliveryToTime(""); setDeliveryPerson(""); setDeliveryUser(""); }}>Reset to today</Button></div>
        </div>
        <div className="grid gap-3 px-5 pt-5 sm:grid-cols-4">
          <StatCard label="Delivered pairs" value={formatNumber(filteredDeliverySummary.delivered_pairs)} tone="calm" icon="check" />
          <StatCard label="CTN delivered" value={formatNumber(filteredDeliverySummary.delivered_cartons)} icon="stock" />
          <StatCard label="Orders delivered" value={formatNumber(filteredDeliverySummary.order_count)} icon="orders" />
          <StatCard label="Warehouses used" value={formatNumber(filteredDeliverySummary.warehouse_count)} icon="warehouse" />
        </div>
        <div className="p-5">
          <DataTable
            columns={deliveryColumns}
            rows={filteredDeliveryRows}
            exportFilename={`warehouse-deliveries-${deliveryFromDate}-${deliveryToDate}`}
            onExport={exportDeliveryBillingExcel}
            emptyTitle="No matching deliveries"
            emptyDescription="No warehouse deliveries match the selected filters."
            responsiveScroll
            minTableWidth={1350}
          />
        </div>
      </SectionCard>

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
            placeholder="Search user, customer, product, or article..."
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
              showToolbar={false}
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

                  {TRACKED_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setSelectedStatus(status)}
                      className="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-100"
                      title={`View ${status.toLowerCase()} order details`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 group-hover:text-indigo-600">{status}</p>
                      {formatTotalQty(pageTotals[status])}
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-indigo-600">View who and orders</p>
                    </button>
                  ))}

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
      <StatusDetailsModal
        status={selectedStatus}
        totals={selectedStatus ? pageTotals[selectedStatus] : null}
        details={selectedStatusDetails}
        onClose={() => setSelectedStatus("")}
      />
    </div>
  );
}
