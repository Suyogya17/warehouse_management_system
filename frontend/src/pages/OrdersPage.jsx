import { useCallback, useEffect, useMemo, useState } from "react";  
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { formatEnglishDate, formatNepaliDate, formatNumber, formatTime } from "../utils/format";
import { hasRole } from "../utils/roles";
import Select from "react-select";
import { Search } from "lucide-react";

const initialForm = {
  customer_name: "",
  customer_phone: "",
  customer_address: "",
  pan_number: "",
  transport_name: "",
  notes: "",
  items: [{ finished_good_id: "", qty_ordered: 1 }],
};

const statusTone = {
  PENDING: "warning",
  CONFIRMED: "info",
  PACKED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const PRINTABLE_DELIVERY_STATUSES = ["CONFIRMED", "PACKED", "DELIVERED"];
const ORDER_CORRECTION_CO_ADMINS = new Set([
  "suyogya shrestha",
  "suyogya shresth",
  "suvarna shrestha",
  "hirdaya shrestha",
]);

const canUseOrderCorrection = (user = {}) =>
  String(user.role || "").toUpperCase() === "CO_ADMIN" &&
  ORDER_CORRECTION_CO_ADMINS.has(
    String(user.name || "").trim().replace(/\s+/g, " ").toLowerCase()
  );

export default function OrdersPage() {
  const [orderSearch, setOrderSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManageOrders = hasRole(user?.role, ["ADMIN", "CO_ADMIN"]);
  const canCorrectOrders = canUseOrderCorrection(user);
  const [orders, setOrders] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [correctionOrder, setCorrectionOrder] = useState(null);
  const [correctionItems, setCorrectionItems] = useState([]);
  const [correctionReason, setCorrectionReason] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);

  // ── single load function — fetches orders, availability, and warehouse stock ──
  const load = useCallback(async () => {
    const [ordersResult, availabilityResult, warehouseStockResult] = await Promise.all([
      api.getOrders(token, { limit: 200 }),
      api.getAvailability(token, { includeHidden: canManageOrders }),
      api.getWarehouseStock(token),
    ]);
    setOrders(ordersResult.data || []);
    setAvailability(availabilityResult.data || []);
    setWarehouseStock(warehouseStockResult.data || []);
  }, [canManageOrders, token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "orders");

  const availabilityById = useMemo(
    () => new Map(availability.map((item) => [String(item.id), item])),
    [availability]
  );

  const warehouseStockByProductId = useMemo(() => {
    const grouped = new Map();

    warehouseStock.forEach((item) => {
      const key = String(item.finished_good_id);
      const rows = grouped.get(key) || [];
      rows.push(item);
      grouped.set(key, rows);
    });

    return grouped;
  }, [warehouseStock]);

  const totals = availability.reduce(
    (acc, item) => {
      acc.physical += Number(item.physical_stock || 0);
      acc.reserved += Number(item.reserved_qty || 0);
      acc.available += Number(item.available_qty || 0);
      return acc;
    },
    { physical: 0, reserved: 0, available: 0 }
  );

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        customer_address: form.customer_address.trim(),
        pan_number: form.pan_number.trim(),
        transport_name: form.transport_name.trim(),
        notes: form.notes.trim(),
        items: form.items.map((item) => ({
          finished_good_id: Number(item.finished_good_id),
          qty_ordered: Number(item.qty_ordered),
        })),
      };
      await api.createOrder(payload, token);
      setForm(initialForm);
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order reserved", message: "Available stock was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Order failed", message: error.message });
    }
  };

  const changeStatus = async (orderId, status, cancellationReason = "") => {
    try {
      await api.updateOrderStatus(
        orderId,
        {
          status,
          ...(status === "CANCELLED" ? { cancellation_reason: cancellationReason } : {}),
        },
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order updated", message: `Order marked ${status.toLowerCase()}.` });
    } catch (error) {
      showToast({ tone: "error", title: "Order update failed", message: error.message });
    }
  };

  const assignDeliveryNote = async (order) => {
    try {
      const result = await api.assignOrderDeliveryNote(order.id, token);
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Delivery note assigned",
        message: result.message || `A delivery-note number was assigned to Order #${order.id}.`,
      });
    } catch (error) {
      showToast({ tone: "error", title: "Could not assign DN", message: error.message });
    }
  };

  const reopenPacking = async (order) => {
    const reason = window.prompt(
      `Why are you reopening packing for Order #${order.id}?\n\nThe existing delivery note number will remain unchanged.`
    );
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why this packed order needs to be corrected.",
      });
      return;
    }

    try {
      const result = await api.reopenOrderPacking(order.id, trimmedReason, token);
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Packing reopened",
        message: result.message || `${order.delivery_note_number || "Delivery note"} was preserved. You can now correct CTN.`,
      });
    } catch (error) {
      showToast({ tone: "error", title: "Could not reopen packing", message: error.message });
    }
  };

  const openCorrection = (order) => {
    setCorrectionOrder(order);
    setCorrectionReason("");
    setCorrectionItems((order.items || []).map((item) => ({
      finished_good_id: String(item.finished_good_id),
      carton_qty: Number(item.inner_boxes_per_outer_box) > 0
        ? Number(item.qty_ordered || 0) / Number(item.inner_boxes_per_outer_box)
        : "",
    })));
  };

  const saveCorrection = async (event) => {
    event.preventDefault();
    if (!correctionOrder) return;
    setSavingCorrection(true);
    try {
      await api.correctOrderItems(correctionOrder.id, {
        reason: correctionReason.trim(),
        items: correctionItems.map((item) => ({
          finished_good_id: Number(item.finished_good_id),
          carton_qty: Number(item.carton_qty),
        })),
      }, token);
      setCorrectionOrder(null);
      setCorrectionItems([]);
      setCorrectionReason("");
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order corrected", message: "Reserved stock was recalculated automatically." });
    } catch (error) {
      showToast({ tone: "error", title: "Correction failed", message: error.message });
    } finally {
      setSavingCorrection(false);
    }
  };

  const renderOrderItems = (order) => (
    <div className="space-y-1">
      {order.items.map((item) => (
        <p key={item.id}>
          {item.product_name} - {formatNumber(item.qty_ordered)} {item.unit}
        </p>
      ))}
    </div>
  );

  const filteredOrders = orders.filter((row) => {
    const term = orderSearch.toLowerCase();
    const matchesSearch =
      row.id?.toString().includes(term) ||
      row.customer_name?.toLowerCase().includes(term) ||
      row.status?.toLowerCase().includes(term) ||
      row.created_by_name?.toLowerCase().includes(term);
    const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredAvailability = useMemo(() => {
    return availability.filter((item) => {
      const query = stockSearch.toLowerCase();
      return (
        item.name?.toLowerCase().includes(query) ||
        item.article_code?.toLowerCase().includes(query) ||
        item.color?.toLowerCase().includes(query)
      );
    });
  }, [availability, stockSearch]);

  const deliveryNoteNumbersByOrderId = useMemo(() => {
  return new Map(
    orders
      .filter((order) => order.delivery_note_number)
      .map((order) => [Number(order.id), order.delivery_note_number])
  );
}, [orders]);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formatPrintNumber = (value) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const previewWarehouseAllocation = (warehouses = [], requestedQty = 0) => {
    let remaining = Number(requestedQty || 0);
    const allocations = [];

    const sortedWarehouses = [...warehouses]
      .filter((warehouse) => Number(warehouse.quantity || 0) > 0)
      .sort((a, b) => {
        const aDate = new Date(a.updated_at || 0).getTime();
        const bDate = new Date(b.updated_at || 0).getTime();
        if (aDate !== bDate) return aDate - bDate;
        return Number(a.id || 0) - Number(b.id || 0);
      });

    for (const warehouse of sortedWarehouses) {
      if (remaining <= 0) break;

      const available = Number(warehouse.quantity || 0);
      const quantity = Math.min(available, remaining);

      allocations.push({
        warehouse_name: warehouse.warehouse_name,
        quantity,
      });

      remaining -= quantity;
    }

    return allocations;
  };

  const printDeliveryNote = (order = "") => {
    const now = new Date();
    const englishDate = formatEnglishDate(now, { includeTime: false });
    const nepaliDate = formatNepaliDate(now);
    const currentTime = now.toLocaleTimeString();

    const deliveryNoteNumber =
  order.delivery_note_number ||
  deliveryNoteNumbersByOrderId.get(Number(order.id)) ||
  "-";

    const printableItems = (order.items || []).map((item) => {
      const product = availabilityById.get(String(item.finished_good_id));
      const pairs = Number(item.qty_ordered || 0);
      const pairsPerCarton = Number(
        item.inner_boxes_per_outer_box || product?.inner_boxes_per_outer_box || 0
      );
      const cartons = pairsPerCarton > 0 ? pairs / pairsPerCarton : 0;

      const orderWarehouses = item.warehouse_allocations || [];
      const productWarehouses = warehouseStockByProductId.get(String(item.finished_good_id)) || [];
      const warehouseAllocations = orderWarehouses.length
        ? orderWarehouses
        : previewWarehouseAllocation(productWarehouses, pairs);
      const warehouseName =
        warehouseAllocations
          .filter((warehouse) => Number(warehouse.quantity || 0) > 0)
          .map((warehouse) => `${warehouse.warehouse_name} (${formatPrintNumber(warehouse.quantity)})`)
          .join(", ") || "-";

      return {
        ...item,
        pairs,
        pairsPerCarton,
        cartons,
        finished_good_id: item.finished_good_id || product?.id || "-",
        product_id: item.product_id || item.article_code || product?.article_code || "-",
        product_size: item.product_size || product?.size || "-",
        warehouse_name: warehouseName,
      };
    });

    const totalPairs = printableItems.reduce((sum, item) => sum + item.pairs, 0);
    const totalCartons = printableItems.reduce((sum, item) => sum + item.cartons, 0);

    const itemsHtml = printableItems
      .map(
        (item, index) => `
          <tr>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${index + 1}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${escapeHtml(item.finished_good_id)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${escapeHtml(item.product_id)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${escapeHtml(item.product_size)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${escapeHtml(item.product_name)}
            </td>
            <td style="border:1px solid black;padding:4px;">
              ${escapeHtml(item.warehouse_name)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${item.pairsPerCarton > 0 ? formatPrintNumber(item.cartons) : "0"}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${formatPrintNumber(item.pairs)} ${escapeHtml(item.unit || "pairs")}
            </td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      showToast({
        tone: "error",
        title: "Print blocked",
        message: "Allow popups for this site and try printing again.",
      });
      return;
    }

    api.logOrderPrint(order.id, token).catch(() => {});

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Delivery Note</title>
          <style>
            body {
              font-family: Arial;
              padding: 24px;
              color: black;
            }

            @page {
              size: A4;
              margin: 16mm;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
              }
            }

            @media print {
              body {
                padding: 0 0 22mm;
              }

              thead {
                display: table-header-group;
              }

              tr,
              .totals,
              .signature {
                break-inside: avoid;
                page-break-inside: avoid;
              }

              .page-number {
                display: block;
                position: fixed;
                right: 0;
                bottom: 0;
                font-size: 11px;
              }

              .page-number::after {
                content: "Page " counter(page) " of " counter(pages);
              }
            }

            .page-number {
              display: none;
            }

            .header {
              text-align: center;
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 10px;
            }

            .top-grid {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10px;
            }

            .top-grid td {
              border: 1px solid black;
              padding: 10px;
              vertical-align: top;
            }

            table.items {
              width: 100%;
              border-collapse: collapse;
            }

            table.items th {
              border: 1px solid black;
              padding: 6px;
              background: #f3f3f3;
              text-align: left;
            }

            .totals {
              width: 100%;
              border-collapse: collapse;
              margin-top: 4px;
            }

            .totals td {
              border: 1px solid black;
              padding: 8px;
              font-weight: bold;
            }

            .totals .label {
              text-align: right;
            }

            .totals .value {
              text-align: center;
            }

            .signature {
              margin-top: 70px;
              display: flex;
              justify-content: space-between;
            }

            .signature div {
              text-align: center;
              width: 200px;
            }
          </style>
        </head>

        <body>
          <div class="header">DELIVERY NOTE</div>

          <table class="top-grid">
            <tr>
              <td width="60%">
                <strong>Dated</strong><br/>
                Nepali Date: ${nepaliDate}<br/>
                English Date: ${englishDate}<br/>
                Time: ${currentTime}<br/>
                <strong>Transport Name:</strong> ${escapeHtml(order.transport_name || "-")}<br/>
                <strong>Gate Pass No:</strong><br/>
                <strong>Bill No:</strong><br/>
              </td>
              <td width="40%">
                <strong>Delivery Note No:</strong> ${deliveryNoteNumber}<br/>
                <strong>Created By:</strong> ${escapeHtml(order.created_by_name || "-")}<br/>
                <strong>Customer Name:</strong> ${escapeHtml(order.customer_name)}<br/>
                <strong>Phone Number:</strong> ${escapeHtml(order.customer_phone || "-")}<br/>
                <strong>Address:</strong> ${escapeHtml(order.customer_address || "-")}<br/>
                <strong>PAN Number:</strong> ${escapeHtml(order.pan_number || "-")}
              </td>
            </tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th width="3%">SN</th>
                <th width="7%">F.G. ID</th>
                <th width="11%">Product ID</th>
                <th width="8%">Size</th>
                <th width="27%">Description of Goods</th>
                <th width="15%">Warehouse</th>
                <th width="9%">Carton</th>
                <th width="10%">Pairs</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <table class="totals">
            <tr>
              <td class="label" width="81%">Total</td>
              <td class="value" width="9%">${formatPrintNumber(totalCartons)}</td>
              <td class="value" width="10%">${formatPrintNumber(totalPairs)} pairs</td>
            </tr>
          </table>

          <div class="signature">
            <div>
              ___________________<br/>
              Delivered By
            </div>
            <div>
              ___________________<br/>
              Received By
            </div>
            <div>
              ___________________<br/>
              Printed By </br> 
              (${escapeHtml(user?.name || "User")})
            </div>
          </div>

          <div class="page-number"></div>
        </body>
      </html>
    `);

    printWindow.document.close();

    let didPrint = false;
    const printNote = () => {
      if (didPrint) return;
      if (printWindow.closed) return;
      didPrint = true;
      printWindow.focus();
      printWindow.print();
    };

    printWindow.onafterprint = () => {
      printWindow.close();
    };

    printWindow.addEventListener("load", () => {
      setTimeout(printNote, 100);
    }, { once: true });

    setTimeout(printNote, 700);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Physical Stock" value={formatNumber(totals.physical)} icon="finishedGoods" />
        <StatCard label="Reserved Stock" value={formatNumber(totals.reserved)} tone="alert" icon="orders" />
        <StatCard label="Available Stock" value={formatNumber(totals.available)} tone="calm" icon="check" />
      </div>

      <SectionCard
        title="Create order"
        subtitle="Creating an order reserves available finished goods but does not reduce physical stock yet."
        icon="orders"
      >
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Customer name">
              <TextInput
                value={form.customer_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customer_name: event.target.value }))
                }
                required
              />
            </Field>

            <Field label="Customer phone">
              <TextInput
                type="tel"
                maxLength={10}
                pattern="[0-9]{10}"
                value={form.customer_phone}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((current) => ({ ...current, customer_phone: value }));
                }}
                required
              />
            </Field>

            <Field label="Customer Address">
              <TextInput
                value={form.customer_address}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^a-zA-Z\s]/g, "");
                  setForm((current) => ({ ...current, customer_address: value }));
                }}
                required
              />
            </Field>

            <Field label="PAN Number">
              <TextInput
                type="text"
                maxLength={9}
                pattern="[0-9]{9}"
                value={form.pan_number}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 9);
                  setForm((current) => ({ ...current, pan_number: value }));
                }}
                required
              />
            </Field>

            <Field label="Transport Name">
              <TextInput
                value={form.transport_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, transport_name: event.target.value }))
                }
                required
              />
            </Field>

            <Field label="Notes">
              <TextInput
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="space-y-3">
            {form.items.map((item, index) => {
              const selected = availabilityById.get(String(item.finished_good_id));
              return (
                <div
                  key={index}
                  className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <Select
                    options={availability.map((product) => ({
                      value: String(product.id),
                      label: `${product.name} (${product.article_code}) - available ${formatNumber(product.available_qty)} ${product.unit}`,
                    }))}
                    value={
                      availability
                        .map((product) => ({
                          value: String(product.id),
                          label: `${product.name} (${product.article_code}) - available ${formatNumber(product.available_qty)} ${product.unit}`,
                        }))
                        .find((opt) => opt.value === String(item.finished_good_id)) || null
                    }
                    onChange={(selected) =>
                      updateItem(index, "finished_good_id", selected?.value || "")
                    }
                    placeholder="Search finished good..."
                    isClearable
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={{
                      control: (base) => ({
                        ...base,
                        minHeight: "44px",
                        borderRadius: "12px",
                        borderColor: "#d1d5db",
                        boxShadow: "none",
                        fontSize: "14px",
                      }),
                      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    }}
                  />
                  <TextInput
                    type="number"
                    min="1"
                    step="1"
                    value={item.qty_ordered}
                    onChange={(event) => updateItem(index, "qty_ordered", event.target.value)}
                    required
                  />
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600">
                    Available: {selected ? `${formatNumber(selected.available_qty)} ${selected.unit}` : "-"}
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={form.items.length === 1}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              icon="plus"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  items: [...current.items, { finished_good_id: "", qty_ordered: 1 }],
                }))
              }
            >
              Add item
            </Button>
            <Button type="submit" icon="check">
              Reserve order
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Orders"
        subtitle={
          canManageOrders
            ? "Admin can move orders through confirmation, packing, delivery, or cancellation."
            : "Your reserved orders."
        }
        icon="orders"
      >
        <div className="mb-1 flex flex-col items-stretch justify-between gap-3 px-1 py-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-auto">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search orders..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none sm:w-auto"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-black bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PACKED">Packed</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <DataTable
          columns={[
            { key: "id", label: "Order-ID", width: "4%", align: "center" },
            {
              key: "customer_details",
              label: "Customer Details",
              width: "14%",
              render: (row) => (
                <div className="min-w-0">
                  <strong>{row.customer_name || "-"}</strong>
                  <br />
                  <small style={{ color: "#666" }}>Phone: {row.customer_phone || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>Address: {row.customer_address || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>PAN: {row.pan_number || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>Transport: {row.transport_name || "-"}</small>
                </div>
              ),
            },
            { key: "items", label: "Items", width: "20%", render: renderOrderItems },
            {
              key: "status",
              label: "Status",
              width: "7%",
              align: "center",
              render: (row) => (
                <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>
              ),
            },
            {
              key: "cancellation_reason",
              label: "Cancel Reason",
              width: "10%",
              render: (row) =>
                row.status === "CANCELLED" ? row.cancellation_reason || "-" : "-",
            },
            {
              key: "created_by_name",
              label: "Created By",
              width: "8%",
              align: "center",
            },
            {
              key: "created_at",
              label: "Created",
              width: "9%",
              align: "center",
              render: (row) => {
                return (
                  <div className="flex flex-col">
                    <strong>{formatEnglishDate(row.created_at, { includeTime: false })}</strong>
                    <span className="text-xs text-slate-500">BS {formatNepaliDate(row.created_at)}</span>
                    <span className="text-xs text-slate-500">{formatTime(row.created_at)}</span>
                  </div>
                );
              },
            },
            canManageOrders
              ? {
                  key: "actions",
                  label: "Actions",
                  width: "9%",
                  align: "center",
                  render: (row) => {
                    const canPrint = PRINTABLE_DELIVERY_STATUSES.includes(row.status);
                    const canChangeStatus = !["DELIVERED", "CANCELLED"].includes(row.status);

                    if (!canPrint && !canChangeStatus) return null;

                    return (
                      <div className="grid gap-1">
                        {canPrint ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm"
                            onClick={() => printDeliveryNote(row)}
                          >
                            🖨️ DN
                          </Button>
                        ) : null}

                        {canChangeStatus ? (
                          <>
                            {row.status === "PENDING" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                                onClick={() => changeStatus(row.id, "CONFIRMED")}
                              >
                                Confirm
                              </Button>
                            ) : null}
                            {["PENDING", "CONFIRMED"].includes(row.status) ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                                onClick={() => changeStatus(row.id, "PACKED")}
                              >
                                Pack
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              icon="check"
                              className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Are you sure you want to mark Order #${row.id} as delivered?\n\nCustomer: ${row.customer_name}\nThis action cannot be undone.`
                                );
                                if (!confirmed) return;
                                changeStatus(row.id, "DELIVERED");
                              }}
                            >
                              Deliver
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                              onClick={() => {
                                const reason = window.prompt(
                                  "Why is this order being cancelled?"
                                );
                                if (reason === null) return;
                                const trimmedReason = reason.trim();
                                if (!trimmedReason) {
                                  showToast({
                                    tone: "error",
                                    title: "Cancel reason required",
                                    message: "Please enter why the order is being cancelled.",
                                  });
                                  return;
                                }
                                changeStatus(row.id, "CANCELLED", trimmedReason);
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : null}
                      </div>
                    );
                  },
                }
              : { key: "empty", label: "", width: "12%" },
            {
              key: "confirmed_by_name",
              label: "Confirmed By / DN",
              width: "11%",
              align: "center",
              render: (row) => {
                const deliveryNoteNumber =
  row.delivery_note_number ||
  deliveryNoteNumbersByOrderId.get(Number(row.id)) ||
  "-";
                return (
                  <div className="space-y-1">
                    {row.confirmed_by_name || "-"}
                    <br />
                    <small style={{ color: "#666" }}>{deliveryNoteNumber}</small>
                    {!row.delivery_note_number && ["CONFIRMED", "PACKED", "DELIVERED"].includes(row.status) ? (
                      <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => assignDeliveryNote(row)}>
                        Assign DN
                      </Button>
                    ) : null}
                  </div>
                );
              },
            },
            canManageOrders
              ? {
                  key: "order_edits",
                  label: "Order Edits",
                  width: "8%",
                  align: "center",
                  render: (row) => {
                    if (!canCorrectOrders) return <span className="text-slate-400">-</span>;
                    if (row.status === "PACKED") {
                      return (
                        <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => reopenPacking(row)}>
                          Reopen packing
                        </Button>
                      );
                    }
                    if (["PENDING", "CONFIRMED"].includes(row.status)) {
                      return (
                        <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => openCorrection(row)}>
                          Correct CTN
                        </Button>
                      );
                    }
                    return <span className="text-slate-400">Locked</span>;
                  },
                }
              : { key: "order_edits_empty", label: "", width: "8%" },
          ]}
          rows={filteredOrders}
          fitColumns
          wrapCells
          responsiveScroll
        />
      </SectionCard>

      {correctionOrder ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={() => !savingCorrection && setCorrectionOrder(null)}>
          <form onSubmit={saveCorrection} onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Correct Order #{correctionOrder.id}</h2>
              <p className="text-sm text-slate-500">Only whole cartons are allowed. Reserved pairs update automatically when you save.</p>
            </div>

            <div className="space-y-3">
              {correctionItems.map((item, index) => {
                const selected = availabilityById.get(String(item.finished_good_id));
                const pairsPerCarton = Number(selected?.inner_boxes_per_outer_box || 0);
                const pairs = Number(item.carton_qty || 0) * pairsPerCarton;
                return (
                  <div key={`${item.finished_good_id}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_0.7fr_1fr_auto]">
                    <Select
                      options={availability.filter((product) => Number(product.inner_boxes_per_outer_box) > 0).map((product) => ({ value: String(product.id), label: `${product.article_code || product.name} · ${product.color || "No color"}` }))}
                      value={selected ? { value: String(selected.id), label: `${selected.article_code || selected.name} · ${selected.color || "No color"}` } : null}
                      onChange={(option) => setCorrectionItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, finished_good_id: option?.value || "" } : row))}
                      placeholder="Select product"
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }), control: (base) => ({ ...base, minHeight: "42px", borderRadius: "12px" }) }}
                    />
                    <Field label="CTN">
                      <TextInput type="number" min="1" step="1" required value={item.carton_qty} onChange={(event) => setCorrectionItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, carton_qty: event.target.value } : row))} />
                    </Field>
                    <div className="flex flex-col justify-end rounded-xl bg-white px-3 py-2 text-sm"><span className="text-xs text-slate-400">Reserved pairs</span><strong>{pairsPerCarton > 0 ? formatNumber(pairs) : "Set CTN config"}</strong></div>
                    <div className="flex items-end"><Button type="button" variant="danger" size="sm" disabled={correctionItems.length === 1} onClick={() => setCorrectionItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button></div>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="secondary" icon="plus" onClick={() => setCorrectionItems((current) => [...current, { finished_good_id: "", carton_qty: 1 }])}>Add product</Button>

            <Field label="Correction reason">
              <TextInput required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain why this order is being changed" />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={savingCorrection} onClick={() => setCorrectionOrder(null)}>Cancel</Button>
              <Button type="submit" disabled={savingCorrection || !correctionItems.length}>{savingCorrection ? "Saving..." : "Save correction"}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
