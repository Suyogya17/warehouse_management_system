import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect } from "react";
import { hasRole } from "../utils/roles";

export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ Handle auth expiration with React Router navigation
  useEffect(() => {
    const handleExpiredAuth = () => {
      navigate("/login", { replace: true, state: { from: location } });
    };

    window.addEventListener("store-management:auth-expired", handleExpiredAuth);
    return () => window.removeEventListener("store-management:auth-expired", handleExpiredAuth);
  }, [navigate, location]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles?.length && !hasRole(user?.role, roles)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
