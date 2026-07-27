import { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import EmptyState from "../../components/EmptyState";
import { formatNumber } from "../../utils/format";
import { OFFER_STOCK_PRODUCTS_PER_PAGE } from "./offerUtils";

export default function OfferStockByUserTable({ rows, purchases = [] }) {
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
