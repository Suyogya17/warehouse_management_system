import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import AppShell from "./layouts/AppShell";
import ConsumptionPage from "./pages/ConsumptionPage";
import DashboardPage from "./pages/DashboardPage";
import FinishedGoodsPage from "./pages/FinishedGoodsPage";
import FinishedGoodsUserPage from "./pages/FinishedGoodsUserPage";
import FormulasPage from "./pages/FormulasPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProductionPage from "./pages/ProductionPage";
import RawMaterialsPage from "./pages/RawMaterialsPage";
import ReceiveStockPage from "./pages/ReceiveStockPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="raw-materials" element={<ProtectedRoute roles={["ADMIN", "STORE_KEEPER"]}><RawMaterialsPage /></ProtectedRoute>} />
        <Route
          path="finished-goods"
          element={
            <ProtectedRoute roles={["ADMIN", "USER"]}>
              {user?.role === "USER" ? <FinishedGoodsUserPage /> : <FinishedGoodsPage />}
            </ProtectedRoute>
          }
        />
        <Route path="receive-stock" element={<ProtectedRoute roles={["ADMIN"]}><ReceiveStockPage /></ProtectedRoute>} />
        <Route path="consumption" element={<ProtectedRoute roles={["ADMIN", "STORE_KEEPER"]}><ConsumptionPage /></ProtectedRoute>} />
        <Route path="formulas" element={<ProtectedRoute roles={["ADMIN"]}><FormulasPage /></ProtectedRoute>} />
        <Route path="production" element={<ProtectedRoute roles={["ADMIN"]}><ProductionPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={["ADMIN"]}><UsersPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={isAuthenticated ? <NotFoundPage /> : <Navigate to="/login" replace state={{ role: user?.role }} />} />
    </Routes>
  );
}
