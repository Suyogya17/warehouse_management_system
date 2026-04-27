import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
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
  });

  useEffect(() => {
    const load = async () => {
      const requests = [];

      if (user.role !== "USER") requests.push(api.getStockSummary(token));
      else requests.push(Promise.resolve(null));

      requests.push(api.getFinishedGoods(token));
      requests.push(user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }));
      requests.push(user.role !== "USER" ? api.getProductionHistory(token) : Promise.resolve({ data: [] }));
      requests.push(user.role !== "USER" ? api.getConsumptionLogs(token) : Promise.resolve({ data: [] }));

      const [stock, finishedGoods, formulas, production, consumption] = await Promise.all(requests);
      setState({
        stock,
        finishedGoods: finishedGoods.data || [],
        formulas: formulas.data || [],
        production: production.data || [],
        consumption: consumption.data || [],
      });
    };

    load().catch(console.error);
  }, [token, user.role]);

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
          </>
        ) : (
          <>
            <StatCard label="Raw Material Stock" value={formatNumber(rawTotal)} tone="calm" icon="materials" />
            <StatCard
  label="Finished Goods Stock"
  value={<span className="text-green-600">{formatNumber(finishedTotal)}</span>}
  tone="bold"
/>
          <StatCard label="Low Stock Alerts" value={formatNumber(lowStock)} tone={lowStock ? "alert" : "default"} icon={lowStock ? "warning" : "check"} />
            <StatCard label="Production Runs" value={formatNumber(state.production.length)} tone="default" icon="production" />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Factory workflow" subtitle="Step-by-step progress for the current role." icon="arrowRight">
          <div className="space-y-4">
            {workflowSteps.map((step, index) => {
              const progress = step.getProgress(workflowStats);
              return (
              <div key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{index + 1}. {step.title}</p>
                      <p className="mt-1 text-sm text-slate/70">{step.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate">{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-gold to-mint" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Low stock materials" subtitle="Materials that need attention soon." icon="warning">
          <div className="space-y-3">
            {(state.stock?.low_stock_alerts || []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-2xl bg-sand px-4 py-3">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-sm text-slate/75">
                  {item.article_code} • {formatNumber(item.quantity)} {item.unit} left
                </p>
              </div>
            ))}
            {!state.stock?.low_stock_alerts?.length ? <p className="text-sm text-slate/70">No low stock alerts.</p> : null}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Material usage guide" subtitle="Recommended production units for your shoe factory." icon="materials">
          <div className="grid gap-3 md:grid-cols-2">
            {materialBlueprints.map((item) => (
              <div key={item.name} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="mt-1 text-sm text-slate/75">
                  Unit: {item.unit} • Stage: {item.stage}
                </p>
                <p className="mt-2 text-sm text-slate/65">{item.notes}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Finished goods snapshot" subtitle="Pairs ready for stock view and packing planning." icon="finishedGoods">
          <div className="space-y-3">
            {state.finishedGoods.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-sm text-slate/75">
                  {item.article_code} • {item.color || "No color"}
                  {user.role === "USER" ? "" : ` • ${formatNumber(item.quantity)} ${item.unit}`}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
