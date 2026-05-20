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
import { formatNumber } from "../utils/format";
import { hasRole } from "../utils/roles";
import Select from "react-select";
import { Search } from "lucide-react";
import NepaliDate from "nepali-date-converter";

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

export default function OrdersPage() {
  const [orderSearch, setOrderSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManageOrders = hasRole(user?.role, ["ADMIN", "CO_ADMIN"]);
  const [orders, setOrders] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState(initialForm);
const [statusFilter, setStatusFilter] = useState("ALL");
  const load = useCallback(async () => {
    const [ordersResult, availabilityResult] = await Promise.all([
      api.getOrders(token),
      api.getAvailability(token),
    ]);
    setOrders(ordersResult.data || []);
    setAvailability(availabilityResult.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "orders");

  const availabilityById = useMemo(
    () => new Map(availability.map((item) => [String(item.id), item])),
    [availability]
  );

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

      await api.createOrder(
        payload,
        token
      );
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
          ...(status === "CANCELLED"
            ? { cancellation_reason: cancellationReason }
            : {}),
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

  const matchesStatus =
    statusFilter === "ALL" || row.status === statusFilter;

  return matchesSearch && matchesStatus;
});

//   return (
//     row.id?.toString().includes(term) ||
//     row.customer_name?.toLowerCase().includes(term) ||
//     row.status?.toLowerCase().includes(term) ||
//     row.created_by_name?.toLowerCase().includes(term)
//   );
// });

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
  const printableOrders = orders
    .filter((order) => PRINTABLE_DELIVERY_STATUSES.includes(order.status))
    .sort((a, b) => {
      const aDate = new Date(a.confirmed_at || a.created_at).getTime();
      const bDate = new Date(b.confirmed_at || b.created_at).getTime();

      if (aDate !== bDate) return aDate - bDate;
      return Number(a.id) - Number(b.id);
    });

  return new Map(
    printableOrders.map((order, index) => {
      const orderId = Number(order.id);
      // For order ID 25 and above, use new system: DN-1965, DN-1966, etc.
      if (orderId >= 25) {
        return [orderId, `DN-${1940 + orderId}`];
      }
      // For orders before ID 25, keep old sequential system
      return [orderId, `DN-${1001 + index}`];
    })
  );
}, [orders]);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const printDeliveryNote = (order = "") => {
  const now = new Date();

  // English Date
  const englishDate = now.toLocaleDateString("en-GB");

  // Nepali Date
  const nepDate = new NepaliDate(now);
  const nepaliDate = nepDate.format("YYYY.MM.DD");

  // Current Time
  const currentTime = now.toLocaleTimeString();

  // Auto Delivery Note Number
const deliveryNoteNumber =
  deliveryNoteNumbersByOrderId.get(Number(order.id)) ||
  (Number(order.id) >= 25 ? `DN-${1940 + Number(order.id)}` : `DN-${1000 + Number(order.id)}`);

  const printableItems = (order.items || []).map((item) => {
    const product = availabilityById.get(String(item.finished_good_id));
    const pairs = Number(item.qty_ordered || 0);
    const pairsPerCarton = Number(
      item.inner_boxes_per_outer_box ||
        product?.inner_boxes_per_outer_box ||
        0
    );
    const cartons = pairsPerCarton > 0 ? pairs / pairsPerCarton : 0;

    return {
      ...item,
      pairs,
      pairsPerCarton,
      cartons,

       // ADD THIS
    product_size:
      item.product_size ||
      product?.size ||
      "-",
    };
  });

  const totalPairs = printableItems.reduce((sum, item) => sum + item.pairs, 0);
  const totalCartons = printableItems.reduce(
    (sum, item) => sum + item.cartons,
    0
  );

  const formatPrintNumber = (value) =>
    Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });

  const itemsHtml = printableItems
    .map(
      (item, index) => `
        <tr>
          <td style="border:1px solid black;padding:6px;text-align:center;">
            ${index + 1}
          </td>

           <td style="border:1px solid black;padding:6px;">
            ${escapeHtml(item.product_size)}
          </td>

          <td style="border:1px solid black;padding:6px;">
            ${escapeHtml(item.product_name)}
          </td>

          <td style="border:1px solid black;padding:6px;text-align:center;">
            ${
              item.pairsPerCarton > 0
                ? formatPrintNumber(item.cartons)
                : "0"
            }
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
            padding: 1px;
            background: #f3f3f3;
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

        <div class="header">
          DELIVERY NOTE
        </div>

        <table class="top-grid">
          <tr>
            <td width="60%">
              <strong>Dated</strong><br/>

              Nepali Date: ${nepaliDate}<br/>
              English Date: ${englishDate}<br/>
              Time: ${currentTime}
              <br/>
              <strong>Transport Name:</strong>
              ${escapeHtml(order.transport_name || "-")}
              <br/>

              <strong>Gate Pass No:</strong>
              <br/>

            </td>

            <td width="40%">
              <strong>Delivery Note No:</strong> ${deliveryNoteNumber}
              <br/>

              <strong>Created By:</strong>
              ${escapeHtml(order.created_by_name || "-")}

              <br/>

              <strong>Customer Name:</strong>
              ${escapeHtml(order.customer_name)}
              <br/>

              <strong>Address:</strong>
              ${escapeHtml(order.customer_address || "-")}
              <br/>

              <strong>PAN Number:</strong>
              ${escapeHtml(order.pan_number || "-")}
            </td>
          </tr>
        </table>

        <table class="items">
          <thead>
            <tr>
              <th width="2%">SN</th>
              <th width="8%">Size</th>
              <th>Description of Goods</th>
              <th width="10%">Carton</th>
              <th width="10%">Pairs</th>
            </tr>
          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td class="label" width="64%">Total</td>
            <td class="value" width="16%">${formatPrintNumber(totalCartons)}</td>
            <td class="value" width="20%">${formatPrintNumber(totalPairs)} pairs</td>
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
            Printed By (${escapeHtml(user?.name || "User")})
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
    <div className="space-y-6">
      {/* <PageHeader
        eyebrow="Sales reservation"
        title="Orders"
        description="Reserve finished goods for customer orders, then release or deduct stock only when the order is cancelled or delivered."
        icon="orders"
      /> */}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Physical Stock" value={formatNumber(totals.physical)} icon="finishedGoods" />
        <StatCard label="Reserved Stock" value={formatNumber(totals.reserved)} tone="alert" icon="orders" />
        <StatCard label="Available Stock" value={formatNumber(totals.available)} tone="calm" icon="check" />
      </div>

      <SectionCard title="Create order" subtitle="Creating an order reserves available finished goods but does not reduce physical stock yet." icon="orders">
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Customer name">
              <TextInput
                value={form.customer_name}
                onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))}
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

      setForm((current) => ({
        ...current,
        customer_phone: value,
      }));
    }}
    required
  />
</Field>

<Field label="Customer Address">
  <TextInput
    value={form.customer_address}
    onChange={(event) => {
      const value = event.target.value.replace(/[^a-zA-Z\s]/g, "");

      setForm((current) => ({
        ...current,
        customer_address: value,
      }));
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

      setForm((current) => ({
        ...current,
        pan_number: value,
      }));
    }}
    required
  />
</Field>
            <Field label="Transport Name">
              <TextInput
                value={form.transport_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    transport_name: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>
          </div>

          <div className="space-y-3">
            {form.items.map((item, index) => {
              const selected = availabilityById.get(String(item.finished_good_id));
              return (
                <div key={index} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
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
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
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



      <SectionCard title="Orders" subtitle={canManageOrders ? "Admin can move orders through confirmation, packing, delivery, or cancellation." : "Your reserved orders."} icon="orders">


        <div className="flex justify-between px-2 py-3 mb-1">


    {/* Search Box */}
  <div className="relative ">
    <Search
      size={16}
      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
    />

    <input
      type="text"
      placeholder="Search orders..."
      value={orderSearch}
      onChange={(e) => setOrderSearch(e.target.value)}
      className="rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
    />
  </div>

  {/* Status Filter */}
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
            { key: "id", label: "Order-ID"},
            // {key: "S.No", label: "S.No", render: (_, index) => index + 1},
           {
  key: "customer_details",
  label: "Customer Details",
  render: (row) => {
    return (
      <div>
        <strong>{row.customer_name || "-"}</strong>
        <br />
        <small style={{ color: '#666' }}>
          Phone: {row.customer_phone || "-"}
        </small>
        <br />
        <small style={{ color: '#666' }}>
          Address: {row.customer_address || "-"}
        </small>
        <br />
        <small style={{ color: '#666' }}>
          PAN: {row.pan_number || "-"}
        </small>
        <br />
        <small style={{ color: '#666' }}>
          Transport: {row.transport_name || "-"}
        </small>
      </div>
    );
  },
},
             { key: "items", label: "Items", render: renderOrderItems },
            { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge> },
            {
              key: "cancellation_reason",
              label: "Cancel Reason",
              render: (row) =>
                row.status === "CANCELLED" ? row.cancellation_reason || "-" : "-",
            },
           
            { key: "created_by_name", label: "Created By" },
            {
              key: "created_at",
              label: "Created",
              render: (row) => {
  const createdDate = new Date(row.created_at);

  return (
    <div className="flex flex-col">
      <strong>
        {createdDate.toLocaleDateString("en-GB")}
      </strong>

      <span className="text-xs text-slate-500">
        {createdDate.toLocaleTimeString()}
      </span>
    </div>
  );
}
                // new Date(row.created_at).toLocaleString(),
            },
            canManageOrders
              ? {
                  key: "actions",
                  label: "Actions",
                  render: (row) => {
                    const canPrint = PRINTABLE_DELIVERY_STATUSES.includes(row.status);
                    const canChangeStatus = !["DELIVERED", "CANCELLED"].includes(row.status);

                    if (!canPrint && !canChangeStatus) return null;

                    return (
                      <div className="flex flex-wrap gap-2">
                        {canPrint ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => printDeliveryNote(row)}
                            >
                              🖨️ DN
                            </Button>
                            {/* <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const noteNumber = window.prompt(
                                  "Enter delivery note number",
                                  deliveryNoteNumbersByOrderId.get(Number(row.id)) ||
                                    `DN-${1000 + row.id}`
                                );

                                if (noteNumber === null) return;
                                printDeliveryNote(row, noteNumber);
                              }}
                            >
                              Manual Note No
                            </Button> */}
                          </>
                        ) : null}

                        {canChangeStatus ? (
                          <>
                        {row.status === "PENDING" ? (

                          <Button size="sm" variant="secondary" onClick={() => changeStatus(row.id, "CONFIRMED")}>
                            Confirm
                          </Button>
                        ) : null}
                        {["PENDING", "CONFIRMED"].includes(row.status) ? (
                          <Button size="sm" variant="secondary" onClick={() => changeStatus(row.id, "PACKED")}>
                            Pack
                          </Button>
                        ) : null}
                        <Button size="sm" icon="check" onClick={() => changeStatus(row.id, "DELIVERED")}>
                          Deliver
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const reason = window.prompt("Why is this order being cancelled?");

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
              : { key: "empty", label: "" },
           {
  key: "confirmed_by_name",
  label: "Confirmed By / DN",
  render: (row) => {
    const deliveryNoteNumber = 
      deliveryNoteNumbersByOrderId.get(Number(row.id)) ||
      `DN-${1940 + row.id}`;  // ← CHANGED FROM 1000 TO 1940
    
    return (
      <>
        {row.confirmed_by_name || "-"}
        <br />
        <small style={{ color: '#666' }}>{deliveryNoteNumber}</small>
      </>
    );
  },
},
          // {key:"Delivery No",
          //   label: "Delivery No",
          //   render: (row)=>row.deliveryNoteNumber || "-",
          // },

          ]}
          rows={filteredOrders}
        />
      </SectionCard>

      
    </div>
  );
}
