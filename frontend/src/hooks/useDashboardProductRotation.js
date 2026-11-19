import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { useDataRefresh } from "./useDataRefresh";

const ROTATION_POLL_MS = 60_000;

export const useDashboardProductRotation = (token) => {
  const [rotation, setRotation] = useState(null);

  const loadRotation = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getDashboardProductRotation(token);
      setRotation(result.data || null);
    } catch (error) {
      // Product browsing must remain available if rotation configuration is
      // temporarily unavailable. The normal display order remains the fallback.
      if (import.meta.env.DEV) {
        console.error("Dashboard product rotation load failed", error);
      }
    }
  }, [token]);

  useEffect(() => {
    loadRotation().catch(console.error);
  }, [loadRotation]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = window.setInterval(
      () => loadRotation().catch(console.error),
      ROTATION_POLL_MS
    );
    return () => window.clearInterval(timer);
  }, [loadRotation, token]);

  useEffect(() => {
    const nextRotationAt = rotation?.next_rotation_at;
    if (!nextRotationAt) return undefined;
    const delay = new Date(nextRotationAt).getTime() - Date.now() + 1500;
    if (!Number.isFinite(delay) || delay <= 0) return undefined;
    const timer = window.setTimeout(
      () => loadRotation().catch(console.error),
      Math.min(delay, 2_147_000_000)
    );
    return () => window.clearTimeout(timer);
  }, [loadRotation, rotation?.next_rotation_at]);

  useDataRefresh(loadRotation, "dashboard-product-rotation");

  return rotation;
};
