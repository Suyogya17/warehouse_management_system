import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { manufacturingFlowByRole } from "../utils/manufacturing";
import Button from "../components/Button";
import Icon from "../components/Icon";

const navByRole = {
  ADMIN: [
    { to: "/", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/finished-goods", label: "Finished Goods", icon: "finishedGoods" },
    { to: "/receive-stock", label: "Purchase", icon: "purchase" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
    { to: "/formulas", label: "Formulas", icon: "formulas" },
    { to: "/production", label: "Production", icon: "production" },
    { to: "/users", label: "Users", icon: "users" },
  ],
  STORE_KEEPER: [
    { to: "/", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
  ],
  USER: [
    { to: "/", label: "Dashboard", icon: "dashboard" },
    { to: "/finished-goods", label: "Finished Goods", icon: "finishedGoods" },
  ],
};

export default function AppShell() {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const navItems = navByRole[user?.role] || [];
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stats, setStats] = useState({
    materialsCount: 0,
    finishedGoodsCount: 0,
    formulasCount: 0,
    productionCount: 0,
    consumptionCount: 0,
    lowStockCount: 0,
  });

  useEffect(() => {
    const loadSidebarStats = async () => {
      if (!user || !token) return;

      if (user.role === "USER") {
        const finishedGoods = await api.getFinishedGoods(token);
        setStats((current) => ({
          ...current,
          finishedGoodsCount: finishedGoods.data?.length || 0,
        }));
        return;
      }

      const [materials, stock, finishedGoods, formulas, production, consumption] = await Promise.all([
        api.getRawMaterials(token),
        api.getStockSummary(token),
        api.getFinishedGoods(token),
        user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }),
        user.role === "ADMIN" ? api.getProductionHistory(token) : Promise.resolve({ data: [] }),
        api.getConsumptionLogs(token),
      ]);

      setStats({
        materialsCount: materials.data?.length || 0,
        finishedGoodsCount: finishedGoods.data?.length || 0,
        formulasCount: formulas.data?.length || 0,
        productionCount: production.data?.length || 0,
        consumptionCount: consumption.data?.length || 0,
        lowStockCount: stock.low_stock_alerts?.length || 0,
      });
    };

    loadSidebarStats().catch(console.error);
  }, [token, user]);

  const flowSteps = manufacturingFlowByRole[user?.role] || [];
  const pageTitle = useMemo(() => {
    return navItems.find((item) => item.to === location.pathname)?.label || "Dashboard";
  }, [location.pathname, navItems]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-sm transform border-r border-slate-200 bg-white p-4 shadow-2xl transition duration-200 lg:hidden ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-950 px-5 py-5 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">Store Management</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight">Operations cockpit</h1>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Manage stock flow from raw materials to visible finished goods.
                </p>
              </div>
              <Button variant="secondary" size="sm" icon="close" onClick={() => setMobileNavOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Signed in as</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <span className="mt-3 inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                {user?.role}
              </span>
            </div>

            <nav className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`
                  }
                >
                  <span className="flex items-center gap-3">
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-950">Workflow progress</p>
              <div className="mt-3 space-y-3">
                {flowSteps.map((step, index) => {
                  const progress = step.getProgress(stats);
                  return (
                    <div key={`${step.title}-${index}`} className="rounded-xl border border-slate-100 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">{index + 1}. {step.title}</p>
                        <span className="text-xs font-semibold text-slate-500">{progress}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <Button variant="secondary" className="w-full" icon="logout" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-4 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-950 px-6 py-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-900">Store Management</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-black">Operations cockpit</h1>
                <p className="mt-2 text-sm leading-6 text-slate-300 text-black">
                  Manage stock flow from inbound raw materials to finished goods visibility.
                </p>
              </div>

              <div className="px-4 py-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Signed in as</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{user?.name}</p>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                  <span className="mt-3 inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    {user?.role}
                  </span>
                </div>

                <nav className="mt-4 space-y-1.5">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                          isActive
                            ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }`
                      }
                    >
                      <span className="flex items-center gap-3">
                        <Icon name={item.icon} className="h-4 w-4" />
                        {item.label}
                      </span>
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Workflow progress</p>
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Live</span>
              </div>
              <div className="mt-4 space-y-3">
                {flowSteps.map((step, index) => {
                  const progress = step.getProgress(stats);
                  const isActive = location.pathname === step.route;

                  return (
                    <div key={`${step.title}-${index}`} className={`rounded-xl border px-3.5 py-3 ${isActive ? "border-indigo-200 bg-indigo-50/70" : "border-slate-100 bg-white"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">{index + 1}. {step.title}</p>
                        <span className="text-xs font-semibold text-slate-500">{progress}%</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5">
                <Button variant="secondary" className="w-full" icon="logout" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 py-1">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{pageTitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" className="lg:hidden" icon="menu" onClick={() => setMobileNavOpen(true)}>
                Menu
              </Button>
              <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right sm:block">
                <p className="text-xs font-medium text-slate-500">{user?.role}</p>
                <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
              </div>
              <Button variant="secondary" size="sm" className="lg:hidden" icon="logout" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
