import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";
import { canManageProductVisibility } from "../utils/pagePermissions";

const managedRoles = new Set(["USER", "MEMBER", "ELDER"]);
const rowsPerPage = 10;
const countryNames = {
  IN: "India",
  NP: "Nepal",
};

const getCountryLabel = (countryCode) => {
  const code = String(countryCode || "NP").toUpperCase();
  return countryNames[code] || code;
};

export default function PermissionsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [countryHoldSearch, setCountryHoldSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("all");
  const [accessSort, setAccessSort] = useState("visible-desc");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [countryHoldPages, setCountryHoldPages] = useState({});
  const [overviewPages, setOverviewPages] = useState({});
  const [saving, setSaving] = useState(false);

  const isAuthorized = canManageProductVisibility(user);

  const load = useCallback(async () => {
    if (!isAuthorized) return;

    const [usersRes, productsRes, permissionsRes] = await Promise.all([
      api.getUsers(token),
      api.getFinishedGoods(token),
      api.getPermissions(token),
    ]);

    setUsers((usersRes.data || []).filter((item) => managedRoles.has(item.role)));
    setProducts(productsRes.data || []);
    setPermissions(permissionsRes.data || []);
  }, [isAuthorized, token]);

  useEffect(() => {
    if (!isAuthorized) return;

    load().catch((error) => {
      showToast({
        tone: "error",
        title: "Load failed",
        message: error.message || "Failed to load permissions.",
      });
    });
  }, [isAuthorized, load, showToast]);

  useDataRefresh(load, "permissions");

  const accessState = useMemo(() => {
    const granted = new Set();
    const denied = new Set();

    permissions.forEach((permission) => {
      const key = `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`;

      if (Number(permission.can_view) === 0) {
        denied.add(key);
      }

      if (Number(permission.can_view) === 1) {
        granted.add(key);
      }
    });

    return { granted, denied };
  }, [permissions]);

  const hasAccess = useCallback(
    (userId, productId) => {
      const key = `${Number(userId)}:${Number(productId)}`;
      return accessState.granted.has(key) && !accessState.denied.has(key);
    },
    [accessState]
  );

  const countryOptions = useMemo(() => {
    const codes = [...new Set(users.map((item) => String(item.country_code || "NP").toUpperCase()))];

    return codes.sort((a, b) => getCountryLabel(a).localeCompare(getCountryLabel(b)));
  }, [users]);

  const usersById = useMemo(
    () => new Map(users.map((item) => [Number(item.id), item])),
    [users]
  );

  const getUsersForCountry = useCallback(
    (countryCode = "all") => {
      if (countryCode === "all") return users;
      return users.filter(
        (item) => String(item.country_code || "NP").toUpperCase() === countryCode
      );
    },
    [users]
  );

  const activeUserCount = useCallback(
    (productId, countryCode = "all") =>
      getUsersForCountry(countryCode).filter((item) => hasAccess(item.id, productId)).length,
    [getUsersForCountry, hasAccess]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products
      .filter((product) => {
        const totalVisible = activeUserCount(product.id, countryFilter);

        if (accessFilter === "on-hold" && totalVisible !== 0) return false;
        if (accessFilter === "visible" && totalVisible === 0) return false;

        if (!q) return true;

        return (
          (product.name || "").toLowerCase().includes(q) ||
          (product.article_code || "").toLowerCase().includes(q) ||
          (product.sole_code || "").toLowerCase().includes(q) ||
          (product.color || "").toLowerCase().includes(q) ||
          (product.size || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aCount = activeUserCount(a.id, countryFilter);
        const bCount = activeUserCount(b.id, countryFilter);

        if (accessSort === "visible-asc") return aCount - bCount;
        if (accessSort === "visible-desc") return bCount - aCount;
        if (accessSort === "name-asc") {
          return (a.name || "").localeCompare(b.name || "");
        }

        return 0;
      });
  }, [accessFilter, accessSort, activeUserCount, countryFilter, products, productSearch]);

  const visiblePermissions = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();

    return permissions.filter((permission) => {
      if (Number(permission.can_view) !== 1) return false;
      if (!hasAccess(permission.user_id, permission.finished_good_id)) return false;
      if (!q) return true;

      return (
        (permission.user_name || "").toLowerCase().includes(q) ||
        (permission.email || "").toLowerCase().includes(q) ||
        (permission.user_role || "").toLowerCase().includes(q) ||
        (permission.product_name || "").toLowerCase().includes(q) ||
        (permission.article_code || "").toLowerCase().includes(q) ||
        (permission.sole_code || "").toLowerCase().includes(q) ||
        (permission.color || "").toLowerCase().includes(q)
      );
    });
  }, [hasAccess, overviewSearch, permissions]);

  const countryHoldProducts = useMemo(() => {
    const q = countryHoldSearch.trim().toLowerCase();
    const matchesSearch = (product) => {
      if (!q) return true;

      return (
        (product.name || "").toLowerCase().includes(q) ||
        (product.article_code || "").toLowerCase().includes(q) ||
        (product.sole_code || "").toLowerCase().includes(q) ||
        (product.color || "").toLowerCase().includes(q) ||
        (product.size || "").toLowerCase().includes(q)
      );
    };

    return countryOptions.map((countryCode) => ({
      countryCode,
      products: products.filter(
        (product) => matchesSearch(product) && activeUserCount(product.id, countryCode) === 0
      ),
      totalUsers: getUsersForCountry(countryCode).length,
    }));
  }, [activeUserCount, countryHoldSearch, countryOptions, getUsersForCountry, products]);

  const visiblePermissionsByCountry = useMemo(
    () =>
      countryOptions.map((countryCode) => ({
        countryCode,
        permissions: visiblePermissions.filter((permission) => {
          const permissionUser = usersById.get(Number(permission.user_id));
          return String(permissionUser?.country_code || "NP").toUpperCase() === countryCode;
        }),
      })),
    [countryOptions, usersById, visiblePermissions]
  );

  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * rowsPerPage;
    return filteredProducts.slice(start, start + rowsPerPage);
  }, [filteredProducts, productPage]);

  useEffect(() => {
    setProductPage(1);
  }, [accessFilter, accessSort, countryFilter, productSearch]);

  useEffect(() => {
    setCountryHoldPages({});
  }, [countryHoldSearch]);

  useEffect(() => {
    setOverviewPages({});
  }, [overviewSearch]);

  const toggleUser = (id) => {
    setSelectedUsers((current) =>
      current.includes(id)
        ? current.filter((userId) => userId !== id)
        : [...current, id]
    );
  };

  const toggleProduct = (id) => {
    setSelectedProducts((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id]
    );
  };

  const selectAllUsers = () => {
    setSelectedUsers(getUsersForCountry(countryFilter).map((item) => item.id));
  };

  const selectCountryUsers = (countryCode) => {
    setSelectedUsers(getUsersForCountry(countryCode).map((item) => item.id));
    setCountryFilter(countryCode);
  };

  const selectAllProducts = () => {
    setSelectedProducts(filteredProducts.map((item) => item.id));
  };

  const clearUsers = () => setSelectedUsers([]);
  const clearProducts = () => setSelectedProducts([]);
  const clearAll = () => {
    clearUsers();
    clearProducts();
  };

  const refreshAfterChange = async () => {
    await load();
    announceDataRefresh("permissions");
    announceDataRefresh("finished-goods");
    announceDataRefresh("finished-goods-user");
    announceDataRefresh("on-hold");
  };

  const requireSelection = () => {
    if (selectedUsers.length && selectedProducts.length) return true;

    showToast({
      tone: "error",
      title: "Selection required",
      message: "Select at least one user and one product.",
    });
    return false;
  };

  const showSelected = async () => {
    if (!requireSelection()) return;

    try {
      setSaving(true);

      await Promise.all(
        selectedProducts.map((productId) =>
          api.setFinishedGoodVisibility(productId, { is_visible: true }, token)
        )
      );

      await Promise.all(
        selectedUsers.map((userId) =>
          api.grantPermission(
            {
              user_id: Number(userId),
              finished_good_ids: selectedProducts.map(Number),
            },
            token
          )
        )
      );

      clearProducts();
      await refreshAfterChange();

      showToast({
        tone: "success",
        title: "Products displayed",
        message: "Selected products are visible to the selected users.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Display failed",
        message: error.message || "Could not update product permissions.",
      });
    } finally {
      setSaving(false);
    }
  };

  const hideSelected = async () => {
    if (!requireSelection()) return;

    try {
      setSaving(true);

      await Promise.all(
        selectedUsers.flatMap((userId) =>
          selectedProducts.map((productId) =>
            api.revokePermission(
              {
                user_id: Number(userId),
                finished_good_id: Number(productId),
              },
              token
            )
          )
        )
      );

      clearProducts();
      await refreshAfterChange();

      showToast({
        tone: "success",
        title: "Products hidden",
        message: "Selected users can no longer see those products.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Hide failed",
        message: error.message || "Could not hide selected products.",
      });
    } finally {
      setSaving(false);
    }
  };

  const hideSinglePermission = async (userId, productId) => {
    try {
      setSaving(true);

      await api.revokePermission(
        {
          user_id: Number(userId),
          finished_good_id: Number(productId),
        },
        token
      );

      await refreshAfterChange();

      showToast({
        tone: "success",
        title: "Product hidden",
        message: "That user can no longer see the selected product.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Hide failed",
        message: error.message || "Could not hide this product.",
      });
    } finally {
      setSaving(false);
    }
  };

  const showProductToCountry = async (productId, countryCode) => {
    const countryUsers = getUsersForCountry(countryCode);

    if (!countryUsers.length) {
      showToast({
        tone: "error",
        title: "No users",
        message: `There are no ${getCountryLabel(countryCode)} customers to show this product to.`,
      });
      return;
    }

    try {
      setSaving(true);

      await api.setFinishedGoodVisibility(productId, { is_visible: true }, token);
      await Promise.all(
        countryUsers.map((countryUser) =>
          api.grantPermission(
            {
              user_id: Number(countryUser.id),
              finished_good_ids: [Number(productId)],
            },
            token
          )
        )
      );

      await refreshAfterChange();

      showToast({
        tone: "success",
        title: "Product displayed",
        message: `Product is now visible to ${getCountryLabel(countryCode)} customers.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Display failed",
        message: error.message || "Could not show this product for the selected country.",
      });
    } finally {
      setSaving(false);
    }
  };

  const buildCountryHoldExportRows = (countryCode = "all") =>
    countryHoldProducts
      .filter((group) => countryCode === "all" || group.countryCode === countryCode)
      .flatMap((group) =>
        group.products.map((product) => ({
          Country: getCountryLabel(group.countryCode),
          "Product ID": product.id,
          Product: product.name || "",
          Article: product.article_code || "",
          Sole: product.sole_code || "",
          Color: product.color || "",
          Size: product.size || "",
          Stock: Number(product.quantity || 0),
          Unit: product.unit || "pairs",
          "Hidden From Customers": group.totalUsers,
        }))
      );

  const exportCountryHoldExcel = (countryCode = "all") => {
    const rows = buildCountryHoldExportRows(countryCode);

    if (!rows.length) {
      showToast({
        tone: "error",
        title: "Nothing to export",
        message: "No on-hold products found for the selected country.",
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 32 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 22 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Country On Hold");

    const scope = countryCode === "all" ? "all-countries" : getCountryLabel(countryCode).toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `country-on-hold-${scope}-${today}.xlsx`);
  };

  const getPageNumbers = (currentPage, totalPages) => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push("...");
    }

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  };

  const Pagination = ({ currentPage, totalItems, onPageChange }) => {
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (totalPages <= 1) return null;

    return (
      <div className="mt-4 flex flex-col items-center justify-between gap-3 px-2 sm:flex-row">
        <p className="text-sm text-slate-500">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          {getPageNumbers(currentPage, totalPages).map((page, index) =>
            page === "..." ? (
              <span key={`${page}-${index}`} className="px-2 text-sm text-slate-400">
                ...
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`h-8 min-w-8 rounded border px-2 text-sm font-medium ${
                  currentPage === page
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="mt-2 text-slate-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access Control"
        title="Permissions"
        description="Select users and products, then choose whether those products should be shown or hidden."
        icon="permission"
      />

      <div className="grid gap-3 md:grid-cols-2">
        {countryOptions.map((countryCode) => {
          const countryUsers = getUsersForCountry(countryCode);
          const onHoldCount =
            countryHoldProducts.find((item) => item.countryCode === countryCode)?.products.length || 0;

          return (
            <button
              key={countryCode}
              type="button"
              onClick={() => selectCountryUsers(countryCode)}
              className={`rounded-xl border p-4 text-left shadow-sm transition ${
                countryFilter === countryCode
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Country catalog</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {getCountryLabel(countryCode)}
                  </p>
                </div>
                <StatusBadge tone={onHoldCount ? "warning" : "success"}>
                  {onHoldCount} on hold
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {countryUsers.length} customer account{countryUsers.length === 1 ? "" : "s"}
              </p>
            </button>
          );
        })}
      </div>

      <SectionCard
        title="Select Users"
        subtitle="Users, members, and elders are always available for bulk permission changes."
        icon="users"
        actions={
          <>
            <Button variant="secondary" onClick={selectAllUsers}>
              {countryFilter === "all" ? "Select all users" : `Select ${getCountryLabel(countryFilter)} users`}
            </Button>
            <Button variant="ghost" onClick={clearUsers}>
              Deselect users
            </Button>
          </>
        }
      >
        <div className="space-y-5 p-4">
          {countryOptions.map((countryCode) => (
            <div key={countryCode}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {getCountryLabel(countryCode)}
                </h3>
                <button
                  type="button"
                  onClick={() => selectCountryUsers(countryCode)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Select {getCountryLabel(countryCode)} users
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {getUsersForCountry(countryCode).map((item) => {
                  const active = selectedUsers.includes(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleUser(item.id)}
                      className={`rounded-xl border p-4 text-left transition ${
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-semibold">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase text-slate-400">{item.role}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {getCountryLabel(item.country_code)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Select Products"
        subtitle="Checkboxes select rows for an action; access status is shown separately."
        icon="box"
        actions={
          <>
            <Button variant="secondary" onClick={selectAllProducts}>
              Select all products
            </Button>
            <Button variant="ghost" onClick={clearProducts}>
              Deselect products
            </Button>
            <Button variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
            <Button
              onClick={showSelected}
              disabled={saving || !selectedUsers.length || !selectedProducts.length}
              icon="eye"
            >
              Show selected
            </Button>
            <Button
              variant="danger"
              onClick={hideSelected}
              disabled={saving || !selectedUsers.length || !selectedProducts.length}
              icon="eyeOff"
            >
              Hide selected
            </Button>
          </>
        }
      >
        <div className="p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_180px_210px]">
            <input
              type="text"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search product name, article, sole, color, or size..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All countries</option>
              {countryOptions.map((countryCode) => (
                <option key={countryCode} value={countryCode}>
                  {getCountryLabel(countryCode)}
                </option>
              ))}
            </select>
            <select
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All access</option>
              <option value="visible">Visible only</option>
              <option value="on-hold">On hold only</option>
            </select>
            <select
              value={accessSort}
              onChange={(event) => setAccessSort(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="visible-desc">Most visible first</option>
              <option value="visible-asc">On hold first</option>
              <option value="name-asc">Product A-Z</option>
            </select>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3">Select</th>
                  <th className="p-3">Image</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Details</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Selected users</th>
                  <th className="p-3">Total access</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product) => {
                  const selected = selectedProducts.includes(product.id);
                  const selectedVisibleUsers = selectedUsers
                    .filter((userId) => hasAccess(userId, product.id))
                    .map((userId) => usersById.get(Number(userId)))
                    .filter(Boolean);
                  const selectedVisibleCount = selectedVisibleUsers.length;
                  const totalVisibleCount = activeUserCount(product.id, countryFilter);
                  const scopedUserCount = getUsersForCountry(countryFilter).length;
                  const onHold = totalVisibleCount === 0;

                  return (
                    <tr key={product.id} className="border-t hover:bg-slate-50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 cursor-pointer accent-indigo-600"
                        />
                      </td>
                      <td className="p-3">
                        {product.image_url ? (
                          <img
                            src={`${APP_BASE_URL}${product.image_url}`}
                            alt={product.name}
                            className="h-12 w-12 rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg border bg-slate-100" />
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-900">{product.name}</td>
                      <td className="p-3 text-slate-500">
                        <p>Article: {product.article_code || "-"}</p>
                        <p>Sole: {product.sole_code || "-"}</p>
                        <p>
                          {product.color || "-"} / {product.size || "-"}
                        </p>
                      </td>
                      <td className="p-3 text-slate-500">
                        {formatNumber(product.quantity)} {product.unit || "pairs"}
                      </td>
                      <td className="p-3">
                        {selectedUsers.length ? (
                          <div className="group relative inline-flex" tabIndex={0}>
                            <StatusBadge
                              tone={
                                selectedVisibleCount === selectedUsers.length
                                  ? "success"
                                  : selectedVisibleCount > 0
                                  ? "warning"
                                  : "neutral"
                              }
                            >
                              {selectedVisibleCount}/{selectedUsers.length} visible
                            </StatusBadge>
                            <div className="invisible absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-white opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                                Shown to selected users
                              </p>
                              {selectedVisibleUsers.length ? (
                                <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                                  {selectedVisibleUsers.map((visibleUser) => (
                                    <li key={visibleUser.id} className="rounded-lg bg-white/10 px-2.5 py-2">
                                      <p className="text-sm font-semibold">{visibleUser.name || visibleUser.email}</p>
                                      <p className="mt-0.5 text-xs text-slate-300">
                                        {[visibleUser.role, visibleUser.email, getCountryLabel(visibleUser.country_code)]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-amber-300">
                                  None of the selected users can see this product.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">No users selected</span>
                        )}
                      </td>
                      <td className="p-3">
                        <StatusBadge tone={onHold ? "neutral" : "success"}>
                          {onHold
                            ? countryFilter === "all"
                              ? "On hold"
                              : `On hold for ${getCountryLabel(countryFilter)}`
                            : `${totalVisibleCount}/${scopedUserCount} visible`}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={productPage}
            totalItems={filteredProducts.length}
            onPageChange={setProductPage}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Country On Hold"
        subtitle="Separate country tables. A product listed here is hidden from every customer in that country."
        icon="box"
      >
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <input
                type="text"
                value={countryHoldSearch}
                onChange={(event) => setCountryHoldSearch(event.target.value)}
                placeholder="Search on-hold product by name, article, sole, color, or size..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {countryHoldProducts.map(({ countryCode, products: countryProducts }) => (
                  <span
                    key={countryCode}
                    className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700"
                  >
                    {getCountryLabel(countryCode)}: {countryProducts.length} on hold
                  </span>
                ))}
                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() => exportCountryHoldExcel("all")}
                >
                  Export Excel
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {countryHoldProducts.map(({ countryCode, products: countryProducts, totalUsers }) => {
              const countryPage = countryHoldPages[countryCode] || 1;
              const start = (countryPage - 1) * rowsPerPage;
              const paginatedCountryProducts = countryProducts.slice(start, start + rowsPerPage);

              return (
                <div key={countryCode} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Country catalog
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-950">
                        {getCountryLabel(countryCode)} on hold
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {countryProducts.length} product{countryProducts.length === 1 ? "" : "s"} hidden from {totalUsers} customer{totalUsers === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={countryProducts.length ? "warning" : "success"}>
                        {countryProducts.length ? "Needs review" : "All shown"}
                      </StatusBadge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => selectCountryUsers(countryCode)}
                      >
                        Select {getCountryLabel(countryCode)} users
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="download"
                        onClick={() => exportCountryHoldExcel(countryCode)}
                      >
                        Export
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="min-w-[360px] px-5 py-3 text-xs font-semibold uppercase text-slate-500">Product</th>
                          <th className="min-w-[220px] px-5 py-3 text-xs font-semibold uppercase text-slate-500">Article / Sole</th>
                          <th className="min-w-[180px] px-5 py-3 text-xs font-semibold uppercase text-slate-500">Variant</th>
                          <th className="w-36 px-5 py-3 text-xs font-semibold uppercase text-slate-500">Stock</th>
                          <th className="w-48 px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCountryProducts.length ? (
                          paginatedCountryProducts.map((product) => (
                            <tr key={`${countryCode}-${product.id}`} className="border-t hover:bg-slate-50">
                              <td className="px-5 py-4">
                                <div className="flex min-w-0 items-center gap-4">
                                  {product.image_url ? (
                                    <img
                                      src={`${APP_BASE_URL}${product.image_url}`}
                                      alt={product.name}
                                      className="h-16 w-16 shrink-0 rounded-xl border object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border bg-slate-100 text-xs text-slate-400">
                                      No image
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-base font-semibold text-slate-950">{product.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">FG.ID {product.id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-slate-600">
                                <p className="font-semibold text-slate-900">{product.article_code || "-"}</p>
                                <p className="mt-1 text-xs text-slate-500">{product.sole_code || "No sole code"}</p>
                              </td>
                              <td className="px-5 py-4 text-slate-600">
                                <p className="font-medium text-slate-900">
                                  {[product.color, product.size].filter(Boolean).join(" / ") || "-"}
                                </p>
                              </td>
                              <td className="px-5 py-4 font-semibold text-slate-900">
                                {formatNumber(product.quantity)} {product.unit || "pairs"}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Button
                                  size="sm"
                                  icon="eye"
                                  disabled={saving || !totalUsers}
                                  onClick={() => showProductToCountry(product.id, countryCode)}
                                >
                                  Show
                                </Button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="p-10 text-center text-slate-500" colSpan={5}>
                              No on-hold products for {getCountryLabel(countryCode)}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-100 px-5 pb-4 pt-1">
                    <Pagination
                      currentPage={countryPage}
                      totalItems={countryProducts.length}
                      onPageChange={(page) =>
                        setCountryHoldPages((current) => ({ ...current, [countryCode]: page }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="System Overview"
        subtitle="Active user-product access grouped by country. Revoked products are excluded."
        icon="dashboard"
      >
        <div className="p-4">
          <input
            type="text"
            value={overviewSearch}
            onChange={(event) => setOverviewSearch(event.target.value)}
            placeholder="Search user, role, email, product, article, sole, or color..."
            className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />

          <div className="space-y-5">
            {visiblePermissionsByCountry.map(({ countryCode, permissions: countryPermissions }) => {
              const countryPage = overviewPages[countryCode] || 1;
              const start = (countryPage - 1) * rowsPerPage;
              const paginatedCountryPermissions = countryPermissions.slice(start, start + rowsPerPage);

              return (
                <div key={countryCode} className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                    <h3 className="font-semibold text-slate-950">{getCountryLabel(countryCode)}</h3>
                    <StatusBadge tone={countryPermissions.length ? "success" : "neutral"}>
                      {countryPermissions.length} active
                    </StatusBadge>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white">
                        <tr>
                          <th className="p-3">User</th>
                          <th className="p-3">Role</th>
                          <th className="p-3">Email</th>
                          <th className="p-3">Product</th>
                          <th className="p-3">Details</th>
                          <th className="p-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCountryPermissions.length ? (
                          paginatedCountryPermissions.map((permission) => (
                            <tr
                              key={`${countryCode}-${permission.user_id}-${permission.finished_good_id}-${permission.id}`}
                              className="border-t hover:bg-slate-50"
                            >
                              <td className="p-3 font-medium text-slate-900">{permission.user_name}</td>
                              <td className="p-3 text-slate-500">{permission.user_role || "-"}</td>
                              <td className="p-3 text-slate-500">{permission.email}</td>
                              <td className="p-3">{permission.product_name}</td>
                              <td className="p-3 text-slate-500">
                                <p>Article: {permission.article_code || "-"}</p>
                                <p>Sole: {permission.sole_code || "-"}</p>
                                <p>
                                  {permission.color || "-"} / {permission.size || "-"}
                                </p>
                              </td>
                              <td className="p-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    hideSinglePermission(
                                      permission.user_id,
                                      permission.finished_good_id
                                    )
                                  }
                                  className="text-sm font-medium text-red-600 hover:underline"
                                >
                                  Hide
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="p-6 text-center text-slate-500" colSpan={6}>
                              No active permissions for {getCountryLabel(countryCode)}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 pb-4">
                    <Pagination
                      currentPage={countryPage}
                      totalItems={countryPermissions.length}
                      onPageChange={(page) =>
                        setOverviewPages((current) => ({ ...current, [countryCode]: page }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
