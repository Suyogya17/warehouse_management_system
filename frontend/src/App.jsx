import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import AppShell from "./layouts/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";

import DashboardPage from "./pages/DashboardPage";
import RawMaterialsPage from "./pages/RawMaterialsPage";
import FinishedGoodsPage from "./pages/FinishedGoodsPage";
import FinishedGoodsUserPage from "./pages/FinishedGoodsUserPage";
import ReceiveStockPage from "./pages/ReceiveStockPage";
import ConsumptionPage from "./pages/ConsumptionPage";
import FormulasPage from "./pages/FormulasPage";
import ProductionPage from "./pages/ProductionPage";
import PermissionsPage from "./pages/PermissionsPage";
import UsersPage from "./pages/UsersPage";
import OrdersPage from "./pages/OrdersPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      {/* LOGIN */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
        }
      />

      {/* APP */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route path="dashboard" element={<DashboardPage />} />

        <Route
          path="raw-materials"
          element={
            <ProtectedRoute roles={["ADMIN", "STORE_KEEPER"]}>
              <RawMaterialsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="finished-goods"
          element={
            <ProtectedRoute roles={["ADMIN", "USER"]}>
              {user?.role === "USER" ? (
                <FinishedGoodsUserPage />
              ) : (
                <FinishedGoodsPage />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="receive-stock"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ReceiveStockPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="consumption"
          element={
            <ProtectedRoute roles={["ADMIN", "STORE_KEEPER"]}>
              <ConsumptionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="formulas"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <FormulasPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="production"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="orders"
          element={
            <ProtectedRoute roles={["ADMIN", "USER"]}>
              <OrdersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="permissions"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <PermissionsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="users"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <NotFoundPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
