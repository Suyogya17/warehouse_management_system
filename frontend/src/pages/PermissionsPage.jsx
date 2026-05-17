import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

const managedRoles = new Set(["USER", "MEMBER", "ELDER"]);
const rowsPerPage = 10;

export default function PermissionsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("all");
  const [accessSort, setAccessSort] = useState("visible-desc");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [overviewPage, setOverviewPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const isAuthorized = user && ["ADMIN", "CO_ADMIN"].includes(user.role);

  const load = useCallback(async () => {
    const [usersRes, productsRes, permissionsRes] = await Promise.all([
      api.getUsers(token),
      api.getFinishedGoods(token),
      api.getPermissions(token),
    ]);

    setUsers((usersRes.data || []).filter((item) => managedRoles.has(item.role)));
    setProducts(productsRes.data || []);
    setPermissions(permissionsRes.data || []);
  }, [token]);

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

  const activeUserCount = useCallback(
    (productId) =>
      users.filter((item) => hasAccess(item.id, productId)).length,
    [hasAccess, users]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products
      .filter((product) => {
        const totalVisible = activeUserCount(product.id);

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
        const aCount = activeUserCount(a.id);
        const bCount = activeUserCount(b.id);

        if (accessSort === "visible-asc") return aCount - bCount;
        if (accessSort === "visible-desc") return bCount - aCount;
        if (accessSort === "name-asc") {
          return (a.name || "").localeCompare(b.name || "");
        }

        return 0;
      });
  }, [accessFilter, accessSort, activeUserCount, products, productSearch]);

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

  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * rowsPerPage;
    return filteredProducts.slice(start, start + rowsPerPage);
  }, [filteredProducts, productPage]);

  const paginatedOverview = useMemo(() => {
    const start = (overviewPage - 1) * rowsPerPage;
    return visiblePermissions.slice(start, start + rowsPerPage);
  }, [overviewPage, visiblePermissions]);

  useEffect(() => {
    setProductPage(1);
  }, [accessFilter, accessSort, productSearch]);

  useEffect(() => {
    setOverviewPage(1);
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
    setSelectedUsers(users.map((item) => item.id));
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

  const Pagination = ({ currentPage, totalItems, onPageChange }) => {
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (totalPages <= 1) return null;

    return (
      <div className="mt-4 flex items-center justify-between px-2">
        <p className="text-sm text-slate-500">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
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

      <SectionCard
        title="Select Users"
        subtitle="Users, members, and elders are always available for bulk permission changes."
        icon="users"
        actions={
          <>
            <Button variant="secondary" onClick={selectAllUsers}>
              Select all users
            </Button>
            <Button variant="ghost" onClick={clearUsers}>
              Deselect users
            </Button>
          </>
        }
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((item) => {
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
                <p className="mt-2 text-xs font-medium uppercase text-slate-400">{item.role}</p>
              </button>
            );
          })}
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
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_210px]">
            <input
              type="text"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search product name, article, sole, color, or size..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
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
                  const selectedVisibleCount = selectedUsers.filter((userId) =>
                    hasAccess(userId, product.id)
                  ).length;
                  const totalVisibleCount = activeUserCount(product.id);
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
                        ) : (
                          <span className="text-slate-400">No users selected</span>
                        )}
                      </td>
                      <td className="p-3">
                        <StatusBadge tone={onHold ? "neutral" : "success"}>
                          {onHold ? "On hold" : `${totalVisibleCount} visible`}
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
        title="System Overview"
        subtitle="Active user-product access only. Revoked products are excluded."
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

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
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
                {paginatedOverview.length ? (
                  paginatedOverview.map((permission) => (
                    <tr
                      key={`${permission.user_id}-${permission.finished_good_id}-${permission.id}`}
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
                      No active permissions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={overviewPage}
            totalItems={visiblePermissions.length}
            onPageChange={setOverviewPage}
          />
        </div>
      </SectionCard>
    </div>
  );
}
