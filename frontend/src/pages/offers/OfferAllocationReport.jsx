import { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import EmptyState from "../../components/EmptyState";
import { getRoundedCartons } from "../../utils/displayStock";
import { formatNumber } from "../../utils/format";
import { OFFER_REPORT_PRODUCTS_PER_PAGE } from "./offerUtils";

export default function OfferAllocationReport({ rows, purchases = [] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [userFilter, setUserFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const userOptions = useMemo(() => {
    const users = new Map();
    rows.forEach((row) => {
      const key = String(row.user_email || row.user_name || "").trim().toLowerCase();
      if (key && !users.has(key)) {
        users.set(key, {
          key,
          name: row.user_name || row.user_email,
          email: row.user_email || "",
        });
      }
    });
    return [...users.values()].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  }, [rows]);

  const purchaseTotals = useMemo(() => {
    const totals = new Map();
    purchases.forEach((purchase) => {
      const email = String(purchase.account_email || "").trim().toLowerCase();
      const key = `${Number(purchase.finished_good_id)}::${email}::${Number(
        purchase.offer_campaign_id || 0
      )}`;
      if (!totals.has(key)) {
        totals.set(key, {
          ordered_pairs: 0,
          cancelled_pairs: 0,
          order_ids: new Set(),
        });
      }

      const total = totals.get(key);
      const pairs = Number(purchase.qty_ordered || 0);
      if (String(purchase.status || "").toUpperCase() === "CANCELLED") {
        total.cancelled_pairs += pairs;
      } else {
        total.ordered_pairs += pairs;
        total.order_ids.add(Number(purchase.order_id));
      }
    });
    return totals;
  }, [purchases]);

  const reportRows = useMemo(
    () =>
      rows.map((row) => {
        const email = String(row.user_email || "").trim().toLowerCase();
        const totals = purchaseTotals.get(
          `${Number(row.finished_good_id)}::${email}::${Number(
            row.offer_campaign_id || 0
          )}`
        );
        const orderedPairs = Number(totals?.ordered_pairs || 0);
        const cancelledPairs = Number(totals?.cancelled_pairs || 0);
        const pairsPerCarton = Number(row.pairs_per_carton || 0);
        const remainingPairs = Math.max(
          0,
          Number(row.assigned_pairs || 0) - orderedPairs
        );
        return {
          ...row,
          ordered_pairs: orderedPairs,
          ordered_cartons: getRoundedCartons(orderedPairs, pairsPerCarton),
          cancelled_pairs: cancelledPairs,
          cancelled_cartons: getRoundedCartons(cancelledPairs, pairsPerCarton),
          order_count: totals?.order_ids.size || 0,
          remaining_pairs: remainingPairs,
          remaining_cartons: getRoundedCartons(remainingPairs, pairsPerCarton),
        };
      }),
    [purchaseTotals, rows]
  );

  const filteredRows = useMemo(() => {
    const terms = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return reportRows.filter((row) => {
      const userKey = String(row.user_email || row.user_name || "").trim().toLowerCase();
      if (userFilter !== "ALL" && userKey !== userFilter) return false;
      const searchable = [
        row.article_code,
        row.product_name,
        row.sole_code,
        row.color,
        row.user_name,
        row.user_email,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [reportRows, searchTerm, userFilter]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    filteredRows.forEach((row) => {
      const productId = Number(row.finished_good_id);
      if (!groups.has(productId)) groups.set(productId, { ...row, users: [] });
      groups.get(productId).users.push(row);
    });
    return [...groups.values()];
  }, [filteredRows]);

  const totalPages = Math.max(
    1,
    Math.ceil(productGroups.length / OFFER_REPORT_PRODUCTS_PER_PAGE)
  );
  const visibleGroups = productGroups.slice(
    (page - 1) * OFFER_REPORT_PRODUCTS_PER_PAGE,
    page * OFFER_REPORT_PRODUCTS_PER_PAGE
  );

  useEffect(() => setPage(1), [searchTerm, userFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const totalCurrentPairs = productGroups.reduce(
    (sum, group) => sum + Number(group.globally_available_pairs || 0),
    0
  );
  const totalCurrentCartons = productGroups.reduce(
    (sum, group) => sum + Number(group.globally_available_cartons || 0),
    0
  );
  const totalStartingPairs = productGroups.reduce(
    (sum, group) => sum + Number(group.offer_starting_pairs || 0),
    0
  );
  const totalStartingCartons = productGroups.reduce(
    (sum, group) => sum + Number(group.offer_starting_cartons || 0),
    0
  );
  const totalAssignedPairs = filteredRows.reduce(
    (sum, row) => sum + Number(row.assigned_pairs || 0),
    0
  );
  const totalAssignedCartons = filteredRows.reduce(
    (sum, row) => sum + Number(row.assigned_cartons || 0),
    0
  );
  const totalOrderedPairs = filteredRows.reduce(
    (sum, row) => sum + Number(row.ordered_pairs || 0),
    0
  );
  const totalOrderedCartons = filteredRows.reduce(
    (sum, row) => sum + Number(row.ordered_cartons || 0),
    0
  );
  const totalRemainingPairs = filteredRows.reduce(
    (sum, row) => sum + Number(row.remaining_pairs || 0),
    0
  );
  const totalRemainingCartons = filteredRows.reduce(
    (sum, row) => sum + Number(row.remaining_cartons || 0),
    0
  );

  const exportReport = async () => {
    const XLSX = await import("xlsx");
    const exportRows = filteredRows.map((row) => ({
      Product: row.article_code || row.product_name,
      Series: row.sole_code || "",
      Color: row.color || "",
      User: row.user_name || "",
      Email: row.user_email || "",
      "Assigned Percentage": row.assigned_percentage ?? "",
      "Offer Period ID": row.offer_campaign_id || "",
      "Offer Starting CTN": row.offer_starting_cartons,
      "Offer Starting Pairs": row.offer_starting_pairs,
      "Current Offer Stock CTN": row.globally_available_cartons,
      "Current Offer Stock Pairs": row.globally_available_pairs,
      "Assigned CTN": row.assigned_cartons,
      "Assigned Pairs": row.assigned_pairs,
      "Ordered CTN": row.ordered_cartons,
      "Ordered Pairs": row.ordered_pairs,
      "Remaining Assigned CTN": row.remaining_cartons,
      "Remaining Assigned Pairs": row.remaining_pairs,
      "Offer Orders": row.order_count,
      "Cancelled CTN": row.cancelled_cartons,
      "Cancelled Pairs": row.cancelled_pairs,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(exportRows),
      "Offer Allocation Report"
    );
    XLSX.writeFile(workbook, "offer-allocation-report.xlsx");
  };

  const Quantity = ({ cartons, pairs, tone = "slate" }) => {
    const styles = {
      slate: "bg-slate-50 text-slate-800",
      indigo: "bg-indigo-50 text-indigo-800",
      emerald: "bg-emerald-50 text-emerald-800",
      amber: "bg-amber-50 text-amber-800",
    };
    return (
      <div className={`rounded-xl px-3 py-2 ${styles[tone] || styles.slate}`}>
        <p className="text-sm font-black">{formatNumber(cartons)} CTN</p>
        <p className="text-xs font-semibold opacity-70">{formatNumber(pairs)} pairs</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search product, series, user or email..."
            className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
          <select
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
            className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
            aria-label="Filter allocation report by user"
          >
            <option value="ALL">All selected users</option>
            {userOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
                {option.email ? ` · ${option.email}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={exportReport}
          disabled={!filteredRows.length}
        >
          Export Excel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Offer starting stock</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(totalStartingCartons)} CTN</p>
          <p className="text-sm text-slate-500">{formatNumber(totalStartingPairs)} pairs</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Available now</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(totalCurrentCartons)} CTN</p>
          <p className="text-sm text-slate-500">{formatNumber(totalCurrentPairs)} pairs</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-bold uppercase text-indigo-600">Shown / assigned</p>
          <p className="mt-1 text-xl font-black text-indigo-900">{formatNumber(totalAssignedCartons)} CTN</p>
          <p className="text-sm text-indigo-700">{formatNumber(totalAssignedPairs)} pairs</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase text-emerald-600">Ordered</p>
          <p className="mt-1 text-xl font-black text-emerald-900">{formatNumber(totalOrderedCartons)} CTN</p>
          <p className="text-sm text-emerald-700">{formatNumber(totalOrderedPairs)} pairs</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase text-amber-600">Assignment balance</p>
          <p className="mt-1 text-xl font-black text-amber-900">{formatNumber(totalRemainingCartons)} CTN</p>
          <p className="text-sm text-amber-700">{formatNumber(totalRemainingPairs)} pairs</p>
        </div>
      </div>

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs leading-5 text-slate-600">
        Totals belong only to the product’s current offer period. Pending, confirmed,
        packed, and delivered orders consume the assignment. Cancelled quantities are
        shown separately and return to the balance.
      </p>

      {!visibleGroups.length ? (
        <EmptyState
          title="No offer allocation report found"
          description="Try another product or selected user."
        />
      ) : (
        visibleGroups.map((group) => {
          const groupAssignedPairs = group.users.reduce(
            (sum, row) => sum + Number(row.assigned_pairs || 0),
            0
          );
          const groupAssignedCartons = group.users.reduce(
            (sum, row) => sum + Number(row.assigned_cartons || 0),
            0
          );
          const groupOrderedPairs = group.users.reduce(
            (sum, row) => sum + Number(row.ordered_pairs || 0),
            0
          );
          const groupOrderedCartons = group.users.reduce(
            (sum, row) => sum + Number(row.ordered_cartons || 0),
            0
          );
          return (
            <section
              key={group.finished_good_id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-base font-black text-slate-900">
                    {group.article_code || group.product_name}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {[group.sole_code, group.color].filter(Boolean).join(" · ") ||
                      "No series or color"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Started</p>
                    <p className="text-xs font-black text-slate-800">
                      {formatNumber(group.offer_starting_cartons)} CTN
                    </p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Available</p>
                    <p className="text-xs font-black text-slate-800">
                      {formatNumber(group.globally_available_cartons)} CTN
                    </p>
                  </div>
                  <div className="rounded-lg bg-indigo-100 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase text-indigo-500">Assigned</p>
                    <p className="text-xs font-black text-indigo-800">
                      {formatNumber(groupAssignedCartons)} CTN
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-100 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase text-emerald-600">Ordered</p>
                    <p className="text-xs font-black text-emerald-800">
                      {formatNumber(groupOrderedCartons)} CTN
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 lg:hidden">
                {group.users.map((row) => (
                  <article key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{row.user_name || "-"}</p>
                        <p className="break-all text-xs text-slate-500">{row.user_email || "-"}</p>
                      </div>
                      {row.assigned_percentage !== null &&
                      row.assigned_percentage !== undefined ? (
                        <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
                          {formatNumber(row.assigned_percentage)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Quantity cartons={row.assigned_cartons} pairs={row.assigned_pairs} tone="indigo" />
                      <Quantity cartons={row.ordered_cartons} pairs={row.ordered_pairs} tone="emerald" />
                      <Quantity cartons={row.remaining_cartons} pairs={row.remaining_pairs} tone="amber" />
                      <Quantity cartons={row.cancelled_cartons} pairs={row.cancelled_pairs} />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {formatNumber(row.order_count)} offer order{row.order_count === 1 ? "" : "s"}
                    </p>
                  </article>
                ))}
              </div>

              <div className="touch-scroll hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Selected user</th>
                      <th className="px-4 py-3">Percentage</th>
                      <th className="px-4 py-3">Shown / assigned</th>
                      <th className="px-4 py-3">Ordered</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Cancelled</th>
                      <th className="px-4 py-3">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.users.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-slate-900">{row.user_name || "-"}</p>
                          <p className="text-xs text-slate-500">{row.user_email || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-indigo-700">
                          {row.assigned_percentage === null ||
                          row.assigned_percentage === undefined
                            ? "Custom"
                            : `${formatNumber(row.assigned_percentage)}%`}
                        </td>
                        <td className="px-4 py-3"><Quantity cartons={row.assigned_cartons} pairs={row.assigned_pairs} tone="indigo" /></td>
                        <td className="px-4 py-3"><Quantity cartons={row.ordered_cartons} pairs={row.ordered_pairs} tone="emerald" /></td>
                        <td className="px-4 py-3"><Quantity cartons={row.remaining_cartons} pairs={row.remaining_pairs} tone="amber" /></td>
                        <td className="px-4 py-3"><Quantity cartons={row.cancelled_cartons} pairs={row.cancelled_pairs} /></td>
                        <td className="px-4 py-3 text-sm font-black text-slate-800">{formatNumber(row.order_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {productGroups.length > OFFER_REPORT_PRODUCTS_PER_PAGE ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm font-semibold text-slate-600">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
