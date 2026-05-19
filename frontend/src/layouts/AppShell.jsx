import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Icon from "../components/Icon";
import NotificationWatcher from "../components/NotificationWatcher";
import { normalizeRole } from "../utils/roles";

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
    { to: "/stock", label: "Stock", icon: "stock" },
    { to: "/permissions", label: "Permissions", icon: "permission" },
    { to: "/on-hold", label: "On Hold", icon: "hidden" },
    { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
    { to: "/summary", label: "Summary", icon: "hidden" },
    { to: "/users", label: "Users", icon: "users" },
    
    
  ],

  CO_ADMIN: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/finished-goods", label: "Production House Calculation", icon: "production" },
    { to: "/receive-stock", label: "Purchase", icon: "purchase" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
    { to: "/formulas", label: "Formulas", icon: "formulas" },
    { to: "/production", label: "Production", icon: "production" },
    { to: "/orders", label: "Orders", icon: "orders" },
    { to:   "/stock", label: "Stock", icon: "stock" },
    { to: "/permissions", label: "Permissions", icon: "permission" },
    { to: "/on-hold", label: "On Hold", icon: "hidden" },
    { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
    { to: "/summary", label: "Summary", icon: "hidden" },
    

  ],

  MEMBER: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/finished-goods-member", label: "Our Products", icon: "finishedGoods" },
    // { to: "/order-member", label: "Order", icon: "cart" },
    //  { to: "/on-hold-member", label: "On Hold", icon: "hidden" },
     { to: "/stock-member", label: "Stock", icon: "stock" },
     { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
     { to: "/summary", label: "Summary", icon: "hidden" },
  ],

   USER: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/finished-goods", label: "Our Products", icon: "finishedGoods" },
    { to: "/order-customer", label: "Order", icon: "cart" },
  ],

  ELDER: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/elder-finished", label: "Our Products", icon: "finishedGoods" },
  ],
};

export default function AppShell() {
  const { token, user, logout } = useAuth();
  const location = useLocation();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const role = normalizeRole(user?.role);
  const navItems = navByRole[role] || [];
  const notificationStorageKey = user?.id
    ? `store-management:notification-inbox:${user.id}`
    : "";
  const unreadCount = notifications.filter((item) => !item.read).length;

  const pageTitle = useMemo(() => {
    return (
      navItems.find((item) => item.to === location.pathname)?.label ||
      "Dashboard"
    );
  }, [location.pathname, navItems]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setNotificationsOpen(false);

    if (!notificationStorageKey) {
      setNotifications([]);
      return;
    }

    try {
      const saved = localStorage.getItem(notificationStorageKey);
      setNotifications(saved ? JSON.parse(saved) : []);
    } catch {
      setNotifications([]);
    }
  }, [notificationStorageKey]);

  const saveNotifications = useCallback(
    (nextNotifications) => {
      if (notificationStorageKey) {
        localStorage.setItem(
          notificationStorageKey,
          JSON.stringify(nextNotifications)
        );
      }
    },
    [notificationStorageKey]
  );

  const addNotification = useCallback(
    (notification) => {
      setNotifications((current) => {
        const next = [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            title: notification.title,
            message: notification.message,
            tone: notification.tone || "info",
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...current,
        ].slice(0, 20);

        saveNotifications(next);
        return next;
      });
    },
    [saveNotifications]
  );

  const markNotificationsRead = useCallback(() => {
    setNotifications((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      saveNotifications(next);
      return next;
    });
  }, [saveNotifications]);

  const UserCard = () => (
    <div className="relative mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{user?.name}</p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
          <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2.5 py-1 text-xs text-indigo-700">
            {user?.role}
          </span>
        </div>

        <button
          type="button"
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700"
          onClick={() => setNotificationsOpen((open) => !open)}
          aria-label="Notifications"
        >
          <Icon name="bell" className="h-4 w-4" />
          {unreadCount ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      {notificationsOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              type="button"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-slate-300"
              disabled={!unreadCount}
              onClick={markNotificationsRead}
            >
              Mark as read
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                    notification.read ? "bg-white" : "bg-indigo-50/70"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {notification.message}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

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
      <NotificationWatcher user={user} token={token} onNotify={addNotification} />
      <div className="mx-auto flex min-h-screen max-w gap-6 px-4 py-4 lg:px-6">

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
            <div className="rounded-2xl bg-slate-950 px-5 py-5 text-black">
              <h1 className="text-xl font-bold uppercase tracking-[0.2em]">
                Store Management
              </h1>
            </div>

            {/* USER */}
            <UserCard />

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
        <aside className="hidden w-50 shrink-0 lg:block">
          <div className="flex flex-col justify-align sticky top-4 space-y-4 h-full rounded-2xl border border-slate-200 bg-white p-4">

            {/* USER CARD */}
            <UserCard />

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
