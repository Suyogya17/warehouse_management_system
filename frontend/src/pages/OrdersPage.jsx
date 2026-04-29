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

const initialForm = {
  customer_name: "",
  customer_phone: "",
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
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user.role === "ADMIN";
  const [orders, setOrders] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState(initialForm);

  const load = useCallback(async () => {
    const [ordersResult, availabilityResult] = await Promise.all([
      api.getOrders(token),
      api.getOrderAvailability(token),
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
      await api.createOrder(
        {
          ...form,
          items: form.items.map((item) => ({
            finished_good_id: Number(item.finished_good_id),
            qty_ordered: Number(item.qty_ordered),
          })),
        },
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales reservation"
        title="Orders"
        description="Reserve finished goods for customer orders, then release or deduct stock only when the order is cancelled or delivered."
        icon="orders"
      />

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
                value={form.customer_phone}
                onChange={(event) => setForm((current) => ({ ...current, customer_phone: event.target.value }))}
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
                  <SelectInput
                    value={item.finished_good_id}
                    onChange={(event) => updateItem(index, "finished_good_id", event.target.value)}
                    required
                  >
                    <option value="">Select finished good</option>
                    {availability.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.article_code}) - available {formatNumber(product.available_qty)} {product.unit}
                      </option>
                    ))}
                  </SelectInput>
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

      <SectionCard title="Stock availability" subtitle="Physical stock minus active reservations gives available stock." icon="stock">
        <DataTable
          columns={[
            { key: "name", label: "Product" },
            { key: "article_code", label: "Article" },
            { key: "color", label: "Color" },
            { key: "physical_stock", label: "Physical", render: (row) => `${formatNumber(row.physical_stock)} ${row.unit}` },
            { key: "reserved_qty", label: "Reserved", render: (row) => `${formatNumber(row.reserved_qty)} ${row.unit}` },
            { key: "available_qty", label: "Available", render: (row) => `${formatNumber(row.available_qty)} ${row.unit}` },
          ]}
          rows={availability}
        />
      </SectionCard>

      <SectionCard title="Orders" subtitle={isAdmin ? "Admin can move orders through confirmation, packing, delivery, or cancellation." : "Your reserved orders."} icon="orders">
        <DataTable
          columns={[
            { key: "id", label: "Order" },
            { key: "customer_name", label: "Customer" },
            { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge> },
            { key: "items", label: "Items", render: renderOrderItems },
            { key: "created_by_name", label: "Created By" },
            { key: "created_at", label: "Created", type: "date" },
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
          rows={orders}
        />
      </SectionCard>
    </div>
  );
}
