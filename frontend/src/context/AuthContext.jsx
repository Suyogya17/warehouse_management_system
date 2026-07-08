import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { normalizeRole } from "../utils/roles";

const AuthContext = createContext(null);
const STORAGE_KEY = "store-management-auth";

const normalizeUser = (user) =>
  user ? { ...user, role: normalizeRole(user.role) } : user;

const decodeJwtPayload = (token) => {
  const payload = token?.split(".")?.[1];
  if (!payload) return null;

  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  return JSON.parse(atob(padded));
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { token: "", user: null };

    try {
      const parsed = JSON.parse(saved);
      return {
        token: parsed.token || "",
        user: normalizeUser(parsed.user),
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return { token: "", user: null };
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }, [auth]);

  useEffect(() => {
    const handleExpiredAuth = () => {
      setAuth({ token: "", user: null });
    };

    window.addEventListener("store-management:auth-expired", handleExpiredAuth);
    return () => window.removeEventListener("store-management:auth-expired", handleExpiredAuth);
  }, []);

  const logout = useCallback(() => {
    setAuth({ token: "", user: null });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!auth.token) return;

    try {
      const payload = decodeJwtPayload(auth.token);
      if (!payload?.exp) return;

      const timeout = payload.exp * 1000 - Date.now();
      if (timeout <= 0) return;

      const timer = setTimeout(() => {
        logout();
      }, timeout);

      return () => clearTimeout(timer);
    } catch {
      // The backend remains the source of truth; api.js logs out on 401.
    }
  }, [auth.token, logout]);

  const login = useCallback(async (email, password, expectedRole) => {
    setLoading(true);
    try {
      const result = await api.login({ email, password });
      const user = normalizeUser(result.user);
      if (expectedRole && user.role !== normalizeRole(expectedRole)) {
        throw new Error(`This account is ${user.role}. Please use the correct login type.`);
      }
      setAuth({ token: result.token, user });
      return user;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.token) return null;
    const result = await api.getProfile(auth.token);
    const user = normalizeUser(result.data);
    setAuth((current) => ({ ...current, user }));
    return user;
  }, [auth.token]);

  const value = useMemo(
    () => ({
      token: auth.token,
      user: auth.user,
      loading,
      isAuthenticated: Boolean(auth.token && auth.user),
      login,
      logout,
      refreshProfile,
    }),
    [auth.token, auth.user, loading, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
