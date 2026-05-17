import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";

import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

import { announceDataRefresh, useDataRefresh } from "../../hooks/useDataRefresh";

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

  const role = String(user?.role || "").toUpperCase().trim();

  const canManageOrders =
    role === "ADMIN" ||
    role === "CO_ADMIN";

  // ─── LOAD ORDERS ─────────────────────────────

  const load = useCallback(async () => {
    try {
      const result = await api.getOrders(token);
      setOrders(result.data || []);
    } catch (error) {
      console.error(error);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useDataRefresh(load, "orders");

  // ─── CHANGE STATUS ──────────────────────────

  const changeStatus = async (orderId, status) => {
    try {
      await api.updateOrderStatus(orderId, { status }, token);

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

  // ─── ORDER ITEMS RENDER ─────────────────────

  const renderOrderItems = (order) => (
    <div className="space-y-1">
      {order.items?.map((item) => (
        <p key={item.id}>
          {item.product_name} -{" "}
          {formatNumber(item.qty_ordered)} {item.unit}
        </p>
      ))}
    </div>
  );

  // ─── FILTERED ORDERS ────────────────────────

  const filteredOrders = useMemo(() => {
    return orders;
  }, [orders]);

  return (
    <div className="space-y-4">
      <DataTable
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
          },

          {
            key: "customer_address",
            label: "Address",
          },

          {
            key: "pan_number",
            label: "PAN",
          },

          {
            key: "transport_name",
            label: "Transport",
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
          },

          {
            key: "confirmed_by_name",
            label: "Confirmed By",
            render: (row) => row.confirmed_by_name || "-",
          },

          {
            key: "packed_by_name",
            label: "Packed By",
            render: (row) => row.packed_by_name || "-",
          },

          {
            key: "delivered_by_name",
            label: "Delivered By",
            render: (row) => row.delivered_by_name || "-",
          },

          {
            key: "created_at",
            label: "Created At",
            render: (row) =>
              new Date(row.created_at).toLocaleString(),
          },

          {
            key: "confirmed_at",
            label: "Confirmed At",
            render: (row) =>
              row.confirmed_at 
                ? new Date(row.confirmed_at).toLocaleString()
                : "-",
          },

          {
            key: "packed_at",
            label: "Packed At",
            render: (row) =>
              row.packed_at 
                ? new Date(row.packed_at).toLocaleString()
                : "-",
          },

          {
            key: "delivered_at",
            label: "Delivered At",
            render: (row) =>
              row.delivered_at 
                ? new Date(row.delivered_at).toLocaleString()
                : "-",
          },

          canManageOrders
            ? {
                key: "actions",
                label: "Actions",

                render: (row) =>
                  ["DELIVERED", "CANCELLED"].includes(row.status)
                    ? null
                    : (
                      <div className="flex flex-wrap gap-2">
                        {row.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              changeStatus(row.id, "CONFIRMED")
                            }
                          >
                            Confirm
                          </Button>
                        )}

                        {["PENDING", "CONFIRMED"].includes(
                          row.status
                        ) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              changeStatus(row.id, "PACKED")
                            }
                          >
                            Pack
                          </Button>
                        )}

                        <Button
                          size="sm"
                          icon="check"
                          onClick={() =>
                            changeStatus(row.id, "DELIVERED")
                          }
                        >
                          Deliver
                        </Button>

                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            changeStatus(row.id, "CANCELLED")
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ),
              }
            : {
                key: "empty",
                label: "",
              },
        ]}
        rows={filteredOrders}
      />
    </div>
  );
}