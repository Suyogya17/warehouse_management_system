import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber, formatPrice } from "../utils/format";
import { canManageProductVisibility } from "../utils/pagePermissions";
import { getCommissionLabel, isCommissionProduct } from "../utils/commission";

const DEFAULT_DISPLAY_QUANTITY = 450;
const managedUserRoles = new Set(["USER", "MEMBER", "ELDER"]);

const getPairs = (item) => Number(item.quantity || 0);

const getDisplayLimit = (item) =>
  Math.min(DEFAULT_DISPLAY_QUANTITY, Math.max(0, Math.floor(getPairs(item))));

const getSavedDisplayQuantity = (item) => {
  const savedValue = Number(item.display_quantity);

  if (!Number.isFinite(savedValue) || savedValue < 0) return getDisplayLimit(item);

  return Math.min(Math.floor(savedValue), getDisplayLimit(item));
};

const getCartons = (item) => {
  const pairs = getPairs(item);
  const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);

  return pairsPerCarton > 0 ? Math.floor(pairs / pairsPerCarton) : 0;
};

const getArticleKey = (item) =>
  item.article_code || item.name?.split("_")?.[0] || `product-${item.id}`;

const buildArticleGroups = (products = []) => {
  const groups = new Map();

  products.forEach((item) => {
    const key = getArticleKey(item);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        articleCode: item.article_code || key,
        items: [],
      });
    }

    groups.get(key).items.push(item);
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    displayOrder: Math.min(
      ...group.items.map((item) => Number(item.display_order || 999999))
    ),
    totalPairs: group.items.reduce((sum, item) => sum + getPairs(item), 0),
    totalCartons: group.items.reduce((sum, item) => sum + getCartons(item), 0),
    visibleCount: group.items.filter((item) => item.is_visible).length,
  }));
};

export default function ProductDisplayPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [displayInputs, setDisplayInputs] = useState({});
  const [priceInputs, setPriceInputs] = useState({});
  const [savingDisplayId, setSavingDisplayId] = useState(null);
  const [savingPriceId, setSavingPriceId] = useState(null);
  const [savingUserProductKey, setSavingUserProductKey] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserProductSearch, setSelectedUserProductSearch] = useState("");
  const [selectedUserProductMode, setSelectedUserProductMode] = useState("shown");
  const [selectedUserProductPage, setSelectedUserProductPage] = useState(1);
  const [savingOrder, setSavingOrder] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const userProductsPerPage = 10;
  const isAuthorized = canManageProductVisibility(user);

  const loadItems = useCallback(async () => {
    if (!isAuthorized) return;

    const [productsResult, permissionsResult, usersResult] = await Promise.all([
      api.getFinishedGoods(token),
      api.getPermissions(token),
      api.getUsers(token),
    ]);
    setItems(productsResult.data || []);
    setPermissions(permissionsResult.data || []);
    setUsers((usersResult.data || []).filter((item) => managedUserRoles.has(item.role)));
  }, [isAuthorized, token]);

  useEffect(() => {
    if (!isAuthorized) return;

    loadItems().catch(console.error);
  }, [isAuthorized, loadItems]);

  useEffect(() => {
    setDisplayInputs((current) => {
      const next = {};
      items.forEach((item) => {
        next[item.id] = current[item.id] ?? String(getSavedDisplayQuantity(item));
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    setPriceInputs((current) => {
      const next = {};
      items.forEach((item) => {
        next[item.id] = current[item.id] ?? String(item.price ?? 0);
      });
      return next;
    });
  }, [items]);

  useDataRefresh(loadItems, "finished-goods");

  const articleGroups = useMemo(() => buildArticleGroups(items), [items]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return articleGroups;

    return articleGroups.filter((group) =>
      group.items.some((item) =>
        [item.id, item.name, item.article_code, item.sole_code, item.color, item.size]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
    );
  }, [articleGroups, search]);

  const visibleCount = items.filter((item) => item.is_visible).length;
  const visibleUsersByProduct = useMemo(() => {
    const denied = new Set(
      permissions
        .filter((permission) => Number(permission.can_view) === 0)
        .map(
          (permission) =>
            `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
        )
    );
    const usersByProduct = new Map();

    permissions.forEach((permission) => {
      const productId = Number(permission.finished_good_id);
      const key = `${Number(permission.user_id)}:${productId}`;

      if (Number(permission.can_view) !== 1 || denied.has(key)) return;
      if (!usersByProduct.has(productId)) usersByProduct.set(productId, []);

      const productUsers = usersByProduct.get(productId);
      if (productUsers.some((user) => Number(user.id) === Number(permission.user_id))) return;

      productUsers.push({
        id: permission.user_id,
        name: permission.user_name || permission.email || `User #${permission.user_id}`,
        email: permission.email,
        role: permission.user_role,
      });
    });

    usersByProduct.forEach((productUsers) =>
      productUsers.sort((a, b) => a.name.localeCompare(b.name))
    );

    return usersByProduct;
  }, [permissions]);

  useEffect(() => {
    if (selectedUserId || !users.length) return;
    setSelectedUserId(String(users[0].id));
  }, [selectedUserId, users]);

  const permissionState = useMemo(() => {
    const granted = new Set();
    const denied = new Set();

    permissions.forEach((permission) => {
      const key = `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`;

      if (Number(permission.can_view) === 1) granted.add(key);
      if (Number(permission.can_view) === 0) denied.add(key);
    });

    return { granted, denied };
  }, [permissions]);

  const selectedUser = users.find((item) => String(item.id) === String(selectedUserId));

  const isProductShownToSelectedUser = useCallback(
    (product) => {
      if (!selectedUserId || !product) return false;

      const key = `${Number(selectedUserId)}:${Number(product.id)}`;

      return Number(product.is_visible) === 1 && permissionState.granted.has(key) && !permissionState.denied.has(key);
    },
    [permissionState, selectedUserId]
  );

  const selectedUserProducts = useMemo(() => {
    const q = selectedUserProductSearch.trim().toLowerCase();
    const matchesSearch = (product) => {
      if (!q) return true;

      return [product.id, product.name, product.article_code, product.sole_code, product.color, product.size]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    };

    const shown = [];
    const hidden = [];

    items.filter(matchesSearch).forEach((product) => {
      if (isProductShownToSelectedUser(product)) {
        shown.push(product);
      } else {
        hidden.push(product);
      }
    });

    return { shown, hidden };
  }, [isProductShownToSelectedUser, items, selectedUserProductSearch]);

  const selectedUserProductList =
    selectedUserProductMode === "shown" ? selectedUserProducts.shown : selectedUserProducts.hidden;
  const selectedUserProductTotalPages = Math.max(
    1,
    Math.ceil(selectedUserProductList.length / userProductsPerPage)
  );
  const paginatedSelectedUserProducts = selectedUserProductList.slice(
    (selectedUserProductPage - 1) * userProductsPerPage,
    selectedUserProductPage * userProductsPerPage
  );
  const totalPages = Math.ceil(filteredGroups.length / rowsPerPage);
  const paginatedGroups = filteredGroups.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const getPageNumbers = () => {
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

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setSelectedUserProductPage(1);
  }, [selectedUserId, selectedUserProductMode, selectedUserProductSearch]);

  useEffect(() => {
    setSelectedUserProductPage((page) =>
      page > selectedUserProductTotalPages ? selectedUserProductTotalPages : page
    );
  }, [selectedUserProductTotalPages]);

  const saveOrder = async (nextGroups) => {
    const nextItems = nextGroups.flatMap((group) => group.items);

    await api.updateFinishedGoodDisplayOrder(nextItems.map((item) => item.id), token);
    setItems(nextItems.map((item, index) => ({ ...item, display_order: index + 1 })));
    announceDataRefresh("finished-goods");
  };

  const moveArticleGroup = async (group, target) => {
    if (savingOrder) return;

    const currentIndex = articleGroups.findIndex((item) => item.key === group.key);
    if (currentIndex === -1) return;

    const nextGroups = [...articleGroups];
    const [selected] = nextGroups.splice(currentIndex, 1);
    let nextIndex = currentIndex;

    if (target === "top") nextIndex = 0;
    if (target === "up") nextIndex = Math.max(0, currentIndex - 1);
    if (target === "down") nextIndex = Math.min(nextGroups.length, currentIndex + 1);
    if (target === "bottom") nextIndex = nextGroups.length;

    nextGroups.splice(nextIndex, 0, selected);

    try {
      setSavingOrder(true);
      await saveOrder(nextGroups);
      showToast({
        tone: "success",
        title: "Article position updated",
        message: "Users will see this article-code card in the new order.",
      });
    } catch (error) {
      showToast({ tone: "error", title: "Position update failed", message: error.message });
    } finally {
      setSavingOrder(false);
    }
  };

  const toggleVisibility = async (item) => {
    try {
      await api.setFinishedGoodVisibility(item.id, { is_visible: !item.is_visible }, token);
      setItems((current) =>
        current.map((product) =>
          Number(product.id) === Number(item.id)
            ? { ...product, is_visible: item.is_visible ? 0 : 1 }
            : product
        )
      );
      announceDataRefresh("finished-goods");
      showToast({
        tone: "success",
        title: item.is_visible ? "Product hidden" : "Product displayed",
        message: item.is_visible
          ? "Users will not see this product."
          : "Users can now see this product.",
      });
    } catch (error) {
      showToast({ tone: "error", title: "Visibility update failed", message: error.message });
    }
  };

  const setProductForSelectedUser = async (product, shouldShow) => {
    if (!selectedUserId || !product) return;

    const key = `${selectedUserId}:${product.id}`;
    const label = product.article_code || product.name || `Product #${product.id}`;
    const userLabel = selectedUser?.name || selectedUser?.email || "selected user";

    try {
      setSavingUserProductKey(key);

      if (shouldShow) {
        if (Number(product.is_visible) !== 1) {
          await api.setFinishedGoodVisibility(product.id, { is_visible: true }, token);
        }

        await api.grantPermission(
          {
            user_id: Number(selectedUserId),
            finished_good_ids: [Number(product.id)],
          },
          token
        );
      } else {
        await api.revokePermission(
          {
            user_id: Number(selectedUserId),
            finished_good_id: Number(product.id),
          },
          token
        );
      }

      await loadItems();
      announceDataRefresh("permissions");
      announceDataRefresh("finished-goods");
      announceDataRefresh("finished-goods-user");
      announceDataRefresh("on-hold");

      showToast({
        tone: "success",
        title: shouldShow ? "Product shown" : "Product hidden",
        message: `${label} is now ${shouldShow ? "shown to" : "hidden from"} ${userLabel}.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: shouldShow ? "Show failed" : "Hide failed",
        message: error.message || "Could not update this user's product access.",
      });
    } finally {
      setSavingUserProductKey("");
    }
  };

  const renderUserProductTable = (products, mode) => {
    if (!selectedUserId) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          Select a user to review their product display.
        </div>
      );
    }

    if (!products.length) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No products in this list.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="min-w-64 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Product</th>
              <th className="min-w-48 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Variant</th>
              <th className="w-36 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Stock</th>
              <th className="w-40 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Catalog</th>
              <th className="w-32 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product) => {
              const saving = savingUserProductKey === `${selectedUserId}:${product.id}`;
              const globallyVisible = Number(product.is_visible) === 1;
              const actionIsShow = mode !== "shown";

              return (
                <tr key={`${mode}-${product.id}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {product.image_url ? (
                        <img
                          src={`${APP_BASE_URL}${product.image_url}`}
                          alt={product.article_code || product.name}
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                          No image
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {product.article_code || product.name || `Product #${product.id}`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">FG.ID {product.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">
                      {[product.color, product.size].filter(Boolean).join(" / ") || "-"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{product.sole_code || "No sole code"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                    {formatNumber(product.quantity)} {product.unit || "pairs"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={globallyVisible ? "success" : "neutral"}>
                      {globallyVisible ? "Displayed" : "Global hidden"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant={actionIsShow ? "primary" : "secondary"}
                      size="sm"
                      icon={actionIsShow ? "eye" : "eyeOff"}
                      disabled={saving}
                      onClick={() => setProductForSelectedUser(product, actionIsShow)}
                    >
                      {saving ? "Saving" : actionIsShow ? "Show" : "Hide"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const saveDisplayQuantity = async (item) => {
    const displayQuantity = Number(displayInputs[item.id]);

    if (!Number.isFinite(displayQuantity) || displayQuantity < 0) {
      showToast({
        tone: "error",
        title: "Invalid visible pairs",
        message: "Enter 0 or a positive number.",
      });
      return;
    }

    try {
      setSavingDisplayId(item.id);
      const result = await api.updateFinishedGoodDisplayQuantity(
        item.id,
        Math.floor(displayQuantity),
        token
      );
      const savedDisplayQuantity = Number(result.data?.display_quantity ?? displayQuantity);
      setItems((current) =>
        current.map((product) =>
          Number(product.id) === Number(item.id)
            ? { ...product, display_quantity: savedDisplayQuantity }
            : product
        )
      );
      setDisplayInputs((current) => ({
        ...current,
        [item.id]: String(savedDisplayQuantity),
      }));
      announceDataRefresh("finished-goods");
      showToast({
        tone: "success",
        title: "Visible pairs updated",
        message: `${item.article_code || item.name} now shows up to ${formatNumber(savedDisplayQuantity)} pairs to users.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Visible pairs update failed",
        message: error.data?.message || error.message,
      });
    } finally {
      setSavingDisplayId(null);
    }
  };

  const savePrice = async (item) => {
    const price = Number(priceInputs[item.id]);

    if (!Number.isFinite(price) || price < 0) {
      showToast({ tone: "error", title: "Invalid price", message: "Enter 0 or a positive amount." });
      return;
    }

    try {
      setSavingPriceId(item.id);
      const result = await api.updateFinishedGoodPrice(item.id, price, token);
      const savedPrice = Number(result.data?.price ?? price);
      setItems((current) =>
        current.map((product) =>
          Number(product.id) === Number(item.id) ? { ...product, price: savedPrice } : product
        )
      );
      setPriceInputs((current) => ({ ...current, [item.id]: String(savedPrice) }));
      announceDataRefresh("finished-goods");
      showToast({
        tone: "success",
        title: "Price updated",
        message: `${item.article_code || item.name} is now ${formatPrice(savedPrice)}.`,
      });
    } catch (error) {
      showToast({ tone: "error", title: "Price update failed", message: error.data?.message || error.message });
    } finally {
      setSavingPriceId(null);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          You do not have permission to manage product show/hide.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catalog control"
        title="Product Display"
        description="Control each product's price, visible stock, visibility, and display order."
        icon="eye"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Shown to users</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{visibleCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Hidden from users</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length - visibleCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Article groups</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{articleGroups.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total variants</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
      </div>

      <div className="order-2">
        <SectionCard
          title="User Product Display"
          subtitle="Select one user to see which products are shown or hidden for that account."
          icon="users"
        >
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,340px)_1fr_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                User
              </label>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.email} ({item.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search products
              </label>
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={selectedUserProductSearch}
                  onChange={(event) => setSelectedUserProductSearch(event.target.value)}
                  placeholder="Search article, color, size, or FG.ID..."
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:w-56">
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Shown</p>
                <p className="text-lg font-semibold text-emerald-700">{selectedUserProducts.shown.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Hidden</p>
                <p className="text-lg font-semibold text-slate-800">{selectedUserProducts.hidden.length}</p>
              </div>
            </div>
          </div>

          {selectedUser ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="inline-flex h-9 items-center rounded-lg bg-white px-3 font-semibold text-slate-900 ring-1 ring-slate-200">
                {selectedUser.name || selectedUser.email}
              </span>
              <span className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                {selectedUser.role}
              </span>
              {selectedUser.email ? <span className="text-sm text-slate-500">{selectedUser.email}</span> : null}
            </div>
          ) : null}

          <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {[
              { key: "shown", label: "Shown", count: selectedUserProducts.shown.length, icon: "eye" },
              { key: "hidden", label: "Hidden", count: selectedUserProducts.hidden.length, icon: "eyeOff" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedUserProductMode(option.key)}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                  selectedUserProductMode === option.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon name={option.icon} className="h-4 w-4" />
                {option.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    selectedUserProductMode === option.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedUserProductMode === "shown" ? "Shown products" : "Hidden products"}
            </h3>
            <StatusBadge tone={selectedUserProductMode === "shown" ? "success" : "neutral"}>
              {selectedUserProductList.length} products
            </StatusBadge>
          </div>
          {renderUserProductTable(paginatedSelectedUserProducts, selectedUserProductMode)}
          {selectedUserId && selectedUserProductList.length ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
              <p className="text-sm text-slate-500">
                Showing {(selectedUserProductPage - 1) * userProductsPerPage + 1}-
                {Math.min(selectedUserProductPage * userProductsPerPage, selectedUserProductList.length)} of{" "}
                {selectedUserProductList.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedUserProductPage === 1}
                  onClick={() => setSelectedUserProductPage((page) => Math.max(1, page - 1))}
                >
                  Prev
                </Button>
                <span className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  Page {selectedUserProductPage} of {selectedUserProductTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedUserProductPage === selectedUserProductTotalPages}
                  onClick={() =>
                    setSelectedUserProductPage((page) =>
                      Math.min(selectedUserProductTotalPages, page + 1)
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        </SectionCard>
      </div>

      <div className="order-1">
        <SectionCard
          title="Customer Catalog Controls"
          subtitle="Visible pairs is the maximum stock number customers can see and order for that exact variant."
          icon="finishedGoods"
        >
        <div className="grid gap-3 border-b border-slate-100 px-6 py-4 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Physical stock</p>
            <p className="mt-1 text-sm text-slate-700">Actual pairs in warehouse.</p>
          </div>
          <div className="rounded-lg bg-indigo-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Users see up to</p>
            <p className="mt-1 text-sm text-indigo-900">Maximum pairs shown to customers.</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Show / hide</p>
            <p className="mt-1 text-sm text-emerald-900">Controls whether customers see the variant.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 sm:max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>{filteredGroups.length} article codes shown</span>
            {savingOrder ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                Saving order...
              </span>
            ) : null}
          </div>
        </div>

        <div className="mx-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead className="bg-indigo-50">
              <tr>
                <th className="w-24 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Order</th>
                <th className="min-w-56 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Product</th>
                <th className="min-w-[560px] px-4 py-3 text-xs font-semibold uppercase text-slate-500">Variant controls</th>
                <th className="w-36 px-4 py-3 text-xs font-semibold uppercase text-slate-500">Group status</th>
                <th className="w-44 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Move</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedGroups.map((group) => (
                <tr key={group.key} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-5">
                    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-800">
                      {articleGroups.findIndex((item) => item.key === group.key) + 1}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm font-semibold text-slate-900">
                    <div className="flex items-start gap-3">
                      {group.items.find((item) => item.image_url)?.image_url ? (
                        <img
                          src={`${APP_BASE_URL}${group.items.find((item) => item.image_url).image_url}`}
                          alt={group.articleCode}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                          No image
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{group.articleCode}</p>
                        <p className="mt-1 text-sm text-slate-500">{group.items.length} variants</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatNumber(group.totalPairs)} physical pairs
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatNumber(group.totalCartons)} CTN
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-sm text-slate-700">
                    <div className="space-y-3">
                      {group.items.map((item) => {
                        const savedValue = getSavedDisplayQuantity(item);
                        const inputValue = displayInputs[item.id] ?? String(savedValue);
                        const hasChanged = Number(inputValue) !== savedValue;
                        const physicalPairs = getPairs(item);
                        const customerVisiblePairs = Math.min(savedValue, physicalPairs);
                        const savedPrice = Number(item.price || 0);
                        const priceInput = priceInputs[item.id] ?? String(savedPrice);
                        const priceChanged = Number(priceInput) !== savedPrice;
                        const visibleUsers = item.is_visible
                          ? visibleUsersByProduct.get(Number(item.id)) || []
                          : [];

                        return (
                          <div
                            key={item.id}
                            className="grid gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 md:grid-cols-[minmax(130px,1.2fr)_minmax(180px,1fr)_minmax(230px,1.2fr)_minmax(210px,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Variant #{item.id}
                              </p>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                {item.color || "No color"} / {item.size || "No size"}
                              </p>
                              <StatusBadge tone={item.is_visible ? "success" : "neutral"}>
                                {item.is_visible ? "Shown to users" : "Hidden from users"}
                              </StatusBadge>
                              <div className="mt-2">
                                <StatusBadge tone={isCommissionProduct(item) ? "warning" : "neutral"}>
                                  {getCommissionLabel(item)}
                                </StatusBadge>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <p className="text-xs text-slate-500">Physical</p>
                                <p className="font-semibold text-slate-900">
                                  {formatNumber(physicalPairs)}
                                </p>
                              </div>
                              <div className="rounded-lg bg-slate-50 px-3 py-2">
                                <p className="text-xs text-slate-500">User sees</p>
                                <p className="font-semibold text-indigo-700">
                                  {formatNumber(customerVisiblePairs)}
                                </p>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                Users see up to
                              </label>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={inputValue}
                                  onChange={(event) =>
                                    setDisplayInputs((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                  className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                />
                                <span className="text-sm text-slate-500">pairs</span>
                                <Button
                                  type="button"
                                  variant={hasChanged ? "primary" : "secondary"}
                                  size="sm"
                                  icon="check"
                                  disabled={!hasChanged || savingDisplayId === item.id}
                                  onClick={() => saveDisplayQuantity(item)}
                                >
                                  {savingDisplayId === item.id ? "Saving" : "Save"}
                                </Button>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                Price (NPR)
                              </label>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={priceInput}
                                  onChange={(event) =>
                                    setPriceInputs((current) => ({ ...current, [item.id]: event.target.value }))
                                  }
                                  className="h-10 w-28 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                />
                                <Button
                                  type="button"
                                  variant={priceChanged ? "primary" : "secondary"}
                                  size="sm"
                                  icon="check"
                                  disabled={!priceChanged || savingPriceId === item.id}
                                  onClick={() => savePrice(item)}
                                >
                                  {savingPriceId === item.id ? "Saving" : "Save"}
                                </Button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 justify-start md:justify-end">
                              <div className="group relative">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  icon="users"
                                  iconOnly
                                  className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                  aria-label={`View users with access to ${item.article_code || item.name || `variant ${item.id}`}`}
                                >
                                  View users
                                </Button>
                                <div
                                  role="tooltip"
                                  style={{ backgroundColor: "#020617" }}
                                  className="invisible absolute bottom-full right-0 z-30 w-72 rounded-xl border border-slate-700 p-3 text-left text-white shadow-2xl group-hover:visible group-focus-within:visible"
                                >
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    Visible to {visibleUsers.length} {visibleUsers.length === 1 ? "user" : "users"}
                                  </p>
                                  {!item.is_visible ? (
                                    <p className="mt-2 text-sm text-amber-300">This product is hidden from everyone.</p>
                                  ) : visibleUsers.length ? (
                                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto overscroll-contain pr-1">
                                      {visibleUsers.map((visibleUser) => (
                                        <li key={visibleUser.id} className="rounded-lg bg-white/10 px-2.5 py-2">
                                          <p className="text-sm font-semibold">{visibleUser.name}</p>
                                          <p className="mt-0.5 text-xs text-slate-300">
                                            {[visibleUser.role, visibleUser.email].filter(Boolean).join(" · ")}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-2 text-sm text-amber-300">No users currently have access.</p>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant={item.is_visible ? "secondary" : "primary"}
                                size="sm"
                                icon={item.is_visible ? "eyeOff" : "eye"}
                                iconOnly
                                aria-label={item.is_visible ? "Hide product" : "Show product"}
                                title={item.is_visible ? "Hide product" : "Show product"}
                                onClick={() => toggleVisibility(item)}
                              >
                                {item.is_visible ? "Hide product" : "Show product"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-5">
                    <StatusBadge tone={group.visibleCount ? "success" : "neutral"}>
                      {group.visibleCount}/{group.items.length} shown
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" icon="moveTop" iconOnly title="Move to top" disabled={savingOrder} onClick={() => moveArticleGroup(group, "top")}>
                        Move to top
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="arrowUp" iconOnly title="Move up" disabled={savingOrder} onClick={() => moveArticleGroup(group, "up")}>
                        Move up
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="arrowDown" iconOnly title="Move down" disabled={savingOrder} onClick={() => moveArticleGroup(group, "down")}>
                        Move down
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="moveBottom" iconOnly title="Move to bottom" disabled={savingOrder} onClick={() => moveArticleGroup(group, "bottom")}>
                        Move to bottom
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredGroups.length ? (
          <div className="mx-6 rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No products found.
          </div>
        ) : null}

        {filteredGroups.length ? (
          <div className="mx-6 mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pb-2 pt-4 sm:flex-row">
            <p className="text-sm text-slate-500">
              Showing {(currentPage - 1) * rowsPerPage + 1}-
              {Math.min(currentPage * rowsPerPage, filteredGroups.length)} of {filteredGroups.length}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Prev
              </Button>
              {getPageNumbers().map((page, index) =>
                page === "..." ? (
                  <span key={`${page}-${index}`} className="px-2 text-sm text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-medium transition ${
                      currentPage === page
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-indigo-50"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
