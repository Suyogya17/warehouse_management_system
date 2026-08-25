import { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import EmptyState from "../../components/EmptyState";
import MultiSeriesFilter from "../../components/MultiSeriesFilter";
import { formatNumber } from "../../utils/format";
import { OFFER_REPORT_PRODUCTS_PER_PAGE } from "./offerUtils";

const fullCartons = (pairs, cartonSize) => {
  const quantity = Number(pairs || 0);
  const size = Number(cartonSize || 0);
  return quantity > 0 && size > 0 ? Math.floor(quantity / size) : 0;
};

const dateKey = (value) => (value ? String(value).slice(0, 10) : "");

const Quantity = ({ label, cartons, pairs, tone = "slate", note }) => {
  const styles = {
    slate: "bg-slate-50 text-slate-800",
    indigo: "bg-indigo-50 text-indigo-800",
    emerald: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-xl px-3 py-2 ${styles[tone] || styles.slate}`}>
      {label ? (
        <p className="mb-1 text-[10px] font-black uppercase tracking-wide opacity-70">
          {label}
        </p>
      ) : null}
      <p className="text-sm font-black">{formatNumber(cartons)} CTN</p>
      <p className="text-xs font-semibold opacity-70">{formatNumber(pairs)} pairs</p>
      {note ? <p className="mt-1 text-[10px] font-semibold opacity-70">{note}</p> : null}
    </div>
  );
};

export default function OfferAllocationHistory({ rows = [], loading = false }) {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("ALL");
  const [seriesFilters, setSeriesFilters] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const userOptions = useMemo(() => {
    const options = new Map();
    rows.forEach((row) => {
      const key = String(row.user_email || row.user_name || "").trim().toLowerCase();
      if (key && !options.has(key)) {
        options.set(key, {
          key,
          name: row.user_name || row.user_email,
          email: row.user_email || "",
        });
      }
    });
    return [...options.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [rows]);

  const seriesOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => String(row.sole_code || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [rows]
  );

  const filteredCampaignRows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      const userKey = String(row.user_email || row.user_name || "").trim().toLowerCase();
      const started = dateKey(row.campaign_started_at);
      if (userFilter !== "ALL" && userKey !== userFilter) return false;
      if (seriesFilters.length && !seriesFilters.includes(String(row.sole_code || "").trim())) return false;
      if (dateFrom && started && started < dateFrom) return false;
      if (dateTo && started && started > dateTo) return false;
      const searchable = [
        row.finished_good_id,
        row.article_code,
        row.product_name,
        row.sole_code,
        row.color,
        row.user_name,
        row.user_email,
        row.offer_label,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [dateFrom, dateTo, rows, search, seriesFilters, userFilter]);

  const cumulativeRows = useMemo(() => {
    const totals = new Map();
    filteredCampaignRows.forEach((row) => {
      const key = `${Number(row.finished_good_id)}::${Number(row.user_id)}`;
      if (!totals.has(key)) {
        totals.set(key, {
          ...row,
          id: key,
          campaign_ids: new Set(),
          assigned_pairs: 0,
          assigned_cartons: 0,
          ordered_pairs: 0,
          ordered_cartons: 0,
          cancelled_pairs: 0,
          cancelled_cartons: 0,
          unused_pairs: 0,
          unused_cartons: 0,
          order_count: 0,
          first_campaign_at: row.campaign_started_at,
          last_campaign_at: row.campaign_started_at,
        });
      }
      const total = totals.get(key);
      const cartonSize = Number(row.pairs_per_carton || 0);
      const assigned = Number(row.assigned_pairs || 0);
      const ordered = Number(row.ordered_pairs || 0);
      const cancelled = Number(row.cancelled_pairs || 0);
      const unused = Math.max(0, assigned - ordered);
      total.campaign_ids.add(Number(row.offer_campaign_id));
      total.assigned_pairs += assigned;
      total.assigned_cartons += fullCartons(assigned, cartonSize);
      total.ordered_pairs += ordered;
      total.ordered_cartons += fullCartons(ordered, cartonSize);
      total.cancelled_pairs += cancelled;
      total.cancelled_cartons += fullCartons(cancelled, cartonSize);
      total.unused_pairs += unused;
      total.unused_cartons += fullCartons(unused, cartonSize);
      total.order_count += Number(row.order_count || 0);
      if (new Date(row.campaign_started_at) < new Date(total.first_campaign_at)) {
        total.first_campaign_at = row.campaign_started_at;
      }
      if (new Date(row.campaign_started_at) > new Date(total.last_campaign_at)) {
        total.last_campaign_at = row.campaign_started_at;
      }
    });
    return [...totals.values()].map((row) => ({
      ...row,
      campaign_count: row.campaign_ids.size,
    }));
  }, [filteredCampaignRows]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    cumulativeRows.forEach((row) => {
      const id = Number(row.finished_good_id);
      if (!groups.has(id)) groups.set(id, { ...row, users: [] });
      groups.get(id).users.push(row);
    });
    return [...groups.values()];
  }, [cumulativeRows]);

  const totalPages = Math.max(1, Math.ceil(productGroups.length / OFFER_REPORT_PRODUCTS_PER_PAGE));
  const visibleGroups = productGroups.slice(
    (page - 1) * OFFER_REPORT_PRODUCTS_PER_PAGE,
    page * OFFER_REPORT_PRODUCTS_PER_PAGE
  );

  useEffect(() => setPage(1), [dateFrom, dateTo, search, seriesFilters, userFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const totals = cumulativeRows.reduce(
    (sum, row) => ({
      assigned_pairs: sum.assigned_pairs + row.assigned_pairs,
      assigned_cartons: sum.assigned_cartons + row.assigned_cartons,
      ordered_pairs: sum.ordered_pairs + row.ordered_pairs,
      ordered_cartons: sum.ordered_cartons + row.ordered_cartons,
      cancelled_pairs: sum.cancelled_pairs + row.cancelled_pairs,
      cancelled_cartons: sum.cancelled_cartons + row.cancelled_cartons,
      unused_pairs: sum.unused_pairs + row.unused_pairs,
      unused_cartons: sum.unused_cartons + row.unused_cartons,
      order_count: sum.order_count + row.order_count,
    }),
    { assigned_pairs: 0, assigned_cartons: 0, ordered_pairs: 0, ordered_cartons: 0, cancelled_pairs: 0, cancelled_cartons: 0, unused_pairs: 0, unused_cartons: 0, order_count: 0 }
  );
  const usedFromRecordedAssignmentsPairs = Math.max(
    0,
    totals.assigned_pairs - totals.unused_pairs
  );
  const usedFromRecordedAssignmentsCartons = Math.max(
    0,
    totals.assigned_cartons - totals.unused_cartons
  );
  const ordersOutsideRecordedAssignmentsPairs = Math.max(
    0,
    totals.ordered_pairs - usedFromRecordedAssignmentsPairs
  );
  const ordersOutsideRecordedAssignmentsCartons = Math.max(
    0,
    totals.ordered_cartons - usedFromRecordedAssignmentsCartons
  );

  const exportHistory = async () => {
    const XLSX = await import("xlsx");
    const exportRows = cumulativeRows.map((row) => ({
      "FG ID": row.finished_good_id,
      Product: row.article_code || row.product_name,
      Series: row.sole_code || "",
      Color: row.color || "",
      User: row.user_name || "",
      Email: row.user_email || "",
      "Offer periods": row.campaign_count,
      "First offer": row.first_campaign_at || "",
      "Latest offer": row.last_campaign_at || "",
      "Assigned CTN": row.assigned_cartons,
      "Assigned pairs": row.assigned_pairs,
      "Ordered CTN": row.ordered_cartons,
      "Ordered pairs": row.ordered_pairs,
      "Remaining from individual assignment CTN": row.unused_cartons,
      "Remaining from individual assignment pairs": row.unused_pairs,
      "Cancelled CTN": row.cancelled_cartons,
      "Cancelled pairs": row.cancelled_pairs,
      Orders: row.order_count,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "Offer History");
    XLSX.writeFile(workbook, "offer-allocation-history.xlsx");
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">Loading complete offer history...</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-6">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, FG ID, user..." className="h-10 rounded-xl border border-slate-200 px-3 text-sm xl:col-span-2" />
        <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="ALL">All users</option>
          {userOptions.map((option) => <option key={option.key} value={option.key}>{option.name} · {option.email}</option>)}
        </select>
        <MultiSeriesFilter options={seriesOptions} values={seriesFilters} onChange={setSeriesFilters} label="" buttonClassName="h-10" />
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Offer history from date" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Offer history to date" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <div className="flex gap-2 xl:col-span-6">
          <Button type="button" size="sm" variant="secondary" onClick={() => { setDateFrom(""); setDateTo(""); }}>From beginning</Button>
          <Button type="button" size="sm" variant="secondary" onClick={exportHistory} disabled={!cumulativeRows.length}>Export Excel</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Quantity label="User assigned quantity" cartons={totals.assigned_cartons} pairs={totals.assigned_pairs} tone="indigo" />
        <Quantity label="User order placed" cartons={totals.ordered_cartons} pairs={totals.ordered_pairs} tone="emerald" />
        <Quantity label="Remaining from individual assignment" cartons={totals.unused_cartons} pairs={totals.unused_pairs} tone="amber" note="Assigned quantity not used in its recorded targeted offer period" />
        <Quantity label="Cancelled order quantity" cartons={totals.cancelled_cartons} pairs={totals.cancelled_pairs} />
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-800"><p className="mb-1 text-[10px] font-black uppercase tracking-wide opacity-70">Offer orders placed</p><p className="text-sm font-black">{formatNumber(totals.order_count)} orders</p><p className="text-xs font-semibold opacity-70">All matching periods</p></div>
      </div>

      <div className="space-y-1 rounded-xl bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-800">
        <p><strong>Remaining from individual assignment</strong> = user assigned quantity minus the quantity used from each recorded targeted offer period. It is not undelivered stock.</p>
        <p>Used from recorded individual assignments: <strong>{formatNumber(usedFromRecordedAssignmentsCartons)} CTN / {formatNumber(usedFromRecordedAssignmentsPairs)} pairs</strong>.</p>
        {ordersOutsideRecordedAssignmentsPairs > 0 ? <p>Orders outside the final recorded individual assignments: <strong>{formatNumber(ordersOutsideRecordedAssignmentsCartons)} CTN / {formatNumber(ordersOutsideRecordedAssignmentsPairs)} pairs</strong>. These can come from all-user offers, legacy offers, or allocations changed/transferred later.</p> : null}
        <p>This history combines every saved offer period in the selected date range. Extending an offer does not remove earlier ordered quantities.</p>
      </div>

      {!visibleGroups.length ? <EmptyState title="No offer history found" description="Try another user, product, series, or date range." /> : visibleGroups.map((group) => (
        <section key={group.finished_good_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-indigo-50 px-4 py-3"><p className="font-black text-slate-900">{group.finished_good_id} · {group.article_code || group.product_name}</p><p className="text-xs font-semibold text-slate-500">{[group.sole_code, group.color].filter(Boolean).join(" · ")}</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Offer periods</th><th className="px-4 py-3">User assigned quantity</th><th className="px-4 py-3">User order placed</th><th className="px-4 py-3">Remaining from individual assignment</th><th className="px-4 py-3">Cancelled order quantity</th><th className="px-4 py-3">Orders</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{group.users.map((row) => <tr key={row.id}><td className="px-4 py-3"><p className="font-bold">{row.user_name || "-"}</p><p className="text-xs text-slate-500">{row.user_email || "-"}</p></td><td className="px-4 py-3 text-sm"><p className="font-bold">{formatNumber(row.campaign_count)}</p><p className="text-xs text-slate-500">{dateKey(row.first_campaign_at)} → {dateKey(row.last_campaign_at)}</p></td><td className="px-4 py-3"><Quantity cartons={row.assigned_cartons} pairs={row.assigned_pairs} tone="indigo" /></td><td className="px-4 py-3"><Quantity cartons={row.ordered_cartons} pairs={row.ordered_pairs} tone="emerald" /></td><td className="px-4 py-3"><Quantity cartons={row.unused_cartons} pairs={row.unused_pairs} tone="amber" /></td><td className="px-4 py-3"><Quantity cartons={row.cancelled_cartons} pairs={row.cancelled_pairs} /></td><td className="px-4 py-3 font-black">{formatNumber(row.order_count)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ))}

      {productGroups.length > OFFER_REPORT_PRODUCTS_PER_PAGE ? <div className="flex items-center justify-center gap-3"><Button type="button" size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span className="text-sm font-semibold">Page {page} of {totalPages}</span><Button type="button" size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button></div> : null}
    </div>
  );
}
