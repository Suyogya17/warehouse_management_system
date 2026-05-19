import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import AppShell from "./layouts/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";

import DashboardPage from "./pages/DashboardPage";
import RawMaterialsPage from "./pages/RawMaterialsPage";
import FinishedGoodsPage from "./pages/FinishedGoodsPage";
import FinishedGoodsUserPage from "./pages/Users/FinishedGoodsUserPage";
import ReceiveStockPage from "./pages/ReceiveStockPage";
import ConsumptionPage from "./pages/ConsumptionPage";
import FormulasPage from "./pages/FormulasPage";
import ProductionPage from "./pages/ProductionPage";
import PermissionsPage from "./pages/PermissionsPage";
import UsersPage from "./pages/UsersPage";
import OrdersPage from "./pages/OrdersPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import CustomerOrdersPage from "./pages/Users/CustomerOrdersPage";
import ElderFinishedPage from "./pages/Elder/ElderFinishedPage";
import StockPage from "./pages/StockPage";
import MemberFinishedPage from "./pages/Member/MemberFinishedGoodPage";
import MemberStockPage from "./pages/Member/MemberStockPage";
import MemberOrderPage from "./pages/Member/MemberOrderPage";
import OnHoldPage from "./pages/OnHoldPage";
import SummaryPage from "./pages/SummaryPage";
import ProductLedgerPage from "./pages/ProductLedgerPage";
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
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <RawMaterialsPage />
            </ProtectedRoute>
          }
        />        

       <Route
  path="finished-goods"
  element={
    <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER", "USER"]}>
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
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <ReceiveStockPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="consumption"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <ConsumptionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="formulas"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <FormulasPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="production"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="orders"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <OrdersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="stock"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <StockPage />
            </ProtectedRoute>
          }
        />

         <Route
          path="order-customer"
          element={
            <ProtectedRoute roles={["USER"]}>
              <CustomerOrdersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="elder-finished"
          element={
            <ProtectedRoute roles={["ELDER"]}>
              <ElderFinishedPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="finished-goods-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              <MemberFinishedPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="stock-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              <MemberStockPage />
            </ProtectedRoute>
          }
        />

         <Route
          path="order-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              <MemberOrderPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="permissions"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <PermissionsPage />
            </ProtectedRoute>
          }
        />

         <Route
          path="on-hold"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              <OnHoldPage />
            </ProtectedRoute>
          }
        />

         <Route
          path="summary"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER"]}>
              <SummaryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="product-ledger"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER"]}>
              <ProductLedgerPage />
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
