import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Icon from "../components/Icon";

const navByRole = {
  ADMIN: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/finished-goods", label: "Production House Calculation", icon: "production" },
    { to: "/receive-stock", label: "Purchase", icon: "purchase" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
    { to: "/formulas", label: "Formulas", icon: "formulas" },
    { to: "/production", label: "Production", icon: "production" },
    { to: "/orders", label: "Orders", icon: "orders" },
    { to: "/permissions", label: "Permissions", icon: "permission" },
    { to: "/users", label: "Users", icon: "users" },
  ],
  STORE_KEEPER: [
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
  ],
  USER: [
    { to: "/finished-goods", label: "Finished Goods", icon: "finishedGoods" },
    { to: "/orders", label: "Orders", icon: "orders" },
  ],
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = navByRole[user?.role] || [];

  const pageTitle = useMemo(() => {
    return (
      navItems.find((item) => item.to === location.pathname)?.label ||
      "Dashboard"
    );
  }, [location.pathname, navItems]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const NavList = () => (
    <>
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
    </>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:px-6">

        {/* MOBILE OVERLAY */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* MOBILE SIDEBAR */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-sm transform border-r border-slate-200 bg-white p-4 shadow-2xl transition duration-200 lg:hidden ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">

            {/* HEADER */}
            <div className="rounded-2xl bg-slate-950 px-5 py-5 text-white">
              <h1 className="text-lg font-semibold uppercase tracking-[0.2em]">
                Store Management
              </h1>
            </div>

            {/* USER */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-base font-semibold">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2.5 py-1 text-xs text-indigo-700">
                {user?.role}
              </span>
            </div>

            {/* NAV */}
            <nav className="mt-4 flex-1 space-y-2 overflow-y-auto">
              <NavList />
            </nav>

            {/* LOGOUT */}
            <Button
              className="hover:bg-black hover:text-white mt-4"
              variant="secondary"
              icon="logout"
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </aside>

        {/* DESKTOP SIDEBAR */}
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">

            {/* USER CARD */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                {user?.role}
              </span>
            </div>

            {/* NAV */}
            <nav className="space-y-2">
              <NavList />
            </nav>

            {/* LOGOUT */}
            <Button
              variant="secondary"
              className="w-full hover:bg-black hover:text-white"
              icon="logout"
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1 space-y-4 py-1">

          {/* TOP BAR */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div>
              <p className="text-xs text-slate-400">Workspace</p>
              <p className="text-lg font-semibold">{pageTitle}</p>
            </div>

            <Button
              className="lg:hidden"
              icon="menu"
              onClick={() => setMobileNavOpen(true)}
            >
              Menu
            </Button>
          </div>

          {/* PAGE CONTENT */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
