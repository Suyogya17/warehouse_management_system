import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import AppShell from "./layouts/AppShell";
import {
  ApiLoadingOverlay,
  ApiProgressBar,
  InitialLoadingOverlay,
  NepchaLoader,
} from "./components/NepchaLoader";
import ProtectedRoute from "./components/ProtectedRoute";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const RawMaterialsPage = lazy(() => import("./pages/RawMaterialsPage"));
const FinishedGoodsPage = lazy(() => import("./pages/FinishedGoodsPage"));
const FinishedGoodsUserPage = lazy(() => import("./pages/Users/FinishedGoodsUserPage"));
const ReceiveStockPage = lazy(() => import("./pages/ReceiveStockPage"));
const ConsumptionPage = lazy(() => import("./pages/ConsumptionPage"));
const FormulasPage = lazy(() => import("./pages/FormulasPage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const PermissionsPage = lazy(() => import("./pages/PermissionsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const CustomerOrdersPage = lazy(() => import("./pages/Users/CustomerOrdersPage"));
const ElderFinishedPage = lazy(() => import("./pages/Elder/ElderFinishedPage"));
const StockPage = lazy(() => import("./pages/StockPage"));
const WareHousePage = lazy(() => import("./pages/WareHousePage"));
const MemberFinishedPage = lazy(() => import("./pages/Member/MemberFinishedGoodPage"));
const MemberStockPage = lazy(() => import("./pages/Member/MemberStockPage"));
const MemberOrderPage = lazy(() => import("./pages/Member/MemberOrderPage"));
const OnHoldPage = lazy(() => import("./pages/OnHoldPage"));
const OutOfStockPage = lazy(() => import("./pages/OutOfStockPage"));
const SummaryPage = lazy(() => import("./pages/SummaryPage"));
const ProductLedgerPage = lazy(() => import("./pages/ProductLedgerPage"));
const ProductDisplayPage = lazy(() => import("./pages/ProductDisplayPage"));
const OpenProductsPage = lazy(() => import("./pages/OpenProductsPage"));
const ProductPercentagePage = lazy(() => import("./pages/ProductPercentagePage"));
const AdvertisementsPage = lazy(() => import("./pages/AdvertisementsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ActivityLogPage = lazy(() => import("./pages/ActivityLogPage"));
const ImportTrackingPage = lazy(() => import("./pages/ImportTrackingPage"));
const OffersPage = lazy(() => import("./pages/OffersPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));

const PageFallback = () => <NepchaLoader />;

const withSuspense = (element) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

export default function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <>
      <InitialLoadingOverlay />
      <ApiLoadingOverlay />
      <ApiProgressBar />
      <Routes>
      {/* LOGIN */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : withSuspense(<LoginPage />)
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

        <Route
          path="dashboard"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER", "USER"]}>
              {withSuspense(<DashboardPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="raw-materials"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<RawMaterialsPage />)}
            </ProtectedRoute>
          }
        />        

       <Route
  path="finished-goods"
  element={
    <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "USER"]}>
      {withSuspense(user?.role === "USER" ? (
        <FinishedGoodsUserPage />
      ) : (
        <FinishedGoodsPage />
      ))}
    </ProtectedRoute>
  }
/>

        <Route
          path="receive-stock"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ReceiveStockPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="import-tracking"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ImportTrackingPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="consumption"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ConsumptionPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="formulas"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<FormulasPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="production"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ProductionPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="orders"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<OrdersPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="analytics"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<AnalyticsPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="activity-logs"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ActivityLogPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="stock"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<StockPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="warehouses"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER"]}>
              {withSuspense(<WareHousePage />)}
            </ProtectedRoute>
          }
        />

         <Route
          path="order-customer"
          element={
            <ProtectedRoute roles={["USER"]}>
              {withSuspense(<CustomerOrdersPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="elder-finished"
          element={
            <ProtectedRoute roles={["ELDER"]}>
              {withSuspense(<ElderFinishedPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="finished-goods-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              {withSuspense(<MemberFinishedPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="stock-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              {withSuspense(<MemberStockPage />)}
            </ProtectedRoute>
          }
        />

         <Route
          path="order-member"
          element={
            <ProtectedRoute roles={["MEMBER"]}>
              {withSuspense(<MemberOrderPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="offers"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "USER", "ELDER"]}>
              {withSuspense(<OffersPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="gallery"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER", "USER", "ELDER"]}>
              {withSuspense(<GalleryPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="chat"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER", "USER", "ELDER"]}>
              {withSuspense(<ChatPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="permissions"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<PermissionsPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="product-display"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ProductDisplayPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="open-products"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<OpenProductsPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="product-percentages"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<ProductPercentagePage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="advertisements"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<AdvertisementsPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="on-hold"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<OnHoldPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="out-of-stock"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN"]}>
              {withSuspense(<OutOfStockPage />)}
            </ProtectedRoute>
          }
        />

         <Route
          path="summary"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER"]}>
              {withSuspense(<SummaryPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="product-ledger"
          element={
            <ProtectedRoute roles={["ADMIN", "CO_ADMIN", "MEMBER"]}>
              {withSuspense(<ProductLedgerPage />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="users"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              {withSuspense(<UsersPage />)}
            </ProtectedRoute>
          }
        />
      </Route>

      

      {/* 404 */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            withSuspense(<NotFoundPage />)
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      </Routes>
    </>
  );
}
