import { useCallback, useEffect, useMemo, useState } from "react";
import { Tag, Package, ShoppingCart, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, APP_BASE_URL } from "../services/api";
import { getCustomerVisibleStock, getRoundedCartons } from "../utils/displayStock";
import { formatDate, formatNumber, formatUserPrice } from "../utils/format";

const isActiveOffer = (item) =>
  Number(item.offer_enabled) === 1 &&
  (!item.offer_ends_at || new Date(item.offer_ends_at).getTime() >= Date.now());

const getOfferGroupKey = (item) =>
  `${String(item.article_code || item.name || item.id).trim().toLowerCase()}::${String(item.sole_code || "").trim().toLowerCase()}`;

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const OFFER_PERCENTAGES_BY_EMAIL = {
  "pramod.kathmandu@nepcha.com": 40,
  "ishwor.birtamod@nepcha.com": 30,
  "kamal.butwal@nepcha.com": 20,
  "ramesh.pokhara@nepcha.com": 5,
  "deepak@nepcha.com": 5,
};
const OFFER_PRODUCTS_PER_PAGE = 12;
const OFFER_STOCK_PRODUCTS_PER_PAGE = 5;
const OFFER_REPORT_PRODUCTS_PER_PAGE = 5;

function OfferStockByUserTable({ rows, purchases = [] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const userOptions = useMemo(() => {
    const users = new Map();
    rows.forEach((row) => {
      const key = String(row.user_email || row.user_name || "").trim().toLowerCase();
      if (key && !users.has(key)) users.set(key, { key, name: row.user_name || row.user_email, email: row.user_email || "" });
    });
    return [...users.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [rows]);
  const selectedUser = userFilter === "ALL" ? null : userOptions.find((option) => option.key === userFilter);
  const selectedUserStockRows = useMemo(
    () => userFilter === "ALL" ? [] : rows.filter((row) => String(row.user_email || row.user_name || "").trim().toLowerCase() === userFilter),
    [rows, userFilter]
  );
  const activeCampaignIds = useMemo(
    () =>
      new Set(
        rows
          .map((row) => Number(row.offer_campaign_id || 0))
          .filter((campaignId) => campaignId > 0)
      ),
    [rows]
  );
  const selectedUserPurchases = useMemo(
    () => userFilter === "ALL" ? [] : purchases.filter((row) => String(row.account_email || "").trim().toLowerCase() === userFilter && String(row.status || "").toUpperCase() !== "CANCELLED" && activeCampaignIds.has(Number(row.offer_campaign_id || 0))),
    [activeCampaignIds, purchases, userFilter]
  );
  const selectedUserOrderCount = new Set(selectedUserPurchases.map((row) => Number(row.order_id))).size;
  const selectedUserOrderedPairs = selectedUserPurchases.reduce((sum, row) => sum + Number(row.qty_ordered || 0), 0);
  const selectedUserOrderedCartons = selectedUserPurchases.reduce((sum, row) => {
    const pairsPerCarton = Number(row.offer_pairs_per_carton_snapshot || 0);
    return sum + (pairsPerCarton > 0 ? Number(row.qty_ordered || 0) / pairsPerCarton : 0);
  }, 0);
  const selectedUserStockPairs = selectedUserStockRows.reduce((sum, row) => sum + Number(row.visible_pairs || 0), 0);
  const selectedUserStockCartons = selectedUserStockRows.reduce((sum, row) => sum + Number(row.visible_cartons || 0), 0);
  const selectedUserInStockProducts = selectedUserStockRows.filter((row) => row.stock_status === "IN STOCK").length;
  const selectedUserOutOfStockProducts = selectedUserStockRows.filter((row) => row.stock_status === "OUT OF STOCK").length;

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "ALL" || row.stock_status === statusFilter;
      const rowUserKey = String(row.user_email || row.user_name || "").trim().toLowerCase();
      const matchesUser = userFilter === "ALL" || rowUserKey === userFilter;
      const searchable = [row.article_code, row.product_name, row.sole_code, row.color, row.user_name, row.user_email]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return matchesStatus && matchesUser && (!query || searchable.includes(query));
    });
  }, [rows, searchTerm, statusFilter, userFilter]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    filteredRows.forEach((row) => {
      if (!groups.has(row.finished_good_id)) groups.set(row.finished_good_id, { ...row, users: [] });
      groups.get(row.finished_good_id).users.push(row);
    });
    return [...groups.values()];
  }, [filteredRows]);
  const totalPages = Math.max(1, Math.ceil(productGroups.length / OFFER_STOCK_PRODUCTS_PER_PAGE));
  const visibleGroups = productGroups.slice((page - 1) * OFFER_STOCK_PRODUCTS_PER_PAGE, page * OFFER_STOCK_PRODUCTS_PER_PAGE);

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, userFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const exportRows = async () => {
    const XLSX = await import("xlsx");
    const data = filteredRows.map((row) => ({
      Product: row.article_code || row.product_name,
      Series: row.sole_code || "",
      Color: row.color || "",
      User: row.user_name || "",
      Email: row.user_email || "",
      "Offer Access": row.audience,
      "Assigned CTN": row.is_shown ? row.assigned_cartons : "",
      "Assigned Pairs": row.is_shown ? row.assigned_pairs : "",
      "Available CTN": row.is_shown ? row.visible_cartons : "",
      "Available Pairs": row.is_shown ? row.visible_pairs : "",
      Status: row.stock_status,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Offer Stock by User");
    XLSX.writeFile(workbook, "offer-stock-by-user.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_240px_180px]">
          <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search product, series, user or email..." className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400" aria-label="Filter by user">
            <option value="ALL">All users</option>
            {userOptions.map((option) => <option key={option.key} value={option.key}>{option.name}{option.email ? ` · ${option.email}` : ""}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400">
            <option value="ALL">All statuses</option>
            <option value="IN STOCK">In stock</option>
            <option value="OUT OF STOCK">Out of stock</option>
          </select>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={exportRows} disabled={!filteredRows.length}>Export Excel</Button>
      </div>

      {selectedUser ? (
        <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 shadow-sm">
          <div className="border-b border-indigo-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">Selected customer</p>
            <p className="text-base font-bold text-slate-900">{selectedUser.name}</p>
            <p className="text-xs text-slate-500">{selectedUser.email}</p>
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
            <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Offer orders</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(selectedUserOrderCount)}</p><p className="text-xs text-slate-400">Excluding cancelled</p></div>
            <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-indigo-600">Total ordered</p><p className="mt-1 text-2xl font-bold text-indigo-800">{formatNumber(selectedUserOrderedCartons)} CTN</p><p className="text-xs text-slate-500">{formatNumber(selectedUserOrderedPairs)} pairs</p></div>
            <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-emerald-600">Offer stock left</p><p className="mt-1 text-2xl font-bold text-emerald-800">{formatNumber(selectedUserStockCartons)} CTN</p><p className="text-xs text-slate-500">{formatNumber(selectedUserStockPairs)} pairs</p></div>
            <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-emerald-600">In-stock products</p><p className="mt-1 text-2xl font-bold text-emerald-800">{formatNumber(selectedUserInStockProducts)}</p><p className="text-xs text-slate-400">Currently orderable</p></div>
            <div className="bg-white p-4"><p className="text-xs font-semibold uppercase text-red-600">Out-of-stock products</p><p className="mt-1 text-2xl font-bold text-red-700">{formatNumber(selectedUserOutOfStockProducts)}</p><p className="text-xs text-slate-400">No quantity available</p></div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />User can order</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />No stock available</span>
      </div>

      {!visibleGroups.length ? <EmptyState title="No matching offer stock" description="Try another product, user, or status filter." /> : visibleGroups.map((group) => (
        <section key={group.finished_good_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-slate-900">{group.article_code || group.product_name}</p>
              <p className="text-xs font-medium text-slate-500">{[group.sole_code, group.color].filter(Boolean).join(" · ") || "No series or color"}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Global available stock</p>
              <p className="text-sm font-bold text-indigo-700">{formatNumber(group.globally_available_cartons)} CTN · {formatNumber(group.globally_available_pairs)} pairs</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {group.users.map((row) => (
              <article key={row.id} className="space-y-3 px-4 py-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">{row.user_name || "-"}</p>
                  <p className="break-all text-xs text-slate-500">{row.user_email || "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Assigned limit</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{formatNumber(row.assigned_cartons)} CTN</p>
                    <p className="text-xs text-slate-500">{formatNumber(row.assigned_pairs)} pairs</p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-indigo-500">Can order now</p>
                    <p className="mt-1 text-sm font-bold text-indigo-700">{formatNumber(row.visible_cartons)} CTN</p>
                    <p className="text-xs text-slate-500">{formatNumber(row.visible_pairs)} pairs</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${row.stock_status === "IN STOCK" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  <span className={`h-2 w-2 rounded-full ${row.stock_status === "IN STOCK" ? "bg-emerald-500" : "bg-red-500"}`} />
                  {row.stock_status}
                </span>
              </article>
            ))}
          </div>
          <div className="touch-scroll hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Offer access</th><th className="px-4 py-2.5">Assigned limit</th><th className="px-4 py-2.5">Can order now</th><th className="px-4 py-2.5">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.users.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3"><p className="text-sm font-semibold text-slate-800">{row.user_name || "-"}</p><p className="text-xs text-slate-500">{row.user_email || "-"}</p></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.is_shown ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{row.audience}</span></td>
                    <td className="px-4 py-3">{row.is_shown ? <><p className="text-sm font-bold text-slate-800">{formatNumber(row.assigned_cartons)} CTN</p><p className="text-xs text-slate-500">{formatNumber(row.assigned_pairs)} pairs</p></> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">{row.is_shown ? <><p className="text-sm font-bold text-indigo-700">{formatNumber(row.visible_cartons)} CTN</p><p className="text-xs text-slate-500">{formatNumber(row.visible_pairs)} pairs</p></> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${row.stock_status === "IN STOCK" ? "bg-emerald-100 text-emerald-700" : row.stock_status === "OUT OF STOCK" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}><span className={`h-2 w-2 rounded-full ${row.stock_status === "IN STOCK" ? "bg-emerald-500" : row.stock_status === "OUT OF STOCK" ? "bg-red-500" : "bg-slate-400"}`} />{row.stock_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {productGroups.length > OFFER_STOCK_PRODUCTS_PER_PAGE ? (
        <div className="flex items-center justify-center gap-3">
          <Button type="button" size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <span className="text-sm font-semibold text-slate-600">Page {page} of {totalPages}</span>
          <Button type="button" size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}

function OfferAllocationReport({ rows, purchases = [] }) {
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

const getPercentageAllocations = (product, targets = []) => {
  const pairsPerCarton = Number(product?.inner_boxes_per_outer_box || 0);
  const totalCartons = getRoundedCartons(product?.quantity, pairsPerCarton);
  if (pairsPerCarton <= 0 || totalCartons <= 0) return new Map();

  const allocations = targets.filter((target) => Number(target.percentage) > 0).map((target, index) => {
    const percentage = Number(target.percentage);
    const exactCartons = totalCartons * percentage / 100;
    const cartons = Math.floor(exactCartons);
    return { user_id: Number(target.user_id), percentage, cartons, remainder: exactCartons - cartons, index };
  });
  const totalPercentage = allocations.reduce((sum, allocation) => sum + allocation.percentage, 0);
  const targetCartons = Math.min(totalCartons, Math.round(totalCartons * totalPercentage / 100));
  let cartonsLeft = targetCartons - allocations.reduce((sum, allocation) => sum + allocation.cartons, 0);
  [...allocations]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach((allocation) => {
      if (cartonsLeft <= 0) return;
      allocation.cartons += 1;
      cartonsLeft -= 1;
    });

  // With small stock, a valid percentage can round down to zero. When there
  // are enough cartons for every selected user, move cartons from the largest
  // allocations so no selected audience member is saved with zero quantity.
  if (targetCartons >= allocations.length) {
    allocations.filter((allocation) => allocation.cartons === 0).forEach((emptyAllocation) => {
      const donor = allocations
        .filter((allocation) => allocation.cartons > 1)
        .sort((left, right) => right.cartons - left.cartons || right.percentage - left.percentage || left.index - right.index)[0];
      if (donor) {
        donor.cartons -= 1;
        emptyAllocation.cartons = 1;
      }
    });
  }

  return new Map(allocations.map((allocation) => [allocation.user_id, {
    ...allocation,
    pairs: allocation.cartons * pairsPerCarton,
  }]));
};

function OfferProductCard({ variants, canManage, canOrder, viewer, onEdit, onRemove, onAddToCart, cartProductIds }) {
  const [selected, setSelected] = useState(variants.find(isActiveOffer) || variants[0]);

  useEffect(() => {
    setSelected((current) => variants.find((item) => Number(item.id) === Number(current?.id)) || variants.find(isActiveOffer) || variants[0]);
  }, [variants]);

  if (!selected) return null;
  const active = isActiveOffer(selected);
  const availableQty = canManage
    ? Number(selected.quantity || 0)
    : getCustomerVisibleStock(selected);
  const cartons = getRoundedCartons(availableQty, selected.inner_boxes_per_outer_box);
  const targetQuantities = (selected.offer_targets || [])
    .map((target) => Number(target.display_quantity || 0))
    .filter((quantity) => quantity > 0);
  const audienceSummary = Number(selected.offer_all_users) === 1
    ? "All users"
    : `${targetQuantities.length} selected user(s)${targetQuantities.length ? ` · ${targetQuantities.map(formatNumber).join(", ")} pairs` : ""}`;
  const customerOfferPrice = Number(selected.price || 0) > 0 ? Number(selected.price) + 50 : null;
  return (
    <article className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:shadow-xl ${active ? "border-amber-300" : "border-slate-200"}`}>
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selected.image_url ? (
          <img loading="lazy" decoding="async" src={`${APP_BASE_URL}${selected.image_url}`} alt={selected.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><Package size={36} /></div>
        )}
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${active ? "bg-amber-500" : "bg-slate-500"}`}><Tag size={13} />{active ? "ON OFFER" : "NOT ON OFFER"}</span>
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold text-white ${availableQty > 0 ? "bg-emerald-600" : "bg-red-600"}`}>
          {availableQty > 0 ? "IN STOCK" : "OUT OF STOCK"}
        </span>
        <ProductImageGallery variants={variants} selectedVariant={selected} onSelect={setSelected} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{selected.article_code || selected.name}</h3>
          {selected.sole_code && <p className="text-xs text-slate-600">Sole: <span className="font-semibold">{selected.sole_code}</span></p>}
          {selected.size && <p className="text-xs text-slate-600">Size: <span className="font-semibold">{selected.size}</span></p>}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {variants.map((variant) => (
            <button key={variant.id} type="button" onClick={() => setSelected(variant)} className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition ${Number(selected.id) === Number(variant.id) ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {variant.color || `Variant ${variant.id}`}
            </button>
          ))}
        </div>
        {active ? (
          <div className="rounded-xl bg-amber-50 p-2">
            <p className="text-xs font-semibold uppercase text-amber-700">{selected.offer_label || "Special offer"}</p>
            {selected.offer_ends_at && <p className="mt-1 text-xs text-slate-500">Ends {new Date(selected.offer_ends_at).toLocaleString()}</p>}
            {canManage && <p className="mt-1 text-xs font-medium text-slate-600">Audience: {audienceSummary}</p>}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">Qty stock</p><p className="text-sm font-bold text-indigo-700">{formatNumber(availableQty)} {selected.unit || "pairs"}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">CTN stock</p><p className="text-sm font-bold text-amber-600">{formatNumber(cartons)} CTN</p></div>
        </div>
        {canManage && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 px-3 py-2"><div><p className="text-[10px] font-semibold uppercase text-slate-500">Original price</p><p className="text-base font-bold text-slate-800">{Number(selected.price || 0) > 0 ? formatUserPrice(selected.price, viewer) : "-"}</p></div><div className="border-l border-slate-200 pl-3"><p className="text-[10px] font-semibold uppercase text-emerald-600">Offer price</p><p className="text-base font-bold text-emerald-800">{customerOfferPrice !== null ? formatUserPrice(customerOfferPrice, viewer) : "-"}</p></div></div>}
        {!canManage && customerOfferPrice !== null && <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2"><span className="text-xs font-semibold uppercase text-emerald-600">Offer price</span><span className="text-base font-bold text-emerald-800">{formatUserPrice(customerOfferPrice, viewer)}</span></div>}
        {canManage && <div className="mt-auto flex gap-2"><Button type="button" onClick={() => onEdit(selected)}>{active ? "Edit offer" : "Add offer"}</Button>{active && <Button type="button" variant="secondary" onClick={() => onRemove(selected)}>Remove</Button>}</div>}
        {!canManage && canOrder && (() => {
          const inCart = cartProductIds.has(Number(selected.id));
          return <button type="button" disabled={availableQty <= 0} onClick={() => onAddToCart(selected)} className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${availableQty <= 0 ? "cursor-not-allowed bg-slate-200 text-slate-500" : inCart ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}>{availableQty <= 0 ? "Out of stock" : inCart ? <><Check size={16} />In cart</> : <><ShoppingCart size={16} />Add to cart</>}</button>;
        })()}
      </div>
    </article>
  );
}

export default function OffersPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canManage = user?.role === "ADMIN" || user?.role === "CO_ADMIN";
  const canOrder = user?.role === "USER";
  const [products, setProducts] = useState([]);
  const [availabilityProducts, setAvailabilityProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [showOnlyOffers, setShowOnlyOffers] = useState(false);
  const [showOfferPurchases, setShowOfferPurchases] = useState(false);
  const [showOfferStockTable, setShowOfferStockTable] = useState(false);
  const [showOfferAllocationReport, setShowOfferAllocationReport] = useState(false);
  const [loadingOfferStockTable, setLoadingOfferStockTable] = useState(false);
  const [loadingOfferAllocationReport, setLoadingOfferAllocationReport] = useState(false);
  const [offerPurchases, setOfferPurchases] = useState([]);
  const [offerPurchaseSearch, setOfferPurchaseSearch] = useState("");
  const [loadingOfferPurchases, setLoadingOfferPurchases] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ offer_label: "Special offer", offer_ends_at: "", offer_all_users: true, offer_target_user_ids: [], offer_target_quantities: {}, offer_target_percentages: {} });
  const [saving, setSaving] = useState(false);
  const percentageTargets = useMemo(() => form.offer_target_user_ids.map((userId) => ({
    user_id: Number(userId),
    percentage: form.offer_target_percentages[userId],
  })), [form.offer_target_percentages, form.offer_target_user_ids]);
  const percentageAllocations = useMemo(() => getPercentageAllocations(editing, percentageTargets), [editing, percentageTargets]);
  const selectedPercentageTotal = percentageTargets.reduce((sum, target) => sum + Number(target.percentage || 0), 0);
  const hasZeroPercentageAllocation = [...percentageAllocations.values()].some((allocation) => allocation.pairs <= 0);
  const editingTotalPairs = Number(editing?.quantity || 0);
  const editingTotalCartons = getRoundedCartons(editingTotalPairs, editing?.inner_boxes_per_outer_box);
  const offers = useMemo(() => products.filter(isActiveOffer), [products]);
  const filteredOfferPurchases = useMemo(() => {
    const terms = offerPurchaseSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return offerPurchases.filter((row) => {
      const searchable = [row.article_code, row.product_name, row.sole_code, row.color, row.customer_name, row.account_name, row.account_email, row.status, row.delivery_note_number]
        .map((value) => String(value || "").toLowerCase()).join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [offerPurchaseSearch, offerPurchases]);
  const offerPurchaseOrderCount = new Set(filteredOfferPurchases.map((row) => Number(row.order_id))).size;
  const totalOfferOrderedPairs = filteredOfferPurchases.reduce(
    (sum, row) => sum + Number(row.qty_ordered || 0),
    0
  );
  const totalOfferOrderedCartons = filteredOfferPurchases.reduce((sum, row) => {
    const pairsPerCarton = Number(row.offer_pairs_per_carton_snapshot || 0);
    return sum + (pairsPerCarton > 0 ? Number(row.qty_ordered || 0) / pairsPerCarton : 0);
  }, 0);
  const groupedOfferPurchases = useMemo(() => {
    const groups = new Map();
    filteredOfferPurchases.forEach((row) => {
      const orderId = Number(row.order_id);
      if (!groups.has(orderId)) groups.set(orderId, { ...row, items: [] });
      groups.get(orderId).items.push(row);
    });
    return [...groups.values()].map((order) => ({
      ...order,
      total_offer_pairs: order.items.reduce(
        (sum, item) => sum + Number(item.qty_ordered || 0),
        0
      ),
      total_offer_cartons: order.items.reduce((sum, item) => {
        const pairsPerCarton = Number(item.offer_pairs_per_carton_snapshot || 0);
        return sum + (pairsPerCarton > 0 ? Number(item.qty_ordered || 0) / pairsPerCarton : 0);
      }, 0),
    }));
  }, [filteredOfferPurchases]);
  const deliveredOfferPurchases = filteredOfferPurchases.filter((row) => row.status === "DELIVERED");
  const deliveredOfferPairs = deliveredOfferPurchases.reduce((sum, row) => sum + Number(row.qty_ordered || 0), 0);
  const deliveredOfferSales = deliveredOfferPurchases.reduce((sum, row) => sum + Number(row.qty_ordered || 0) * Number(row.offer_price_snapshot || 0), 0);
  const offerAvailabilityById = useMemo(
    () => new Map(availabilityProducts.map((product) => [Number(product.id), product])),
    [availabilityProducts]
  );
  const currentCampaignUsageByUser = useMemo(() => {
    const usage = new Map();
    offerPurchases.forEach((purchase) => {
      if (
        String(purchase.status || "").toUpperCase() === "CANCELLED" ||
        Number(purchase.offer_campaign_id || 0) <= 0
      ) {
        return;
      }
      const email = String(purchase.account_email || "").trim().toLowerCase();
      const key = `${Number(purchase.offer_campaign_id)}::${email}`;
      usage.set(key, Number(usage.get(key) || 0) + Number(purchase.qty_ordered || 0));
    });
    return usage;
  }, [offerPurchases]);
  const offerStockByUserRows = useMemo(() => offers.flatMap((product) => {
    const availability = offerAvailabilityById.get(Number(product.id)) || product;
    const globallyAvailablePairs = Number(availability.available_qty ?? availability.quantity ?? product.quantity ?? 0);
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const targetsByUserId = new Map((product.offer_targets || []).map((target) => [Number(target.user_id), target]));
    const isForAllUsers = Number(product.offer_all_users ?? 1) === 1;

    return customers.filter((customer) => isForAllUsers || targetsByUserId.has(Number(customer.id))).map((customer) => {
      const target = targetsByUserId.get(Number(customer.id));
      const assignedPairs = Number(target?.display_quantity ?? product.display_quantity ?? 450);
      const campaignUsageKey = `${Number(product.offer_campaign_id || 0)}::${String(
        customer.email || ""
      ).trim().toLowerCase()}`;
      const orderedPairs = Number(
        currentCampaignUsageByUser.get(campaignUsageKey) || 0
      );
      const remainingAssignedPairs = Math.max(0, assignedPairs - orderedPairs);
      const visiblePairs = Math.max(
        0,
        Math.min(remainingAssignedPairs, globallyAvailablePairs)
      );

      return {
        id: `${product.id}-${customer.id}`,
        finished_good_id: Number(product.id),
        offer_campaign_id: Number(product.offer_campaign_id || 0) || null,
        offer_starting_pairs: Number(
          product.offer_stock_quantity_snapshot ?? product.quantity ?? 0
        ),
        offer_starting_cartons: getRoundedCartons(
          product.offer_stock_quantity_snapshot ?? product.quantity ?? 0,
          product.offer_pairs_per_carton_snapshot ??
            product.inner_boxes_per_outer_box
        ),
        article_code: product.article_code || product.name,
        product_name: product.name,
        sole_code: product.sole_code,
        color: product.color,
        user_name: customer.name,
        user_email: customer.email,
        audience: isForAllUsers ? "All users" : "Selected user",
        is_shown: true,
        assigned_percentage: target?.display_percentage ?? null,
        pairs_per_carton: pairsPerCarton,
        assigned_pairs: assignedPairs,
        assigned_cartons: getRoundedCartons(assignedPairs, pairsPerCarton),
        ordered_pairs: orderedPairs,
        remaining_assigned_pairs: remainingAssignedPairs,
        visible_pairs: visiblePairs,
        visible_cartons: getRoundedCartons(visiblePairs, pairsPerCarton),
        globally_available_pairs: globallyAvailablePairs,
        globally_available_cartons: getRoundedCartons(globallyAvailablePairs, pairsPerCarton),
        stock_status: visiblePairs > 0 ? "IN STOCK" : "OUT OF STOCK",
      };
    });
  }), [customers, currentCampaignUsageByUser, offerAvailabilityById, offers]);
  const shownOfferUserRows = offerStockByUserRows.filter((row) => row.is_shown);
  const inStockOfferUserCount = shownOfferUserRows.filter((row) => row.stock_status === "IN STOCK").length;
  const outOfStockOfferUserCount = shownOfferUserRows.filter((row) => row.stock_status === "OUT OF STOCK").length;

  const load = useCallback(async () => {
    const [result, usersResult] = await Promise.all([
      canManage ? api.getFinishedGoods(token) : api.getAvailability(token, { offer_view: 1 }),
      canManage ? api.getUsers(token) : Promise.resolve({ data: [] }),
    ]);
    setProducts(result.data || []);
    setCustomers((usersResult.data || []).filter((account) => account.role === "USER"));
  }, [canManage, token, user?.role]);

  useEffect(() => { load().catch(console.error); }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("userCart");
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) setCart(parsed);
    } catch (error) {
      console.error("Failed to load cart:", error);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (cartLoaded) localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  const cartProductIds = useMemo(() => new Set(cart.map((item) => Number(item.finished_good_id))), [cart]);
  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );
  const addToCart = (product) => {
    const productId = Number(product.id);
    if (cartProductIds.has(productId)) {
      navigate("/order-customer");
      return;
    }
    const availableQty = getCustomerVisibleStock(product);
    if (availableQty <= 0) return;
    setCart((current) => [...current, {
      finished_good_id: productId,
      qty_ordered: 1,
      orderBy: Number(product.inner_boxes_per_outer_box) > 0 ? "cartons" : "pairs",
      product: {
        id: productId,
        name: product.name || "",
        article_code: product.article_code || "",
        color: product.color || "",
        size: product.size || "",
        image_url: product.image_url || "",
        unit: product.unit || "pcs",
        inner_boxes_per_outer_box: Number(product.inner_boxes_per_outer_box || 0),
        quantity: Number(product.physical_stock ?? product.quantity ?? 0),
        display_stock: availableQty,
        available_qty: availableQty,
      },
    }]);
  };

  const seriesOptions = useMemo(() => {
    const source = canManage ? products : offers;
    return [...new Set(source.map((product) => getSeriesName(product.sole_code)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [canManage, offers, products]);

  const stockFilterCandidates = useMemo(() => {
    const source = canManage ? (showOnlyOffers ? offers : products) : offers;
    const q = search.trim().toLowerCase();
    return source.filter((item) => {
      const matchesSeries = !seriesFilter || getSeriesName(item.sole_code) === seriesFilter;
      const matchesSearch = !q || [item.name, item.article_code, item.sole_code, item.color]
        .some((value) => String(value || "").toLowerCase().includes(q));
      return matchesSeries && matchesSearch;
    });
  }, [canManage, offers, products, search, seriesFilter, showOnlyOffers]);
  const offerStockCounts = useMemo(() => stockFilterCandidates.reduce((counts, item) => {
    const available = canManage ? Number(item.quantity || 0) : getCustomerVisibleStock(item);
    counts[available > 0 ? "IN_STOCK" : "OUT_OF_STOCK"] += 1;
    return counts;
  }, { IN_STOCK: 0, OUT_OF_STOCK: 0 }), [canManage, stockFilterCandidates]);
  const shownProducts = useMemo(() => stockFilterCandidates.filter((item) => {
    if (stockFilter === "ALL") return true;
    const available = canManage ? Number(item.quantity || 0) : getCustomerVisibleStock(item);
    return stockFilter === "IN_STOCK" ? available > 0 : available <= 0;
  }), [canManage, stockFilter, stockFilterCandidates]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    shownProducts.forEach((product) => {
      const key = getOfferGroupKey(product);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    });
    return Array.from(groups.values());
  }, [shownProducts]);
  const totalPages = Math.max(1, Math.ceil(productGroups.length / OFFER_PRODUCTS_PER_PAGE));
  const paginatedProductGroups = useMemo(() => {
    const start = (currentPage - 1) * OFFER_PRODUCTS_PER_PAGE;
    return productGroups.slice(start, start + OFFER_PRODUCTS_PER_PAGE);
  }, [currentPage, productGroups]);

  useEffect(() => { setCurrentPage(1); }, [search, seriesFilter, showOnlyOffers, stockFilter]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const beginEdit = (product) => {
    const savedTargets = product.offer_targets || [];
    setEditing(product);
    setForm({
      offer_label: product.offer_label || "Special offer",
      offer_ends_at: product.offer_ends_at ? String(product.offer_ends_at).slice(0, 16) : "",
      offer_all_users: Number(product.offer_all_users ?? 1) === 1,
      offer_target_user_ids: savedTargets.length ? savedTargets.map((target) => Number(target.user_id)) : product.offer_target_user_ids || [],
      offer_target_quantities: Object.fromEntries(savedTargets.map((target) => [Number(target.user_id), Number(target.display_quantity || 450)])),
      offer_target_percentages: Object.fromEntries(savedTargets.map((target) => {
        const customer = customers.find((account) => Number(account.id) === Number(target.user_id));
        const defaultPercentage = OFFER_PERCENTAGES_BY_EMAIL[String(customer?.email || "").trim().toLowerCase()];
        return [Number(target.user_id), target.display_percentage ?? defaultPercentage ?? ""];
      })),
    });
  };

  const saveOffer = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const offerTargets = form.offer_target_user_ids.map((userId) => {
        const allocation = percentageAllocations.get(Number(userId));
        const percentage = form.offer_target_percentages[userId];
        return {
          user_id: Number(userId),
          display_quantity: Number(allocation ? allocation.pairs : form.offer_target_quantities[userId] || 0),
          display_percentage: percentage === "" || percentage === undefined ? null : Number(percentage),
        };
      });
      await api.updateFinishedGoodOffer(editing.id, { offer_enabled: true, ...form, offer_targets: offerTargets }, token);
      showToast({ tone: "success", title: "Offer saved", message: `${editing.article_code || editing.name} is now on offer.` });
      setEditing(null);
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Could not save offer", message: error.message });
    } finally { setSaving(false); }
  };

  const removeOffer = async (product) => {
    try {
      await api.updateFinishedGoodOffer(product.id, { offer_enabled: false }, token);
      showToast({ tone: "success", title: "Offer removed", message: `${product.article_code || product.name} is no longer shown as an offer.` });
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Could not remove offer", message: error.message });
    }
  };

  const toggleOfferPurchases = async () => {
    if (showOfferPurchases) {
      setShowOfferPurchases(false);
      return;
    }
    setShowOfferStockTable(false);
    setShowOfferAllocationReport(false);
    setShowOfferPurchases(true);
    setLoadingOfferPurchases(true);
    try {
      const result = await api.getOfferPurchases(token);
      setOfferPurchases(result.data || []);
    } catch (error) {
      showToast({ tone: "error", title: "Could not load offer purchases", message: error.message });
    } finally {
      setLoadingOfferPurchases(false);
    }
  };

  const toggleOfferStockTable = async () => {
    if (showOfferStockTable) {
      setShowOfferStockTable(false);
      return;
    }
    setShowOfferPurchases(false);
    setShowOfferAllocationReport(false);
    setShowOfferStockTable(true);
    setLoadingOfferStockTable(true);
    try {
      const [availabilityResult, purchasesResult] = await Promise.all([
        api.getAvailability(token, { include_hidden: 1 }),
        api.getOfferPurchases(token),
      ]);
      setAvailabilityProducts(availabilityResult.data || []);
      setOfferPurchases(purchasesResult.data || []);
    } catch (error) {
      showToast({ tone: "error", title: "Could not load offer stock", message: error.message });
    } finally {
      setLoadingOfferStockTable(false);
    }
  };

  const toggleOfferAllocationReport = async () => {
    if (showOfferAllocationReport) {
      setShowOfferAllocationReport(false);
      return;
    }
    setShowOfferPurchases(false);
    setShowOfferStockTable(false);
    setShowOfferAllocationReport(true);
    setLoadingOfferAllocationReport(true);
    try {
      const [availabilityResult, purchasesResult] = await Promise.all([
        api.getAvailability(token, { include_hidden: 1 }),
        api.getOfferPurchases(token),
      ]);
      setAvailabilityProducts(availabilityResult.data || []);
      setOfferPurchases(purchasesResult.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not load offer allocation report",
        message: error.message,
      });
    } finally {
      setLoadingOfferAllocationReport(false);
    }
  };

  const exportOfferPurchases = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredOfferPurchases.map((row) => ({
      "Order ID": row.order_id,
      "Delivery Note": row.delivery_note_number || "",
      Product: row.article_code || row.product_name,
      Series: row.sole_code || "",
      Color: row.color || "",
      Customer: row.customer_name || row.account_name || "",
      Email: row.account_email || "",
      Status: row.status,
      "Ordered Pairs": Number(row.qty_ordered || 0),
      "Ordered CTN": Number(row.offer_pairs_per_carton_snapshot || 0) > 0 ? Number(row.qty_ordered || 0) / Number(row.offer_pairs_per_carton_snapshot) : 0,
      "Offer Price": Number(row.offer_price_snapshot || 0),
      "Offer Label": row.offer_label_snapshot || "",
      "Assigned Percentage": row.offer_display_percentage ?? "",
      "Assigned Pair Limit": row.offer_display_quantity ?? "",
      "Order Date": formatDate(row.created_at),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Offer Purchases");
    XLSX.writeFile(workbook, "offer-purchases.xlsx");
  };

  return (
    <div className="space-y-6">
      <PageHeader title={canManage ? "Product Offers" : "Offers"} description={canManage ? "Choose products, set the audience, and publish offers for customers." : "Browse products currently available as special offers."} />
      {canOrder && <div className="flex justify-start"><button type="button" onClick={() => navigate("/order-customer")} className="flex w-fit flex-row gap-3 rounded-xl bg-indigo-500 px-3 py-2 text-white transition hover:bg-indigo-600"><ShoppingCart size={18} /><span>Cart</span>{totalCartItems > 0 && <span className="relative -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{totalCartItems}</span>}</button></div>}
      <SectionCard title={canManage ? "Manage offers" : "Current offers"} subtitle={`${offers.length} active offer${offers.length === 1 ? "" : "s"}`} icon="finishedGoods">
        {canManage && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button type="button" variant={!showOnlyOffers && !showOfferPurchases && !showOfferStockTable && !showOfferAllocationReport ? "primary" : "secondary"} onClick={() => { setShowOnlyOffers(false); setShowOfferPurchases(false); setShowOfferStockTable(false); setShowOfferAllocationReport(false); }}>Show all products</Button>
            <Button type="button" variant={showOnlyOffers && !showOfferPurchases && !showOfferStockTable && !showOfferAllocationReport ? "primary" : "secondary"} onClick={() => { setShowOnlyOffers(true); setShowOfferPurchases(false); setShowOfferStockTable(false); setShowOfferAllocationReport(false); }}>Show products in offer ({offers.length})</Button>
            <Button type="button" variant={showOfferPurchases ? "primary" : "secondary"} onClick={toggleOfferPurchases}>Offer purchases</Button>
            <Button type="button" variant={showOfferStockTable ? "primary" : "secondary"} onClick={toggleOfferStockTable}>Offer stock by user</Button>
            <Button type="button" variant={showOfferAllocationReport ? "primary" : "secondary"} onClick={toggleOfferAllocationReport}>Offer allocation report</Button>
          </div>
        )}
        {canManage && showOfferAllocationReport && (
          <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div>
              <h3 className="font-bold text-slate-900">Offer allocation report</h3>
              <p className="text-sm text-slate-500">
                Compare current offer stock, quantities shown to each selected user,
                quantities ordered, and the remaining assignment balance.
              </p>
            </div>
            {loadingOfferAllocationReport ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Loading offer allocation report...
              </p>
            ) : (
              <OfferAllocationReport
                rows={offerStockByUserRows}
                purchases={offerPurchases}
              />
            )}
          </div>
        )}
        {canManage && showOfferStockTable && (
          <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <h3 className="font-bold text-slate-900">Offer stock by user</h3>
              <p className="text-sm text-slate-500">See who can view each offer and the quantity currently available to that user.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3"><p className="text-xs uppercase text-slate-500">Shown user offers</p><p className="text-xl font-bold">{formatNumber(shownOfferUserRows.length)}</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">In stock</p><p className="text-xl font-bold text-emerald-800">{formatNumber(inStockOfferUserCount)}</p></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-xs font-semibold uppercase text-red-700">Out of stock</p><p className="text-xl font-bold text-red-800">{formatNumber(outOfStockOfferUserCount)}</p></div>
            </div>
            {loadingOfferStockTable ? <p className="py-8 text-center text-sm text-slate-500">Loading offer stock by user...</p> : <OfferStockByUserTable rows={offerStockByUserRows} purchases={offerPurchases} />}
          </div>
        )}
        {canManage && showOfferPurchases && (
          <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Offer Purchases</h3><p className="text-sm text-slate-500">Permanent snapshots of orders placed from active offers.</p></div><Button type="button" variant="secondary" onClick={exportOfferPurchases} disabled={!filteredOfferPurchases.length}>Export Excel</Button></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl bg-white p-3"><p className="text-xs uppercase text-slate-500">Offer orders</p><p className="text-xl font-bold">{formatNumber(offerPurchaseOrderCount)}</p></div>
              <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs font-semibold uppercase text-indigo-600">Total ordered CTN</p><p className="text-xl font-bold text-indigo-800">{formatNumber(totalOfferOrderedCartons)}</p></div>
              <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs font-semibold uppercase text-indigo-600">Total ordered pairs</p><p className="text-xl font-bold text-indigo-800">{formatNumber(totalOfferOrderedPairs)}</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs uppercase text-slate-500">Delivered pairs</p><p className="text-xl font-bold">{formatNumber(deliveredOfferPairs)}</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs uppercase text-slate-500">Delivered offer sales</p><p className="text-xl font-bold">{formatUserPrice(deliveredOfferSales, user)}</p></div>
            </div>
            <input value={offerPurchaseSearch} onChange={(event) => setOfferPurchaseSearch(event.target.value)} placeholder="Search product, series, customer, status or DN..." className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500" />
            {loadingOfferPurchases ? <p className="py-8 text-center text-sm text-slate-500">Loading offer purchases...</p> : <DataTable rows={groupedOfferPurchases} emptyTitle="No offer purchases recorded" columns={[
              { key: "order_id", label: "Order / DN", render: (row) => `#${row.order_id}${row.delivery_note_number ? ` / ${row.delivery_note_number}` : ""}` },
              { key: "customer", label: "Customer", render: (row) => row.customer_name || row.account_name || row.account_email || "-" },
              { key: "user", label: "User", render: (row) => <div><p className="font-semibold text-slate-800">{row.account_name || "-"}</p><p className="text-xs text-slate-500">{row.account_email || "-"}</p></div> },
              { key: "items", label: "Offer Items", render: (row) => <div className="min-w-[250px] space-y-1">{row.items.map((item) => { const cartons = Number(item.offer_pairs_per_carton_snapshot || 0) > 0 ? Number(item.qty_ordered) / Number(item.offer_pairs_per_carton_snapshot) : 0; return <div key={item.order_item_id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"><p className="font-semibold leading-tight text-slate-900">{item.article_code || item.product_name}{item.sole_code ? ` / ${item.sole_code}` : ""}{item.color ? ` / ${item.color}` : ""}</p><p className="mt-0.5 leading-tight text-slate-500">{formatNumber(item.qty_ordered)} pairs / {formatNumber(cartons)} CTN · {item.offer_price_snapshot === null ? "-" : formatUserPrice(item.offer_price_snapshot, user)}</p></div>; })}</div> },
              { key: "total_offer_quantity", label: "Total Ordered", exportValue: (row) => `${formatNumber(row.total_offer_cartons)} CTN / ${formatNumber(row.total_offer_pairs)} pairs`, render: (row) => <div className="min-w-[110px] rounded-lg bg-indigo-50 px-2.5 py-2"><p className="font-bold text-indigo-700">{formatNumber(row.total_offer_cartons)} CTN</p><p className="mt-0.5 text-xs font-semibold text-slate-600">{formatNumber(row.total_offer_pairs)} pairs</p></div> },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Order Date", render: (row) => formatDate(row.created_at) },
            ]} />}
          </div>
        )}
        {!showOfferPurchases && !showOfferStockTable && !showOfferAllocationReport && <><div className="mb-4 flex max-w-xs flex-col gap-1">
          <label htmlFor="offer-series" className="text-xs font-medium text-slate-500">Series</label>
          <select id="offer-series" value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
            <option value="">All Series</option>
            {seriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
          </select>
        </div>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter products by stock">
          <Button type="button" size="sm" variant={stockFilter === "ALL" ? "primary" : "secondary"} onClick={() => setStockFilter("ALL")}>
            All ({offerStockCounts.IN_STOCK + offerStockCounts.OUT_OF_STOCK})
          </Button>
          <Button type="button" size="sm" variant={stockFilter === "IN_STOCK" ? "primary" : "secondary"} onClick={() => setStockFilter("IN_STOCK")}>
            In stock ({offerStockCounts.IN_STOCK})
          </Button>
          <Button type="button" size="sm" variant={stockFilter === "OUT_OF_STOCK" ? "danger" : "secondary"} onClick={() => setStockFilter("OUT_OF_STOCK")}>
            Out of stock ({offerStockCounts.OUT_OF_STOCK})
          </Button>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, article or color..." className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500" />
        {!productGroups.length ? <EmptyState title="No offers found" description={canManage ? "Search for a product and publish an offer." : "There are no active product offers right now."} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {paginatedProductGroups.map((variants) => (
              <OfferProductCard key={getOfferGroupKey(variants[0])} variants={variants} canManage={canManage} canOrder={canOrder} viewer={user} onEdit={beginEdit} onRemove={removeOffer} onAddToCart={addToCart} cartProductIds={cartProductIds} />
            ))}
          </div>
        )}
        {productGroups.length > OFFER_PRODUCTS_PER_PAGE && (
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Offer product pages">
            <Button type="button" size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? "page" : undefined} className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition ${currentPage === page ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{page}</button>
            ))}
            <Button type="button" size="sm" variant="secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
          </nav>
        )}
        </>}
      </SectionCard>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={() => setEditing(null)}>
          <form onSubmit={saveOffer} onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="text-lg font-bold">Offer for {editing.article_code || editing.name}</h2><p className="text-sm text-slate-500">Choose each user and the maximum quantity that user can see and order.</p></div>
              <div className="grid shrink-0 grid-cols-2 gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Total CTN</p><p className="text-lg font-bold text-indigo-800">{formatNumber(editingTotalCartons)}</p></div>
                <div className="border-l border-indigo-200 pl-2"><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Total pairs</p><p className="text-lg font-bold text-indigo-800">{formatNumber(editingTotalPairs)}</p></div>
              </div>
            </div>
            <label className="block text-sm font-semibold">Offer label<input maxLength="120" value={form.offer_label} onChange={(event) => setForm({ ...form, offer_label: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <label className="block text-sm font-semibold">End date (optional)<input type="datetime-local" value={form.offer_ends_at} onChange={(event) => setForm({ ...form, offer_ends_at: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Who can see this offer?</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: true, offer_target_user_ids: [], offer_target_quantities: {}, offer_target_percentages: {} })} />All users (normal display limit)</label>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={!form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: false })} />Selected users with personalized quantities</label>
              {!form.offer_all_users && (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
                  {customers.length ? customers.map((customer) => {
                    const userId = Number(customer.id);
                    const checked = form.offer_target_user_ids.includes(userId);
                    const defaultPercentage = OFFER_PERCENTAGES_BY_EMAIL[String(customer.email || "").trim().toLowerCase()];
                    const configuredPercentage = form.offer_target_percentages[userId] ?? defaultPercentage ?? "";
                    const percentageAllocation = percentageAllocations.get(userId);
                    const assignedPairs = percentageAllocation?.pairs ?? form.offer_target_quantities[userId] ?? "";
                    return (
                      <div key={customer.id} className="grid grid-cols-[auto_1fr_140px] items-center gap-2 rounded-lg bg-white px-2 py-2">
                        <input type="checkbox" checked={checked} onChange={() => setForm((current) => ({
                          ...current,
                          offer_target_user_ids: checked ? current.offer_target_user_ids.filter((id) => Number(id) !== userId) : [...current.offer_target_user_ids, userId],
                          offer_target_quantities: checked ? current.offer_target_quantities : { ...current.offer_target_quantities, [userId]: percentageAllocation?.pairs || current.offer_target_quantities[userId] || 450 },
                          offer_target_percentages: checked ? current.offer_target_percentages : { ...current.offer_target_percentages, [userId]: configuredPercentage },
                        }))} />
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{customer.name || customer.email}</p><p className="truncate text-xs text-slate-400">{customer.email}</p>{percentageAllocation && <p className="mt-0.5 text-xs font-semibold text-indigo-600">{formatNumber(percentageAllocation.cartons)} CTN · {formatNumber(percentageAllocation.pairs)} pairs</p>}</div>
                        <div>
                          {defaultPercentage !== undefined || form.offer_target_percentages[userId] !== undefined ? (
                            <label className="text-[11px] font-semibold text-slate-500">Percentage<input type="number" min="0.01" max="100" step="0.01" required={checked} disabled={!checked} value={checked ? configuredPercentage : ""} onChange={(event) => setForm((current) => ({ ...current, offer_target_percentages: { ...current.offer_target_percentages, [userId]: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100" /></label>
                          ) : (
                            <input type="number" min="1" step="1" required={checked} disabled={!checked} value={checked ? assignedPairs : ""} onChange={(event) => setForm((current) => ({ ...current, offer_target_quantities: { ...current.offer_target_quantities, [userId]: event.target.value } }))} placeholder="Pairs" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100" />
                          )}
                        </div>
                      </div>
                    );
                  }) : <p className="text-sm text-slate-500">No user accounts found.</p>}
                  {selectedPercentageTotal > 0 && <p className={`px-2 text-xs font-semibold ${selectedPercentageTotal > 100 ? "text-red-600" : "text-slate-500"}`}>Selected percentage total: {formatNumber(selectedPercentageTotal)}%{selectedPercentageTotal > 100 ? " (must not exceed 100%)" : ""}</p>}
                  {hasZeroPercentageAllocation && <p className="px-2 text-xs font-semibold text-red-600">There are not enough cartons to give every selected user at least 1 CTN. Select fewer users or increase the stock.</p>}
                </div>
              )}
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving || selectedPercentageTotal > 100 || hasZeroPercentageAllocation}>{saving ? "Saving..." : "Publish offer"}</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}
