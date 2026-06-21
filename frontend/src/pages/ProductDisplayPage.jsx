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

const getPairs = (item) => Number(item.quantity || 0);

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
  const { token } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [displayInputs, setDisplayInputs] = useState({});
  const [savingDisplayId, setSavingDisplayId] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const loadItems = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    loadItems().catch(console.error);
  }, [loadItems]);

  useEffect(() => {
    setDisplayInputs((current) => {
      const next = {};
      items.forEach((item) => {
        next[item.id] = current[item.id] ?? String(item.display_quantity ?? 450);
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

  const saveOrder = async (nextGroups) => {
    const nextItems = nextGroups.flatMap((group) => group.items);

    await api.updateFinishedGoodDisplayOrder(nextItems.map((item) => item.id), token);
    setItems(nextItems.map((item, index) => ({ ...item, display_order: index + 1 })));
    announceDataRefresh("finished-goods");
  };

  const moveArticleGroup = async (group, target) => {
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
      await saveOrder(nextGroups);
      showToast({
        tone: "success",
        title: "Article position updated",
        message: "Users will see this article-code card in the new order.",
      });
    } catch (error) {
      showToast({ tone: "error", title: "Position update failed", message: error.message });
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog control"
        title="Product Display"
        description="Control the customer catalog for each product: visible stock, visibility, and display order."
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
          <p className="text-sm text-slate-500">{filteredGroups.length} article codes shown</p>
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
                        const savedValue = Number(item.display_quantity ?? 450);
                        const inputValue = displayInputs[item.id] ?? String(savedValue);
                        const hasChanged = Number(inputValue) !== savedValue;
                        const physicalPairs = getPairs(item);
                        const customerVisiblePairs = Math.min(savedValue, physicalPairs);

                        return (
                          <div
                            key={item.id}
                            className="grid gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 md:grid-cols-[minmax(130px,1.2fr)_minmax(180px,1fr)_minmax(230px,1.2fr)_auto]"
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

                            <div className="flex items-center justify-start md:justify-end">
                              <Button
                                type="button"
                                variant={item.is_visible ? "secondary" : "primary"}
                                size="sm"
                                icon={item.is_visible ? "eyeOff" : "eye"}
                                onClick={() => toggleVisibility(item)}
                              >
                                {item.is_visible ? "Hide" : "Show"}
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
                      <Button type="button" variant="ghost" size="sm" icon="moveTop" iconOnly title="Move to top" onClick={() => moveArticleGroup(group, "top")}>
                        Move to top
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="arrowUp" iconOnly title="Move up" onClick={() => moveArticleGroup(group, "up")}>
                        Move up
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="arrowDown" iconOnly title="Move down" onClick={() => moveArticleGroup(group, "down")}>
                        Move down
                      </Button>
                      <Button type="button" variant="ghost" size="sm" icon="moveBottom" iconOnly title="Move to bottom" onClick={() => moveArticleGroup(group, "bottom")}>
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
  );
}
