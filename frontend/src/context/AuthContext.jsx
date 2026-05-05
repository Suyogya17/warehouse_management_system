import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);
const STORAGE_KEY = "store-management-auth";

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { token: "", user: null };
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

  // ✅ Wrap functions in useCallback to stabilize references
  const login = useCallback(async (email, password, expectedRole) => {
    setLoading(true);
    try {
      const result = await api.login({ email, password });
      if (expectedRole && result.user.role !== expectedRole) {
        throw new Error(`This account is ${result.user.role}. Please use the correct login type.`);
      }
      setAuth({ token: result.token, user: result.user });
      return result.user;
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
    setAuth((current) => ({ ...current, user: result.data }));
    return result.data;
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