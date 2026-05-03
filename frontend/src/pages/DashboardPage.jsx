import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";
import { materialBlueprints, manufacturingFlowByRole } from "../utils/manufacturing";

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [state, setState] = useState({
    stock: null,  
    finishedGoods: [],
    formulas: [],
    production: [],
    consumption: [],
    orders: [],
  });

  const load = useCallback(async () => {
    const requests = [];

    if (user.role !== "USER") requests.push(api.getStockSummary(token));
    else requests.push(Promise.resolve(null));

    requests.push(api.getFinishedGoods(token));
    requests.push(user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "USER" ? api.getProductionHistory(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "STORE_KEEPER" ? api.getConsumptionLogs(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "STORE_KEEPER" ? api.getOrders(token) : Promise.resolve({ data: [] }));

    const [stock, finishedGoods, formulas, production, consumption, orders] = await Promise.all(requests);
    setState({
      stock,
      finishedGoods: finishedGoods.data || [],
      formulas: formulas.data || [],
      production: production.data || [],
      consumption: consumption.data || [],
      orders: orders.data || [],
    });
  }, [token, user.role]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "dashboard");

  const lowStock = state.stock?.low_stock_alerts?.length || 0;
  const finishedTotal = state.finishedGoods.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const rawTotal = state.stock?.data?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
  const workflowSteps = manufacturingFlowByRole[user.role] || [];
  const workflowStats = {
    materialsCount: state.stock?.data?.length || 0,
    finishedGoodsCount: state.finishedGoods.length,
    formulasCount: state.formulas.length,
    productionCount: state.production.length,
    consumptionCount: state.consumption.length,
    ordersCount: state.orders.length,
    lowStockCount: lowStock,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${user.role.replace("_", " ")} workspace`}
        title="Daily operations overview"
        description="Monitor raw-material health, production activity, and finished-goods readiness in one place."
        icon="dashboard"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {user.role === "USER" ? (
          <>
            {/* <StatCard label="Visible Products" value={formatNumber(state.finishedGoods.length)} tone="bold" /> */}
            <StatCard label="Catalog Status" value="Active" tone="default" icon="finishedGoods" />
            <StatCard label="My Orders" value={formatNumber(state.orders.length)} tone="calm" icon="orders" />
          </>
        ) : (
          <>
            <StatCard label="Raw Material Stock" value={formatNumber(rawTotal)} tone="calm" icon="materials" />
            <StatCard label="Finished Goods Stock In Pairs" value={formatNumber(finishedTotal)} tone="calm" icon="finishedGoods" />  
            <StatCard label="Low Stock Alerts" value={formatNumber(lowStock)} tone={lowStock ? "alert" : "default"} icon={lowStock ? "warning" : "check"} />
            <StatCard label="Production Runs" value={formatNumber(state.production.length)} tone="default" icon="production" />
            <StatCard label="Active Orders" value={formatNumber(state.orders.filter((item) => !["DELIVERED", "CANCELLED"].includes(item.status)).length)} tone="alert" icon="orders" />
          </>
        )}
      </div>
    </div>
  );
}
