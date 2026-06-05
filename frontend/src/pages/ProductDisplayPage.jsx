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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog control"
        title="Product Display"
        description="Choose which products users see and arrange the order they appear in."
        icon="eye"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Displayed products</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{visibleCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Hidden products</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length - visibleCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total products</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
      </div>

      <SectionCard
        title="User catalog order"
        subtitle="The first product in this list appears first for users."
        icon="finishedGoods"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 sm:max-w-sm"
          />
          <p className="text-sm text-slate-500">{filteredGroups.length} article codes shown</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead className="bg-indigo-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Display order</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Article code</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Product IDs</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Colors / sizes</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">CTN</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Pairs</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">Visibility</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedGroups.map((group) => (
                <tr key={group.key} className="hover:bg-slate-50">
                  <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                    {articleGroups.findIndex((item) => item.key === group.key) + 1}
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                    <div className="flex items-center gap-3">
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
                        <p className="text-sm text-slate-500">{group.items.length} variants</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <span key={item.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                          #{item.id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                            {item.color || "-"} / {item.size || "-"}
                          </span>
                          <StatusBadge tone={item.is_visible ? "success" : "neutral"}>
                            {item.is_visible ? "Displayed" : "Hidden"}
                          </StatusBadge>
                          <Button
                            type="button"
                            variant={item.is_visible ? "secondary" : "primary"}
                            size="sm"
                            icon={item.is_visible ? "eyeOff" : "eye"}
                            onClick={() => toggleVisibility(item)}
                          >
                            {item.is_visible ? "Hide" : "Display"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-slate-700">
                    {formatNumber(group.totalCartons)}
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-slate-700">
                    {formatNumber(group.totalPairs)}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge tone={group.visibleCount ? "success" : "neutral"}>
                      {group.visibleCount}/{group.items.length} displayed
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-4">
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
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No products found.
          </div>
        ) : null}

        {filteredGroups.length ? (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
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
