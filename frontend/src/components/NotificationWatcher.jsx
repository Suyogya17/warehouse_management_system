import { useCallback, useEffect, useRef } from "react";
import { api } from "../services/api";
import { useToast } from "../context/ToastContext";
import { normalizeRole } from "../utils/roles";

const POLL_INTERVAL_MS = 30000;
const ADMIN_ROLES = ["ADMIN", "CO_ADMIN"];
const CUSTOMER_ROLES = ["USER", "MEMBER", "ELDER"];

const readSnapshot = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const writeSnapshot = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const formatTime = (dateStr) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getOrderItemSummary = (order) =>
  (order.items || [])
    .slice(0, 2)
    .map((item) => `${item.product_name} (${Number(item.qty_ordered || 0)} ${item.unit || "pairs"})`)
    .join(", ");

const getStatusMessage = (status, reason, updatedAt) => {
  const time = updatedAt ? ` at ${formatTime(updatedAt)}` : "";
  if (status === "CANCELLED" && reason) return `Cancelled: ${reason}${time}`;
  return `Status changed to ${String(status || "").toLowerCase()}${time}.`;
};

export default function NotificationWatcher({ user, token, onNotify }) {
  const { showToast } = useToast();
  const audioContextRef = useRef(null);
  const role = normalizeRole(user?.role);

  const playSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;

      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.setValueAtTime(660, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch {
      // Browsers may block sound until a user gesture; notifications still show.
    }
  }, []);

  useEffect(() => {
    const unlockSound = () => {
      playSound();
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };

    window.addEventListener("pointerdown", unlockSound);
    window.addEventListener("keydown", unlockSound);

    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, [playSound]);

  useEffect(() => {
    if (!token || !user?.id) return undefined;

    const orderSnapshotKey = `store-management:notifications:orders:${user.id}`;
    const productSnapshotKey = `store-management:notifications:products:${user.id}`;
    let cancelled = false;

    const checkAdminOrders = async () => {
      const result = await api.getOrders(token);
      const orders = result.data || [];
      const snapshot = readSnapshot(orderSnapshotKey, null);
      const currentOrderIds = orders.map((order) => Number(order.id)).filter(Boolean);

      if (!snapshot) {
        writeSnapshot(orderSnapshotKey, { orderIds: currentOrderIds });
        return;
      }

      const seen = new Set(snapshot.orderIds || []);
      const newOrders = orders
        .filter((order) => !seen.has(Number(order.id)))
        .sort((a, b) => Number(a.id) - Number(b.id));

      newOrders.forEach((order) => {
        const time = formatTime(order.created_at || order.createdAt);
        const notification = {
          tone: "info",
          title: "New order placed",
          message: `${order.created_by_name || order.customer_name || "User"} ordered ${getOrderItemSummary(order) || "new items"}${time ? ` at ${time}` : ""}.`,
        };

        showToast({
          ...notification,
          duration: 7000,
        });
        onNotify?.(notification);
        playSound();
      });

      writeSnapshot(orderSnapshotKey, { orderIds: currentOrderIds });
    };

    const checkCustomerUpdates = async () => {
      const [ordersResult, productsResult] = await Promise.all([
        api.getOrders(token),
        api.getAvailability(token),
      ]);

      const orders = ordersResult.data || [];
      const products = productsResult.data || [];
      const orderSnapshot = readSnapshot(orderSnapshotKey, null);
      const productSnapshot = readSnapshot(productSnapshotKey, null);

      const currentStatuses = Object.fromEntries(
        orders.map((order) => [
          Number(order.id),
          {
            status: order.status,
            cancellation_reason: order.cancellation_reason || "",
          },
        ])
      );
      const currentProductIds = products.map((product) => Number(product.id)).filter(Boolean);

      if (!orderSnapshot) {
        writeSnapshot(orderSnapshotKey, { statuses: currentStatuses });
      } else {
        const previousStatuses = orderSnapshot.statuses || {};

        orders.forEach((order) => {
          const previous = previousStatuses[Number(order.id)];
          if (!previous || previous.status === order.status) return;

          const notification = {
            tone: order.status === "CANCELLED" ? "warning" : "info",
            title: `Order #${order.id} updated`,
            message: getStatusMessage(
              order.status,
              order.cancellation_reason,
              order.updated_at || order.updatedAt
            ),
          };

          showToast({
            ...notification,
            duration: 7000,
          });
          onNotify?.(notification);
          playSound();
        });

        writeSnapshot(orderSnapshotKey, { statuses: currentStatuses });
      }

      if (!productSnapshot) {
        writeSnapshot(productSnapshotKey, { productIds: currentProductIds });
      } else {
        const seenProducts = new Set(productSnapshot.productIds || []);
        const newProducts = products.filter((product) => !seenProducts.has(Number(product.id)));

        newProducts.forEach((product) => {
          const time = formatTime(product.created_at || product.createdAt);
          const notification = {
            tone: "success",
            title: "New product available",
            message: `${product.name || "Product"}${product.article_code ? ` (${product.article_code})` : ""} is now available${time ? ` at ${time}` : ""}.`,
          };

          showToast({
            ...notification,
            duration: 7000,
          });
          onNotify?.(notification);
          playSound();
        });

        writeSnapshot(productSnapshotKey, { productIds: currentProductIds });
      }
    };

    const checkNotifications = async () => {
      try {
        if (ADMIN_ROLES.includes(role)) {
          await checkAdminOrders();
        } else if (CUSTOMER_ROLES.includes(role)) {
          await checkCustomerUpdates();
        }
      } catch (error) {
        if (!cancelled) console.error("Notification check failed:", error);
      }
    };

    checkNotifications();
    const interval = window.setInterval(checkNotifications, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onNotify, playSound, role, showToast, token, user?.id]);

  return null;
}