import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Icon from "../components/Icon";
import NotificationWatcher from "../components/NotificationWatcher";
import { normalizeRole } from "../utils/roles";
import { canManageProductVisibility } from "../utils/pagePermissions";
import { api } from "../services/api";
import { formatNepaliDate } from "../utils/format";

const countryNames = {
  NP: "Nepal",
  IN: "India",
  CN: "China",
  US: "United States",
  GB: "United Kingdom",
};

const navByRole = {
  ADMIN: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/finished-goods", label: "Production House Calculation", icon: "production" },
    { to: "/receive-stock", label: "Purchase", icon: "purchase" },
    { to: "/import-tracking", label: "Import Tracking", icon: "box" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
    { to: "/formulas", label: "Formulas", icon: "formulas" },
    { to: "/production", label: "Production", icon: "production" },
    { to: "/orders", label: "Orders", icon: "orders" },
    { to: "/analytics", label: "Factory Analytics", icon: "dashboard" },
    { to: "/stock", label: "Stock", icon: "stock" },
    { to: "/warehouses", label: "Warehouses", icon: "box" },
    { to: "/permissions", label: "Permissions", icon: "permission" },
    { to: "/product-display", label: "Product Display", icon: "eye" },
    { to: "/offers", label: "Offers", icon: "finishedGoods" },
    { to: "/gallery", label: "Gallery", icon: "image" },
    { to: "/advertisements", label: "Advertisements", icon: "image" },
    { to: "/on-hold", label: "On Hold", icon: "hidden" },
    { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
    { to: "/summary", label: "Summary", icon: "hidden" },
    { to: "/activity-logs", label: "Activity Logs", icon: "ledger" },
    { to: "/users", label: "Users", icon: "users" },
  ],

  CO_ADMIN: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/raw-materials", label: "Raw Materials", icon: "materials" },
    { to: "/finished-goods", label: "Production House Calculation", icon: "production" },
    { to: "/receive-stock", label: "Purchase", icon: "purchase" },
    { to: "/import-tracking", label: "Import Tracking", icon: "box" },
    { to: "/consumption", label: "Consumption", icon: "consumption" },
    { to: "/formulas", label: "Formulas", icon: "formulas" },
    { to: "/production", label: "Production", icon: "production" },
    { to: "/orders", label: "Orders", icon: "orders" },
    { to: "/analytics", label: "Factory Analytics", icon: "dashboard" },
    { to: "/stock", label: "Stock", icon: "stock" },
    { to: "/warehouses", label: "Warehouses", icon: "box" },
    { to: "/permissions", label: "Permissions", icon: "permission" },
    { to: "/product-display", label: "Product Display", icon: "eye" },
    { to: "/offers", label: "Offers", icon: "finishedGoods" },
    { to: "/gallery", label: "Gallery", icon: "image" },
    { to: "/advertisements", label: "Advertisements", icon: "image" },
    { to: "/on-hold", label: "On Hold", icon: "hidden" },
    { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
    { to: "/summary", label: "Summary", icon: "hidden" },
    { to: "/activity-logs", label: "Activity Logs", icon: "ledger" },
  ],

  MEMBER: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/finished-goods-member", label: "Our Products", icon: "finishedGoods" },
    { to: "/gallery", label: "Gallery", icon: "image" },
    { to: "/stock-member", label: "Stock", icon: "stock" },
    { to: "/warehouses", label: "Warehouses", icon: "box" },
    { to: "/product-ledger", label:"Product Ledger", icon: "ledger"},
    { to: "/summary", label: "Summary", icon: "hidden" },
  ],

  USER: [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/finished-goods", label: "Our Products", icon: "finishedGoods" },
    { to: "/offers", label: "Offers", icon: "finishedGoods" },
    { to: "/gallery", label: "Gallery", icon: "image" },
    { to: "/order-customer", label: "Order", icon: "cart" },
  ],

  ELDER: [
    { to: "/elder-finished", label: "Our Products", icon: "finishedGoods" },
    { to: "/offers", label: "Offers", icon: "finishedGoods" },
    { to: "/gallery", label: "Gallery", icon: "image" },
  ],
};

const formatNotificationTime = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return `BS ${formatNepaliDate(date)}, ${timeStr}`;
};

const hashText = (value) => {
  let hash = 0;
  const text = String(value || "");

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
};

const readLegacyNotifications = (userId) => {
  try {
    const saved = localStorage.getItem(`store-management:notification-inbox:${userId}`);
    const parsed = saved ? JSON.parse(saved) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item?.title && item?.message)
      .map((item) => {
        const fingerprint = `${item.title}|${item.message}|${item.createdAt || ""}`;

        return {
          unique_key: item.unique_key || `legacy:${hashText(fingerprint)}`,
          title: item.title,
          message: item.message,
          tone: item.tone || "info",
          createdAt: item.createdAt,
          read: Boolean(item.read),
        };
      });
  } catch {
    return [];
  }
};

export default function AppShell() {
  const { token, user, logout } = useAuth();
  const location = useLocation();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const role = normalizeRole(user?.role);
  const navItems = useMemo(() => {
    const items = navByRole[role] || [];

    if (role !== "CO_ADMIN" || canManageProductVisibility(user)) return items;

    const restrictedVisibilityRoutes = new Set([
      "/permissions",
      "/product-display",
      "/on-hold",
    ]);

    return items.filter((item) => !restrictedVisibilityRoutes.has(item.to));
  }, [role, user]);
  const unreadCount = notifications.filter((item) => !item.read).length;

  const preventNumberWheelChange = (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === "number") {
      input.blur();
    }
  };

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
    if (!mobileNavOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    setNotificationsOpen(false);

    if (!token || !user?.id) {
      setNotifications([]);
      return;
    }

    let cancelled = false;

    api
      .getNotifications(token)
      .then(async (result) => {
        const serverNotifications = result.data || [];
        const legacyNotifications = readLegacyNotifications(user.id);

        if (!legacyNotifications.length) {
          if (!cancelled) setNotifications(serverNotifications);
          return;
        }

        const serverKeys = new Set(serverNotifications.map((item) => item.unique_key));
        const legacyToUpload = legacyNotifications.filter((item) => !serverKeys.has(item.unique_key));

        if (!legacyToUpload.length) {
          if (!cancelled) setNotifications(serverNotifications);
          return;
        }

        const migrated = await Promise.all(
          legacyToUpload.map((item) =>
            api.createNotification(item, token).then((response) => response.data).catch(() => item)
          )
        );

        const merged = [...migrated, ...serverNotifications]
          .filter(Boolean)
          .slice(0, 50);

        if (!cancelled) setNotifications(merged);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });

    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  const addNotification = useCallback(
    (notification) => {
      const localNotification = {
        id: notification.unique_key || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        unique_key: notification.unique_key,
        title: notification.title,
        message: notification.message,
        tone: notification.tone || "info",
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((current) => {
        const deduped = current.filter(
          (item) =>
            item.unique_key !== localNotification.unique_key &&
            item.id !== localNotification.id
        );
        return [localNotification, ...deduped].slice(0, 20);
      });

      if (token && notification.unique_key) {
        api
          .createNotification(notification, token)
          .then((result) => {
            const savedNotification = result.data;
            if (!savedNotification) return;

            setNotifications((current) => {
              const deduped = current.filter(
                (item) =>
                  item.unique_key !== savedNotification.unique_key &&
                  item.id !== localNotification.id
              );
              return [savedNotification, ...deduped].slice(0, 20);
            });
          })
          .catch(() => {});
      }
    },
    [token]
  );

  const markNotificationsRead = useCallback(() => {
    setNotifications((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      return next;
    });

    if (token) {
      api.markNotificationsRead(token).catch(() => {});
    }
  }, [token]);

  const UserCard = () => (
    <div className="relative mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{user?.name}</p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
          <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2.5 py-1 text-xs text-indigo-700">
            {user?.role}
          </span>
          <p className="mt-2 text-xs font-medium text-slate-500">
            {countryNames[user?.country_code] || user?.country_code || "Nepal"}
    
          </p>
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
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-yellow-600">
                      {notification.title}
                    </p>
                    {notification.createdAt && (
                      <span className="shrink-0 text-[10px] text-red-700 mt-0.5">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    )}
                  </div>
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
          onClick={() => setMobileNavOpen(false)}
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
    <div
      className="min-h-screen overflow-x-hidden bg-transparent text-slate-900 lg:h-screen lg:overflow-hidden"
      onWheelCapture={preventNumberWheelChange}
    >
      <NotificationWatcher user={user} token={token} onNotify={addNotification} />
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] gap-3 px-2 py-2 sm:gap-4 sm:px-4 sm:py-3 lg:h-screen lg:min-h-0 lg:items-stretch lg:gap-6 lg:px-6 lg:py-4">

        {/* MOBILE OVERLAY */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* MOBILE SIDEBAR */}
        <aside
          id="mobile-navigation"
          className={`fixed inset-y-0 left-0 z-50 w-[92vw] max-w-sm transform border-r border-slate-200 bg-white p-3 shadow-2xl transition-transform duration-300 ease-out sm:p-4 lg:hidden ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-hidden={!mobileNavOpen}
        >
          <div className="flex h-full flex-col">

            {/* HEADER */}
            <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-5 text-white">
              <h1 className="text-lg font-bold uppercase tracking-[0.18em]">
                Store Management
              </h1>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* USER */}
            <UserCard />

            {/* NAV */}
            <nav className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
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
        <aside className="hidden w-72 shrink-0 lg:block lg:h-full lg:min-h-0">
          <div className="flex h-full min-h-0 flex-col space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
            {/* USER CARD */}
            <UserCard />

            {/* NAV */}
            <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
        <main className="min-w-0 flex-1 space-y-3 overflow-x-clip pb-4 py-1 sm:space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">

          {/* TOP BAR */}
          <div className="sticky top-2 z-30 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4 sm:py-4 lg:static lg:bg-white">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Workspace</p>
              <p className="truncate text-base font-semibold sm:text-lg">{pageTitle}</p>
            </div>

            <Button
              className="shrink-0 lg:hidden"
              icon="menu"
              onClick={() => setMobileNavOpen(true)}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-navigation"
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
