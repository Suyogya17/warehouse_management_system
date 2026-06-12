import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";

import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

import {
  announceDataRefresh,
  useDataRefresh,
} from "../../hooks/useDataRefresh";

import { api } from "../../services/api";
import { formatNumber } from "../../utils/format";

const statusTone = {
  PENDING: "warning",
  CONFIRMED: "info",
  PACKED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};

export default function MemberOrdersPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);

  // SEARCH + FILTER STATES
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // USER ROLE
  const role = String(user?.role || "")
    .toUpperCase()
    .trim();

  const canManageOrders = [
    "ADMIN",
    "SUPERADMIN",
    "CO-ADMIN",
    "CO_ADMIN",
  ].includes(role);

  // ─────────────────────────────────────────────
  // LOAD ORDERS
  // ─────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const result = await api.getOrders(token, { limit: 100 });

      setOrders(result.data || result || []);
    } catch (error) {
      console.error(error);

      showToast({
        tone: "error",
        title: "Failed to load orders",
        message:
          error.message || "Could not fetch orders.",
      });
    }
  }, [token, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useDataRefresh(load, "orders");

  // ─────────────────────────────────────────────
  // FILTER ORDERS
  // ─────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();

    return orders.filter((row) => {
      const matchesSearch =
        !term ||
        row.id?.toString().includes(term) ||
        row.customer_name
          ?.toLowerCase()
          .includes(term) ||
        row.status?.toLowerCase().includes(term) ||
        row.created_by_name
          ?.toLowerCase()
          .includes(term) ||
        row.customer_phone
          ?.toLowerCase()
          .includes(term);

      const matchesStatus =
        statusFilter === "ALL" ||
        row.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, orderSearch, statusFilter]);

  // ─────────────────────────────────────────────
  // CHANGE STATUS
  // ─────────────────────────────────────────────

  const changeStatus = async (orderId, status) => {
    try {
      await api.updateOrderStatus(
        orderId,
        { status },
        token
      );

      await load();

      announceDataRefresh("orders");

      showToast({
        tone: "success",
        title: "Order updated",
        message: `Order marked ${status.toLowerCase()}.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Update failed",
        message: error.message,
      });
    }
  };

  // ─────────────────────────────────────────────
  // ORDER ITEMS
  // ─────────────────────────────────────────────

  const renderOrderItems = (order) => (
    <div className="space-y-1">
      {order.items?.map((item) => (
        <p key={item.id}>
          {item.product_name} —{" "}
          {formatNumber(
            item.qty_ordered || item.quantity || 0
          )}{" "}
          {item.unit}
        </p>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* FILTERS */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

        {/* SEARCH */}
        <div className="relative w-full md:max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search orders..."
            value={orderSearch}
            onChange={(e) =>
              setOrderSearch(e.target.value)
            }
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          />
        </div>

        {/* STATUS FILTER */}
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        >
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">
            Confirmed
          </option>
          <option value="PACKED">Packed</option>
          <option value="DELIVERED">
            Delivered
          </option>
          <option value="CANCELLED">
            Cancelled
          </option>
        </select>
      </div>

      {/* TABLE */}
      <DataTable
        rows={filteredOrders}
        columns={[
          {
            key: "serial",
            label: "S.No",
            render: (_, index) => index + 1,
          },

          {
            key: "customer_name",
            label: "Customer",
          },

          {
            key: "customer_phone",
            label: "Phone",
            render: (row) =>
              row.customer_phone || "-",
          },

          {
            key: "customer_address",
            label: "Address",
            render: (row) =>
              row.customer_address || "-",
          },

          {
            key: "pan_number",
            label: "PAN",
            render: (row) => row.pan_number || "-",
          },

          {
            key: "transport_name",
            label: "Transport",
            render: (row) =>
              row.transport_name || "-",
          },

          {
            key: "status",
            label: "Status",
            render: (row) => (
              <StatusBadge tone={statusTone[row.status]}>
                {row.status}
              </StatusBadge>
            ),
          },

          {
            key: "items",
            label: "Items",
            render: renderOrderItems,
          },

          {
            key: "created_by_name",
            label: "Created By",
            render: (row) =>
              row.created_by_name || "-",
          },

          {
            key: "confirmed_by_name",
            label: "Confirmed By",
            render: (row) =>
              row.confirmed_by_name || "-",
          },

          {
            key: "packed_by_name",
            label: "Packed By",
            render: (row) =>
              row.packed_by_name || "-",
          },

          {
            key: "delivered_by_name",
            label: "Delivered By",
            render: (row) =>
              row.delivered_by_name || "-",
          },

          {
            key: "created_at",
            label: "Created At",
            render: (row) =>
              row.created_at
                ? new Date(
                    row.created_at
                  ).toLocaleString()
                : "-",
          },

          {
            key: "confirmed_at",
            label: "Confirmed At",
            render: (row) =>
              row.confirmed_at
                ? new Date(
                    row.confirmed_at
                  ).toLocaleString()
                : "-",
          },

          {
            key: "packed_at",
            label: "Packed At",
            render: (row) =>
              row.packed_at
                ? new Date(
                    row.packed_at
                  ).toLocaleString()
                : "-",
          },

          {
            key: "delivered_at",
            label: "Delivered At",
            render: (row) =>
              row.delivered_at
                ? new Date(
                    row.delivered_at
                  ).toLocaleString()
                : "-",
          },

          ...(canManageOrders
            ? [
                {
                  key: "actions",
                  label: "Actions",

                  render: (row) =>
                    ["DELIVERED", "CANCELLED"].includes(
                      row.status
                    ) ? null : (
                      <div className="flex flex-wrap gap-2">
                        {row.status ===
                          "PENDING" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              changeStatus(
                                row.id,
                                "CONFIRMED"
                              )
                            }
                          >
                            Confirm
                          </Button>
                        )}

                        {[
                          "PENDING",
                          "CONFIRMED",
                        ].includes(
                          row.status
                        ) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              changeStatus(
                                row.id,
                                "PACKED"
                              )
                            }
                          >
                            Pack
                          </Button>
                        )}

                        <Button
                          size="sm"
                          icon="check"
                          onClick={() =>
                            changeStatus(
                              row.id,
                              "DELIVERED"
                            )
                          }
                        >
                          Deliver
                        </Button>

                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            changeStatus(
                              row.id,
                              "CANCELLED"
                            )
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
