import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { getRoundedCartons } from "../utils/displayStock";
import { formatDate, formatNumber } from "../utils/format";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  getCartonAllocations,
  getPercentageAllocations,
} from "./offers/offerUtils";

const PAGE_SIZE = 18;
const formatPercentage = (value) =>
  formatNumber(Math.round(Number(value || 0) * 100) / 100);

export default function ProductPercentagePage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [allocationHistory, setAllocationHistory] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [historyMigration, setHistoryMigration] = useState("");
  const [legacyHistoryCount, setLegacyHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [percentages, setPercentages] = useState({});
  const [cartonQuantities, setCartonQuantities] = useState({});
  const [divisionMode, setDivisionMode] = useState("PERCENTAGE");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        productResult,
        userResult,
        allocationResult,
        historyResult,
      ] = await Promise.all([
        api.getFinishedGoods(token),
        api.getUsers(token),
        api.getProductPercentageAllocations(token),
        api.getProductPercentageAllocationHistory(token),
      ]);
      setProducts(productResult.data || []);
      setUsers(
        (userResult.data || []).filter(
          (user) => String(user.role || "").toUpperCase() === "USER"
        )
      );
      setAllocations(allocationResult.data || []);
      setAllocationHistory(historyResult.data || []);
      setHistoryAvailable(historyResult.history_available !== false);
      setHistoryMigration(historyResult.migration_required || "");
      setLegacyHistoryCount(Number(historyResult.legacy_count || 0));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch((error) =>
      showToast({
        tone: "error",
        title: "Could not load percentage allocations",
        message: error.data?.message || error.message,
      })
    );
  }, [load, showToast]);

  const allocationsByProduct = useMemo(() => {
    const grouped = new Map();
    allocations.forEach((allocation) => {
      const productId = Number(allocation.finished_good_id);
      if (!grouped.has(productId)) grouped.set(productId, []);
      grouped.get(productId).push(allocation);
    });
    return grouped;
  }, [allocations]);

  const filteredProducts = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      const hasAllocation = (
        allocationsByProduct.get(Number(product.id)) || []
      ).length > 0;
      if (allocationFilter === "allocated" && !hasAllocation) return false;
      if (allocationFilter === "unallocated" && hasAllocation) return false;
      if (
        seriesFilter &&
        String(product.sole_code || "").trim() !== seriesFilter
      ) {
        return false;
      }
      if (!terms.length) return true;
      const text = [
        product.id,
        product.name,
        product.article_code,
        product.sole_code,
        product.color,
        product.size,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [
    allocationFilter,
    allocationsByProduct,
    products,
    search,
    seriesFilter,
  ]);

  const seriesOptions = useMemo(
    () =>
      [
        ...new Set(
          products
            .map((product) => String(product.sole_code || "").trim())
            .filter(Boolean)
        ),
      ].sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [products]
  );

  const allocationCounts = useMemo(() => {
    const allocated = products.filter(
      (product) =>
        (allocationsByProduct.get(Number(product.id)) || []).length > 0
    ).length;
    return {
      all: products.length,
      allocated,
      unallocated: Math.max(0, products.length - allocated),
    };
  }, [allocationsByProduct, products]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pageProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [allocationFilter, search, seriesFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const openEditor = (product) => {
    const saved = allocationsByProduct.get(Number(product.id)) || [];
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    setEditing(product);
    setDivisionMode("PERCENTAGE");
    setSelectedUserIds(saved.map((target) => Number(target.user_id)));
    setPercentages(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          String(target.allocation_percentage),
        ])
      )
    );
    setCartonQuantities(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          pairsPerCarton > 0
            ? Math.floor(Number(target.allocation_quantity || 0) / pairsPerCarton)
            : 0,
        ])
      )
    );
  };

  const percentageTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    percentage: percentages[userId],
  }));
  const cartonTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    cartons: cartonQuantities[userId],
  }));
  const calculatedAllocations = useMemo(
    () =>
      divisionMode === "CTN"
        ? getCartonAllocations(editing, cartonTargets)
        : getPercentageAllocations(editing, percentageTargets),
    [cartonTargets, divisionMode, editing, percentageTargets]
  );
  const percentageTotal = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.percentage || 0),
    0
  );
  const assignedCartons = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.cartons || 0),
    0
  );
  const assignedPairs = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.pairs || 0),
    0
  );
  const editorTotalPairs = Number(editing?.quantity || 0);
  const editorTotalCartons = getRoundedCartons(
    editorTotalPairs,
    editing?.inner_boxes_per_outer_box
  );
  const unassignedCartons = Math.max(0, editorTotalCartons - assignedCartons);
  const unassignedPairs = Math.max(0, editorTotalPairs - assignedPairs);
  const hasInvalidAllocation = selectedUserIds.some(
    (userId) =>
      Number(calculatedAllocations.get(Number(userId))?.cartons || 0) <= 0
  );
  const allocationExceedsStock = assignedCartons > editorTotalCartons;

  const changeDivisionMode = (nextMode) => {
    if (nextMode === divisionMode) return;
    if (nextMode === "CTN") {
      setCartonQuantities(
        Object.fromEntries(
          selectedUserIds.map((userId) => [
            Number(userId),
            Number(
              calculatedAllocations.get(Number(userId))?.cartons || 0
            ),
          ])
        )
      );
    } else {
      setPercentages(
        Object.fromEntries(
          selectedUserIds.map((userId) => [
            Number(userId),
            Number(
              calculatedAllocations.get(Number(userId))?.percentage || 0
            ).toFixed(2),
          ])
        )
      );
    }
    setDivisionMode(nextMode);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editing) return;
    const targets = selectedUserIds.map((userId) => {
      const allocation = calculatedAllocations.get(Number(userId));
      return {
        user_id: Number(userId),
        allocation_percentage:
          divisionMode === "CTN"
            ? Number(allocation?.percentage || 0)
            : Number(percentages[userId]),
        allocation_quantity: Number(allocation?.pairs || 0),
      };
    });
    try {
      setSaving(true);
      await api.saveProductPercentageAllocations(editing.id, targets, token);
      showToast({
        tone: "success",
        title: "Product quantity separated",
        message: `${editing.article_code || editing.name} was allocated to ${targets.length} users.`,
      });
      setEditing(null);
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not save percentages",
        message: error.data?.message || error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const removeAllocation = async (product) => {
    if (!window.confirm(`Remove percentage allocation from ${product.article_code || product.name}?`)) {
      return;
    }
    try {
      await api.saveProductPercentageAllocations(product.id, [], token);
      await load();
      announceDataRefresh("finished-goods");
      showToast({
        tone: "success",
        title: "Allocation removed",
        message: "The product now follows its normal user permissions.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not remove allocation",
        message: error.data?.message || error.message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Product access"
        title="Product Percentage / CTN Allocation"
        description="Separate normal product stock between selected users by percentage or whole cartons."
        icon="users"
      />

      <SectionCard
        title="Products"
        subtitle="An allocated product is visible only to its selected users. Their orders reduce their personal balance."
        icon="finishedGoods"
        actions={
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_180px_auto]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, article, series or color…"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <select
              value={allocationFilter}
              onChange={(event) => setAllocationFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">
                All products ({formatNumber(allocationCounts.all)})
              </option>
              <option value="allocated">
                Percentage divided ({formatNumber(allocationCounts.allocated)})
              </option>
              <option value="unallocated">
                Not divided ({formatNumber(allocationCounts.unallocated)})
              </option>
            </select>
            <select
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">All series</option>
              {seriesOptions.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
            {search || allocationFilter !== "all" || seriesFilter ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setAllocationFilter("all");
                  setSeriesFilter("");
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Loading products…
          </div>
        ) : pageProducts.length ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageProducts.map((product) => {
              const targets =
                allocationsByProduct.get(Number(product.id)) || [];
              const pairsPerCarton = Number(
                product.inner_boxes_per_outer_box || 0
              );
              const totalCartons = getRoundedCartons(
                product.quantity,
                pairsPerCarton
              );
              const assignedPairs = targets.reduce(
                (sum, target) =>
                  sum + Number(target.allocation_quantity || 0),
                0
              );
              const assignedCartons =
                pairsPerCarton > 0
                  ? Math.floor(assignedPairs / pairsPerCarton)
                  : 0;
              return (
                <article
                  key={product.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        FG.ID {product.id}
                      </p>
                      <h3 className="mt-1 truncate text-base font-bold text-slate-950">
                        {product.article_code || product.name}
                      </h3>
                      <p className="truncate text-sm text-slate-500">
                        {product.sole_code || "No series"} ·{" "}
                        {product.color || "No color"} · {product.size || "-"}
                      </p>
                    </div>
                    <StatusBadge tone={targets.length ? "success" : "neutral"}>
                      {targets.length
                        ? `${targets.length} selected`
                        : "Not allocated"}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-slate-400">Stock</p>
                      <p className="font-bold text-slate-900">
                        {formatNumber(product.quantity)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-indigo-500">CTN</p>
                      <p className="font-bold text-indigo-800">
                        {formatNumber(totalCartons)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-emerald-500">Assigned</p>
                      <p className="font-bold text-emerald-800">
                        {formatNumber(assignedCartons)} CTN
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-700">
                        {formatNumber(assignedPairs)} pairs
                      </p>
                    </div>
                  </div>

                  {targets.length ? (
                    <div className="mt-3 divide-y divide-slate-200 rounded-xl bg-slate-50 px-3">
                      {targets.map((target) => {
                        const userAssignedPairs = Number(
                          target.allocation_quantity || 0
                        );
                        const userRemainingPairs = Number(
                          target.remaining_quantity || 0
                        );
                        const userAssignedCartons =
                          pairsPerCarton > 0
                            ? Math.floor(userAssignedPairs / pairsPerCarton)
                            : 0;
                        const userRemainingCartons =
                          pairsPerCarton > 0
                            ? Math.floor(userRemainingPairs / pairsPerCarton)
                            : 0;

                        return (
                          <div key={target.user_id} className="py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-xs font-semibold text-slate-800">
                                {target.user_name || target.user_email}
                              </span>
                              <span className="shrink-0 text-xs font-bold text-indigo-700">
                                {formatNumber(target.allocation_percentage)}%
                              </span>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-400">Divided </span>
                                <span className="font-bold text-slate-700">
                                  {formatNumber(userAssignedCartons)} CTN
                                </span>
                                <span className="block text-slate-500">
                                  {formatNumber(userAssignedPairs)} pairs
                                </span>
                              </div>
                              <div className="border-l border-slate-200 pl-2">
                                <span className="text-slate-400">Left </span>
                                <span className="font-bold text-emerald-700">
                                  {formatNumber(userRemainingCartons)} CTN
                                </span>
                                <span className="block text-slate-500">
                                  {formatNumber(userRemainingPairs)} pairs
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      icon="users"
                      onClick={() => openEditor(product)}
                    >
                      {targets.length ? "Edit allocation" : "Allocate product"}
                    </Button>
                    {targets.length ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => removeAllocation(product)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No matching products.
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <p className="text-sm text-slate-500">
              Page {page} of {pageCount}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Allocation history"
        subtitle="Every saved allocation keeps a snapshot of total product stock, assigned quantity, remaining quantity, selected users, and the person who changed it."
        icon="history"
      >
        {!historyAvailable ? (
          <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Allocation history requires {historyMigration || "the activity-log migration"}.
          </div>
        ) : allocationHistory.length ? (
          <>
            {legacyHistoryCount > 0 ? (
              <div className="mx-4 mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                {formatNumber(legacyHistoryCount)} older allocation actions are
                hidden because they were recorded before stock and per-user
                quantity snapshots existed.
              </div>
            ) : null}
            <DataTable
              rows={allocationHistory}
              wrapCells
              exportFilename="product-allocation-history"
              emptyTitle="No allocation history yet"
              columns={[
              {
                key: "created_at",
                label: "Date",
                render: (row) => formatDate(row.created_at),
              },
              {
                key: "product",
                label: "Product",
                exportValue: (row) =>
                  `${row.article_code || row.product_name || "Product"} / ${row.sole_code || ""} / ${row.color || ""}`,
                render: (row) => (
                  <div>
                    <strong>
                      {row.article_code || row.product_name || `FG.ID ${row.finished_good_id}`}
                    </strong>
                    <p className="text-xs text-slate-500">
                      {[row.sole_code, row.color].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                ),
              },
              {
                key: "total_quantity",
                label: "Total product",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.total_cartons} CTN / ${row.total_quantity} pairs`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.total_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.total_quantity)} pairs
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Legacy entry</span>
                  ),
              },
              {
                key: "assigned_quantity",
                label: "Assigned",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.assigned_cartons} CTN / ${row.assigned_quantity} pairs / ${row.percentage_total}%`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.assigned_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.assigned_quantity)} pairs ·{" "}
                        {formatPercentage(row.percentage_total)}%
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not recorded</span>
                  ),
              },
              {
                key: "unassigned_quantity",
                label: "Left",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.unassigned_cartons} CTN / ${row.unassigned_quantity} pairs`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.unassigned_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.unassigned_quantity)} pairs
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not recorded</span>
                  ),
              },
              {
                key: "targets",
                label: "User allocation / usage",
                exportValue: (row) =>
                  (row.targets || [])
                    .map(
                      (target) =>
                        `${target.user_name || target.user_email || target.user_id}: assigned ${target.allocation_percentage}% / ${target.allocation_cartons} CTN / ${target.allocation_quantity} pairs; ordered ${target.ordered_cartons || 0} CTN / ${target.ordered_quantity || 0} pairs; left ${target.remaining_cartons || 0} CTN / ${target.remaining_quantity || 0} pairs`
                    )
                    .join("; "),
                render: (row) =>
                  row.targets?.length ? (
                    <div className="min-w-52 space-y-1">
                      {row.targets.map((target) => (
                        <div key={target.user_id} className="text-xs">
                          <strong>{target.user_name || target.user_email}</strong>
                          <span className="block text-slate-500">
                            Assigned: {formatPercentage(target.allocation_percentage)}% ·{" "}
                            {formatNumber(target.allocation_cartons)} CTN ·{" "}
                            {formatNumber(target.allocation_quantity)} pairs
                          </span>
                          <span className="block text-slate-500">
                            Ordered: {formatNumber(target.ordered_cartons)} CTN ·{" "}
                            {formatNumber(target.ordered_quantity)} pairs
                          </span>
                          <span className="block font-semibold text-emerald-700">
                            Left: {formatNumber(target.remaining_cartons)} CTN ·{" "}
                            {formatNumber(target.remaining_quantity)} pairs
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No users</span>
                  ),
              },
              {
                key: "changed_by_name",
                label: "Changed by",
                render: (row) => (
                  <div>
                    <strong>{row.changed_by_name || "Unknown"}</strong>
                    <p className="text-xs text-slate-500">
                      {row.changed_by_email || "-"}
                    </p>
                  </div>
                ),
              },
              {
                key: "action",
                label: "Action",
                render: (row) => (
                  <StatusBadge
                    tone={
                      row.action === "REMOVE_PRODUCT_PERCENTAGE_ALLOCATION"
                        ? "danger"
                        : "success"
                    }
                  >
                    {row.action === "REMOVE_PRODUCT_PERCENTAGE_ALLOCATION"
                      ? "REMOVED"
                      : "SAVED"}
                  </StatusBadge>
                ),
              },
              ]}
            />
          </>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            <p>
              No complete allocation snapshots yet. The next saved or removed
              allocation will appear here with full quantities.
            </p>
            {legacyHistoryCount > 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                {formatNumber(legacyHistoryCount)} older actions were hidden
                because their quantities were never recorded.
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={() => setEditing(null)}
        >
          <form
            onSubmit={save}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Allocate {editing.article_code || editing.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Divide the product by percentage or whole CTN. Both values
                  stay visible while you allocate.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-[10px] font-bold uppercase text-indigo-500">
                  Total product
                </p>
                <p className="font-bold text-indigo-900">
                  {formatNumber(editorTotalCartons)} CTN
                </p>
                <p className="text-xs text-indigo-700">
                  {formatNumber(editorTotalPairs)} pairs
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[10px] font-bold uppercase text-emerald-600">
                  Assigned
                </p>
                <p className="font-bold text-emerald-900">
                  {formatNumber(assignedCartons)} CTN
                </p>
                <p className="text-xs text-emerald-700">
                  {formatNumber(assignedPairs)} pairs
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-600">
                  Left
                </p>
                <p className="font-bold text-amber-900">
                  {formatNumber(unassignedCartons)} CTN
                </p>
                <p className="text-xs text-amber-700">
                  {formatNumber(unassignedPairs)} pairs
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => changeDivisionMode("PERCENTAGE")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "PERCENTAGE"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by percentage
                </button>
                <button
                  type="button"
                  onClick={() => changeDivisionMode("CTN")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "CTN"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by CTN
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
              {users.map((user) => {
                const userId = Number(user.id);
                const checked = selectedUserIds.includes(userId);
                const defaultPercentage =
                  OFFER_PERCENTAGES_BY_EMAIL[
                    String(user.email || "").trim().toLowerCase()
                  ];
                const percentage =
                  percentages[userId] ?? defaultPercentage ?? "";
                const allocation = calculatedAllocations.get(userId);
                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-3 rounded-xl bg-white p-3"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedUserIds((current) =>
                          checked
                            ? current.filter((id) => Number(id) !== userId)
                            : [...current, userId]
                        );
                        if (!checked) {
                          setPercentages((current) => ({
                            ...current,
                            [userId]: current[userId] ?? defaultPercentage ?? "",
                          }));
                          setCartonQuantities((current) => ({
                            ...current,
                            [userId]: current[userId] || 1,
                          }));
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user.name || user.email}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {user.email}
                      </p>
                      {checked && allocation ? (
                        <p className="mt-1 text-xs font-bold text-indigo-700">
                          {formatPercentage(allocation.percentage)}% ·{" "}
                          {formatNumber(allocation.cartons)} CTN ·{" "}
                          {formatNumber(allocation.pairs)} pairs
                        </p>
                      ) : null}
                    </div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">
                      {divisionMode === "CTN" ? "CTN" : "Percentage"}
                      <input
                        type="number"
                        min={divisionMode === "CTN" ? "1" : "0.01"}
                        max={
                          divisionMode === "CTN"
                            ? editorTotalCartons
                            : "100"
                        }
                        step={divisionMode === "CTN" ? "1" : "0.01"}
                        required={checked}
                        disabled={!checked}
                        value={
                          checked
                            ? divisionMode === "CTN"
                              ? cartonQuantities[userId] ?? ""
                              : percentage
                            : ""
                        }
                        onChange={(event) => {
                          if (divisionMode === "CTN") {
                            setCartonQuantities((current) => ({
                              ...current,
                              [userId]: event.target.value,
                            }));
                          } else {
                            setPercentages((current) => ({
                              ...current,
                              [userId]: event.target.value,
                            }));
                          }
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                );
              })}
            </div>

            <div
              className={`mt-4 rounded-xl px-3 py-3 text-sm font-semibold ${
                percentageTotal > 100 || allocationExceedsStock
                  ? "bg-red-50 text-red-700"
                  : "bg-indigo-50 text-indigo-700"
              }`}
            >
              <p>
                Total assigned: {formatPercentage(percentageTotal)}% ·{" "}
                {formatNumber(assignedCartons)} CTN ·{" "}
                {formatNumber(assignedPairs)} pairs
              </p>
              <p className="mt-1">
                Total left:{" "}
                {formatPercentage(Math.max(0, 100 - percentageTotal))}%
                {" · "}
                {formatNumber(unassignedCartons)} CTN ·{" "}
                {formatNumber(unassignedPairs)} pairs
              </p>
            </div>
            {allocationExceedsStock ? (
              <p className="mt-2 text-sm font-medium text-red-600">
                Assigned CTN cannot exceed the total product CTN.
              </p>
            ) : null}
            {hasInvalidAllocation ? (
              <p className="mt-2 text-sm font-medium text-red-600">
                The stock is too small to give every selected user at least one
                full carton.
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                icon="check"
                disabled={
                  saving ||
                  !selectedUserIds.length ||
                  percentageTotal <= 0 ||
                  percentageTotal > 100 ||
                  allocationExceedsStock ||
                  hasInvalidAllocation
                }
              >
                {saving ? "Saving" : "Save allocation"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
