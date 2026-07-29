import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { getRoundedCartons } from "../utils/displayStock";
import { formatNumber } from "../utils/format";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  getPercentageAllocations,
} from "./offers/offerUtils";

const PAGE_SIZE = 18;

export default function ProductPercentagePage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [percentages, setPercentages] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productResult, userResult, allocationResult] = await Promise.all([
        api.getFinishedGoods(token),
        api.getUsers(token),
        api.getProductPercentageAllocations(token),
      ]);
      setProducts(productResult.data || []);
      setUsers(
        (userResult.data || []).filter(
          (user) => String(user.role || "").toUpperCase() === "USER"
        )
      );
      setAllocations(allocationResult.data || []);
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
    if (!terms.length) return products;
    return products.filter((product) => {
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
  }, [products, search]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pageProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const openEditor = (product) => {
    const saved = allocationsByProduct.get(Number(product.id)) || [];
    setEditing(product);
    setSelectedUserIds(saved.map((target) => Number(target.user_id)));
    setPercentages(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          String(target.allocation_percentage),
        ])
      )
    );
  };

  const percentageTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    percentage: percentages[userId],
  }));
  const calculatedAllocations = useMemo(
    () => getPercentageAllocations(editing, percentageTargets),
    [editing, percentageTargets]
  );
  const percentageTotal = percentageTargets.reduce(
    (sum, target) => sum + Number(target.percentage || 0),
    0
  );
  const hasInvalidAllocation = [...calculatedAllocations.values()].some(
    (allocation) => allocation.pairs <= 0
  );

  const save = async (event) => {
    event.preventDefault();
    if (!editing) return;
    const targets = selectedUserIds.map((userId) => {
      const allocation = calculatedAllocations.get(Number(userId));
      return {
        user_id: Number(userId),
        allocation_percentage: Number(percentages[userId]),
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
        title="Product Percentage Allocation"
        description="Separate normal product stock between selected users by CTN percentage."
        icon="users"
      />

      <SectionCard
        title="Products"
        subtitle="An allocated product is visible only to its selected users. Their orders reduce their personal balance."
        icon="finishedGoods"
        actions={
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, article, series or color…"
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-80"
          />
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
                        {formatNumber(assignedPairs)}
                      </p>
                    </div>
                  </div>

                  {targets.length ? (
                    <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
                      {targets.slice(0, 3).map((target) => (
                        <div
                          key={target.user_id}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="truncate font-medium text-slate-700">
                            {target.user_name || target.user_email}
                          </span>
                          <span className="shrink-0 font-bold text-indigo-700">
                            {formatNumber(target.allocation_percentage)}% ·{" "}
                            {formatNumber(target.remaining_quantity)} left
                          </span>
                        </div>
                      ))}
                      {targets.length > 3 ? (
                        <p className="text-xs text-slate-400">
                          +{targets.length - 3} more users
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      icon="users"
                      onClick={() => openEditor(product)}
                    >
                      {targets.length ? "Edit percentages" : "Set percentages"}
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

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={() => setEditing(null)}
        >
          <form
            onSubmit={save}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Allocate {editing.article_code || editing.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Select users and enter the percentage each user can see and
                  order.
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 rounded-xl bg-indigo-50 p-3 text-center">
                <div>
                  <p className="text-[10px] uppercase text-indigo-500">Total CTN</p>
                  <p className="font-bold text-indigo-900">
                    {formatNumber(
                      getRoundedCartons(
                        editing.quantity,
                        editing.inner_boxes_per_outer_box
                      )
                    )}
                  </p>
                </div>
                <div className="border-l border-indigo-200 pl-2">
                  <p className="text-[10px] uppercase text-indigo-500">Pairs</p>
                  <p className="font-bold text-indigo-900">
                    {formatNumber(editing.quantity)}
                  </p>
                </div>
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
                          {formatNumber(allocation.cartons)} CTN ·{" "}
                          {formatNumber(allocation.pairs)} pairs
                        </p>
                      ) : null}
                    </div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">
                      Percentage
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        required={checked}
                        disabled={!checked}
                        value={checked ? percentage : ""}
                        onChange={(event) =>
                          setPercentages((current) => ({
                            ...current,
                            [userId]: event.target.value,
                          }))
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                );
              })}
            </div>

            <div
              className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${
                percentageTotal > 100
                  ? "bg-red-50 text-red-700"
                  : "bg-indigo-50 text-indigo-700"
              }`}
            >
              Selected percentage total: {formatNumber(percentageTotal)}%
              {percentageTotal < 100
                ? ` · ${formatNumber(100 - percentageTotal)}% remains unassigned`
                : ""}
            </div>
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
