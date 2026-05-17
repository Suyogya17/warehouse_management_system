import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../services/api";
import { normalizeRole } from "../utils/roles";

const AuthContext = createContext(null);
const STORAGE_KEY = "store-management-auth";

const normalizeUser = (user) =>
  user ? { ...user, role: normalizeRole(user.role) } : user;

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { token: "", user: null };

    const parsed = JSON.parse(saved);
    return { ...parsed, user: normalizeUser(parsed.user) };
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

   // =========================
  // 🔥 AUTO LOGOUT (IMPORTANT)
  // =========================
  useEffect(() => {
    if (!auth.token) return;

    try {
      const payload = JSON.parse(atob(auth.token.split(".")[1]));
      const expiry = payload.exp * 1000;

      const timeout = expiry - Date.now();

      // already expired → logout immediately
      if (timeout <= 0) {
        logout();
        return;
      }

      const timer = setTimeout(() => {
        logout();
      }, timeout);

      return () => clearTimeout(timer);
    } catch (err) {
      logout(); // invalid token → force logout
    }
  }, [auth.token]);

  // ✅ Wrap functions in useCallback to stabilize references
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

  const logout = useCallback(() => {
    setAuth({ token: "", user: null });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.token) return null;
    const result = await api.getProfile(auth.token);
    const user = normalizeUser(result.data);
    setAuth((current) => ({ ...current, user }));
    return user;
  }, [auth.token]);

  // ✅ Now include all dependencies
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

// ✅ Move useAuth to a separate export to ensure it's not conflicting
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
