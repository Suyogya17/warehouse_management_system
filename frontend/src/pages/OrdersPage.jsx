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

export default function OrdersPage() {
  const [orderSearch, setOrderSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user.role === "ADMIN";
  const [orders, setOrders] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState(initialForm);

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

  const changeStatus = async (orderId, status) => {
    try {
      await api.updateOrderStatus(orderId, { status }, token);
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

  return (
    row.id?.toString().includes(term) ||
    row.customer_name?.toLowerCase().includes(term) ||
    row.status?.toLowerCase().includes(term) ||
    row.created_by_name?.toLowerCase().includes(term)
  );
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



      <SectionCard title="Orders" subtitle={isAdmin ? "Admin can move orders through confirmation, packing, delivery, or cancellation." : "Your reserved orders."} icon="orders">
        <div className="relative mb-4">
  <Search
    size={16}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
  />

  <input
    type="text"
    placeholder="Search orders by Customer, Status, or Items..."
    value={orderSearch}
onChange={(e) => setOrderSearch(e.target.value)}
    className="rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none"

    
  />
</div>
        <DataTable
          columns={[
            { key: "id", label: "Order" },
            { key: "customer_name", label: "Customer" },
            { key: "customer_phone", label: "Phone" },
            { key: "customer_address", label: "Address",},
            { key: "pan_number", label: "PAN"},
            { key: "transport_name", label: "Transport" },
            { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge> },
            { key: "items", label: "Items", render: renderOrderItems },
            { key: "created_by_name", label: "Created By" },
            {
  key: "created_at",
  label: "Created",
  render: (row) =>
    new Date(row.created_at).toLocaleString(),
},
            isAdmin
              ? {
                  key: "actions",
                  label: "Actions",
                  render: (row) =>
                    ["DELIVERED", "CANCELLED"].includes(row.status) ? null : (
                      <div className="flex flex-wrap gap-2">
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
                        <Button size="sm" variant="danger" onClick={() => changeStatus(row.id, "CANCELLED")}>
                          Cancel
                        </Button>
                      </div>
                    ),
                }
              : { key: "empty", label: "" },
          ]}
          rows={filteredOrders}
        />
      </SectionCard>

    <SectionCard
  title="Stock availability"
  subtitle="Physical stock minus active reservations gives available stock."
  icon="stock"
>
  {/* Search */}
  <div className="mb-4 max-w-sm">
    <input
      type="text"
      placeholder="Search product, article, or color..."
      value={stockSearch}
      onChange={(e) => setStockSearch(e.target.value)}
      className="w-full rounded-xl border border-black px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
    />
  </div>

  <DataTable
    columns={[
      { key: "name", label: "Product" },
      { key: "article_code", label: "Article" },
      { key: "color", label: "Color" },
      {
        key: "physical_stock",
        label: "Physical",
        render: (row) =>
          `${formatNumber(row.physical_stock)} ${row.unit}`,
      },
      {
        key: "reserved_qty",
        label: "Reserved",
        render: (row) =>
          `${formatNumber(row.reserved_qty)} ${row.unit}`,
      },
      {
        key: "available_qty",
        label: "Available",
        render: (row) =>
          `${formatNumber(row.available_qty)} ${row.unit}`,
      },
    ]}
    rows={filteredAvailability}
  />
</SectionCard>

      
    </div>
  );
}
