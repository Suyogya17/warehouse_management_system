import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import MultiSeriesFilter from "../../components/MultiSeriesFilter";
import { api } from "../../services/api";
import { formatNumber } from "../../utils/format";
import { getSeriesName } from "./offerUtils";

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const initialDates = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { dateFrom: localDate(from), dateTo: localDate(to) };
};

const cartons = (pairs, size) => {
  const cartonSize = Number(size || 0);
  return cartonSize > 0
    ? Math.round((Number(pairs || 0) / cartonSize) * 1000) / 1000
    : 0;
};

const Quantity = ({ pairs, size }) => (
  <div className="whitespace-nowrap">
    <p className="font-semibold text-slate-900">{formatNumber(cartons(pairs, size))} CTN</p>
    <p className="text-xs text-slate-500">{formatNumber(pairs)} pairs</p>
  </div>
);

const Summary = ({ label, pairs, tone }) => {
  const styles = {
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-900",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-white text-slate-900",
  };
  return (
    <div className={`rounded-xl border p-3 ${styles[tone] || styles.slate}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-black">{formatNumber(pairs)} pairs</p>
    </div>
  );
};

export default function OfferVsRegularReport({ token }) {
  const defaults = useMemo(initialDates, []);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [search, setSearch] = useState("");
  const [seriesFilters, setSeriesFilters] = useState([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [rows, setRows] = useState([]);
  const [orderDetails, setOrderDetails] = useState([]);
  const [reportPeriod, setReportPeriod] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dealerProduct, setDealerProduct] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await api.getOfferVsRegularReport(
        { date_from: dateFrom, date_to: dateTo },
        token
      );
      setRows(result.data?.rows || []);
      setOrderDetails(result.data?.order_details || []);
      setReportPeriod({
        dateFrom: result.data?.date_from || dateFrom,
        dateTo: result.data?.date_to || dateTo,
      });
    } catch (requestError) {
      setError(requestError.message || "Could not load the offer comparison report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // The date fields are applied with the Search report button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seriesOptions = useMemo(
    () => [...new Set(rows.map((row) => getSeriesName(row.sole_code)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (seriesFilters.length && !seriesFilters.includes(getSeriesName(row.sole_code))) return false;
      const hasOffer = Number(row.offer_period_count || 0) > 0 || Number(row.offer_ordered_pairs || 0) > 0;
      const hasRegular = Number(row.regular_ordered_pairs || 0) > 0;
      if (typeFilter === "OFFER" && !hasOffer) return false;
      if (typeFilter === "REGULAR" && !hasRegular) return false;
      const searchable = [
        row.finished_good_id,
        row.product_name,
        row.article_code,
        row.sole_code,
        row.color,
        row.size,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [rows, search, seriesFilters, typeFilter]);

  const totals = useMemo(
    () => filteredRows.reduce((sum, row) => {
      [
        "offer_assigned_pairs",
        "offer_ordered_pairs",
        "offer_delivered_pairs",
        "offer_not_delivered_pairs",
        "regular_ordered_pairs",
        "regular_delivered_pairs",
        "regular_not_delivered_pairs",
      ].forEach((key) => { sum[key] += Number(row[key] || 0); });
      return sum;
    }, {
      offer_assigned_pairs: 0,
      offer_ordered_pairs: 0,
      offer_delivered_pairs: 0,
      offer_not_delivered_pairs: 0,
      regular_ordered_pairs: 0,
      regular_delivered_pairs: 0,
      regular_not_delivered_pairs: 0,
    }),
    [filteredRows]
  );

  const exportExcel = () => {
    const exportRows = filteredRows.map((row) => ({
      "FG.ID": row.finished_good_id,
      Product: row.product_name,
      Article: row.article_code,
      Series: getSeriesName(row.sole_code),
      Color: row.color,
      Size: row.size,
      "Pairs per CTN": Number(row.pairs_per_carton || 0),
      "Offer periods": Number(row.offer_period_count || 0),
      "Offer assigned pairs": Number(row.offer_assigned_pairs || 0),
      "Offer assigned CTN": cartons(row.offer_assigned_pairs, row.pairs_per_carton),
      "Offer ordered/taken pairs": Number(row.offer_ordered_pairs || 0),
      "Offer ordered/taken CTN": cartons(row.offer_ordered_pairs, row.pairs_per_carton),
      "Offer delivered pairs": Number(row.offer_delivered_pairs || 0),
      "Offer delivered CTN": cartons(row.offer_delivered_pairs, row.pairs_per_carton),
      "Offer not delivered pairs": Number(row.offer_not_delivered_pairs || 0),
      "Regular ordered pairs": Number(row.regular_ordered_pairs || 0),
      "Regular ordered CTN": cartons(row.regular_ordered_pairs, row.pairs_per_carton),
      "Regular delivered pairs": Number(row.regular_delivered_pairs || 0),
      "Regular delivered CTN": cartons(row.regular_delivered_pairs, row.pairs_per_carton),
      "Regular not delivered pairs": Number(row.regular_not_delivered_pairs || 0),
    }));
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    sheet["!cols"] = Array.from({ length: 20 }, (_, index) => ({ wch: index === 1 ? 30 : 18 }));
    const visibleProductIds = new Set(filteredRows.map((row) => Number(row.finished_good_id)));
    const visibleOrderDetails = orderDetails.filter((detail) => {
      if (!visibleProductIds.has(Number(detail.finished_good_id))) return false;
      if (typeFilter === "OFFER") return Boolean(detail.is_offer);
      if (typeFilter === "REGULAR") return !detail.is_offer;
      return true;
    });
    const dealerRows = filteredRows.flatMap((row) =>
      (row.dealer_details || []).map((dealer) => {
        const matchingOfferOrders = visibleOrderDetails.filter((detail) =>
          Number(detail.finished_good_id) === Number(row.finished_good_id) &&
          detail.is_offer &&
          String(detail.order_status || "").toUpperCase() !== "CANCELLED" &&
          (
            (dealer.user_id && Number(detail.dealer_user_id) === Number(dealer.user_id)) ||
            (!dealer.user_id && String(detail.dealer_email || "").toLowerCase() === String(dealer.dealer_email || "").toLowerCase())
          )
        );
        const placedDates = matchingOfferOrders
          .map((detail) => detail.order_placed_at)
          .filter(Boolean)
          .sort((left, right) => new Date(left) - new Date(right));
        const deliveryDates = matchingOfferOrders
          .map((detail) => detail.last_delivered_at)
          .filter(Boolean)
          .sort((left, right) => new Date(left) - new Date(right));
        return ({
        "FG.ID": row.finished_good_id,
        Product: row.product_name,
        Article: row.article_code,
        Series: getSeriesName(row.sole_code),
        Color: row.color,
        Size: row.size,
        Dealer: dealer.dealer_name,
        Email: dealer.dealer_email,
        "First offer order": placedDates[0] || "",
        "Last offer order": placedDates[placedDates.length - 1] || "",
        "First delivery": deliveryDates[0] || "",
        "Last delivery": deliveryDates[deliveryDates.length - 1] || "",
        "Offer assigned pairs": Number(dealer.offer_assigned_pairs || 0),
        "Offer assigned CTN": cartons(dealer.offer_assigned_pairs, row.pairs_per_carton),
        "Offer ordered/taken pairs": Number(dealer.offer_ordered_pairs || 0),
        "Offer ordered/taken CTN": cartons(dealer.offer_ordered_pairs, row.pairs_per_carton),
        "Offer delivered pairs": Number(dealer.offer_delivered_pairs || 0),
        "Offer delivered CTN": cartons(dealer.offer_delivered_pairs, row.pairs_per_carton),
        "Offer not delivered pairs": Number(dealer.offer_not_delivered_pairs || 0),
        "Offer not delivered CTN": cartons(dealer.offer_not_delivered_pairs, row.pairs_per_carton),
        "Unused assigned pairs": Number(dealer.offer_unused_assigned_pairs || 0),
        "Unused assigned CTN": cartons(dealer.offer_unused_assigned_pairs, row.pairs_per_carton),
        "Regular ordered pairs": Number(dealer.regular_ordered_pairs || 0),
        "Regular delivered pairs": Number(dealer.regular_delivered_pairs || 0),
        "Regular not delivered pairs": Number(dealer.regular_not_delivered_pairs || 0),
        });
      })
    );
    const dealerSheet = XLSX.utils.json_to_sheet(dealerRows);
    dealerSheet["!cols"] = Array.from({ length: 25 }, (_, index) => ({
      wch: [1, 6, 7, 8, 9, 10, 11].includes(index) ? 24 : 18,
    }));

    const orderRows = visibleOrderDetails.map((detail) => ({
      "Report from": reportPeriod.dateFrom,
      "Report to": reportPeriod.dateTo,
      "Order ID": Number(detail.order_id || 0),
      "Order item ID": Number(detail.order_item_id || 0),
      "Order placed date": detail.order_placed_at || "",
      "Dealer": detail.dealer_name || "",
      "Dealer email": detail.dealer_email || "",
      "Customer / Party": detail.customer_name || "",
      "FG.ID": Number(detail.finished_good_id || 0),
      Product: detail.product_name || "",
      Article: detail.article_code || "",
      Series: getSeriesName(detail.sole_code),
      Color: detail.color || "",
      Size: detail.size || "",
      "Order type": detail.is_offer ? "OFFER" : "REGULAR",
      "Assignment type": String(detail.assignment_type || "").replaceAll("_", " "),
      "Offer campaign ID": detail.offer_campaign_id || "",
      "Offer label": detail.offer_label || "",
      "Offer started": detail.offer_started_at || "",
      "Offer ended": detail.offer_ended_at || "",
      "Campaign personal assignment (reference; do not sum) pairs": detail.assigned_pairs ?? "",
      "Campaign personal assignment (reference; do not sum) CTN": detail.assigned_pairs === null || detail.assigned_pairs === undefined
        ? ""
        : cartons(detail.assigned_pairs, detail.pairs_per_carton),
      "Order placed pairs": Number(detail.placed_pairs || 0),
      "Order placed CTN": cartons(detail.placed_pairs, detail.pairs_per_carton),
      "Counted ordered/taken pairs": Number(detail.ordered_pairs || 0),
      "Counted ordered/taken CTN": cartons(detail.ordered_pairs, detail.pairs_per_carton),
      "Delivered pairs": Number(detail.delivered_pairs || 0),
      "Delivered CTN": cartons(detail.delivered_pairs, detail.pairs_per_carton),
      "Not delivered pairs": Number(detail.not_delivered_pairs || 0),
      "Not delivered CTN": cartons(detail.not_delivered_pairs, detail.pairs_per_carton),
      "Cancelled pairs": Number(detail.cancelled_pairs || 0),
      "Order status": detail.order_status || "",
      "First delivered date": detail.first_delivered_at || "",
      "Last delivered date": detail.last_delivered_at || "",
      "Warehouse DNs": detail.warehouse_delivery_note_numbers || "",
      "Master DN": detail.master_delivery_note_number || "",
    }));
    const orderSheet = XLSX.utils.json_to_sheet(orderRows);
    orderSheet["!cols"] = Array.from({ length: 36 }, (_, index) => ({
      wch: [4, 5, 6, 7, 9, 15, 17, 18, 19, 30, 31, 32, 33].includes(index) ? 24 : 17,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Offer vs Regular");
    XLSX.utils.book_append_sheet(workbook, dealerSheet, "Dealer Details");
    XLSX.utils.book_append_sheet(workbook, orderSheet, "Full Order Details");
    XLSX.writeFile(workbook, `offer-vs-regular-${reportPeriod.dateFrom}-to-${reportPeriod.dateTo}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_170px_170px_220px_190px_auto] xl:items-end">
          <label className="text-xs font-semibold text-slate-600">Search product
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="FG ID, article, product or colour..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Date from
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Date to
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </label>
          <MultiSeriesFilter options={seriesOptions} values={seriesFilters} onChange={setSeriesFilters} />
          <label className="text-xs font-semibold text-slate-600">Product type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="ALL">Offer and regular</option>
              <option value="OFFER">Offer products only</option>
              <option value="REGULAR">Regular orders only</option>
            </select>
          </label>
          <Button type="button" onClick={load} disabled={loading}>Search report</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>Report period: <strong>{reportPeriod.dateFrom}</strong> to <strong>{reportPeriod.dateTo}</strong>. Excel includes product totals, dealer totals, and every order with its placed and delivered dates.</p>
          <Button type="button" size="sm" variant="secondary" onClick={exportExcel} disabled={!filteredRows.length}>Export Excel</Button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Summary label="Offer quantity divided" pairs={totals.offer_assigned_pairs} tone="indigo" />
        <Summary label="Offer ordered / taken" pairs={totals.offer_ordered_pairs} tone="emerald" />
        <Summary label="Offer delivered" pairs={totals.offer_delivered_pairs} tone="emerald" />
        <Summary label="Offer not delivered" pairs={totals.offer_not_delivered_pairs} tone="amber" />
        <Summary label="Regular ordered" pairs={totals.regular_ordered_pairs} tone="slate" />
        <Summary label="Regular delivered" pairs={totals.regular_delivered_pairs} tone="emerald" />
        <Summary label="Regular not delivered" pairs={totals.regular_not_delivered_pairs} tone="amber" />
      </div>

      <DataTable
        rows={filteredRows}
        loading={loading}
        emptyTitle="No matching offer or regular activity"
        emptyDescription="Choose another date range, product, or series."
        columns={[
          { key: "finished_good_id", label: "FG.ID" },
          { key: "product", label: "Product / Series", render: (row) => <div><p className="font-bold">{row.article_code || row.product_name}</p><p className="text-xs text-slate-500">{getSeriesName(row.sole_code)} · {row.color} · {row.size}</p><button type="button" onClick={() => setDealerProduct(row)} className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100">View dealer details ({formatNumber((row.dealer_details || []).length)})</button></div> },
          { key: "offer_period_count", label: "Offer periods", render: (row) => <div><p className="font-semibold">{formatNumber(row.offer_period_count)}</p><p className="text-xs text-slate-500">{formatNumber(row.assigned_dealer_count)} assigned dealers</p></div> },
          { key: "offer_assigned_pairs", label: "Offer divided", render: (row) => <Quantity pairs={row.offer_assigned_pairs} size={row.pairs_per_carton} /> },
          { key: "offer_ordered_pairs", label: "Offer ordered / taken", render: (row) => <Quantity pairs={row.offer_ordered_pairs} size={row.pairs_per_carton} /> },
          { key: "offer_delivered_pairs", label: "Offer delivered", render: (row) => <Quantity pairs={row.offer_delivered_pairs} size={row.pairs_per_carton} /> },
          { key: "offer_not_delivered_pairs", label: "Offer not delivered", render: (row) => <Quantity pairs={row.offer_not_delivered_pairs} size={row.pairs_per_carton} /> },
          { key: "regular_ordered_pairs", label: "Regular ordered", render: (row) => <Quantity pairs={row.regular_ordered_pairs} size={row.pairs_per_carton} /> },
          { key: "regular_delivered_pairs", label: "Regular delivered", render: (row) => <Quantity pairs={row.regular_delivered_pairs} size={row.pairs_per_carton} /> },
          { key: "regular_not_delivered_pairs", label: "Regular not delivered", render: (row) => <Quantity pairs={row.regular_not_delivered_pairs} size={row.pairs_per_carton} /> },
        ]}
      />

      {dealerProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="dealer-report-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setDealerProduct(null); }}>
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4">
              <div>
                <h3 id="dealer-report-title" className="text-xl font-black text-slate-950">Dealer assignment and order details</h3>
                <p className="mt-1 text-sm font-semibold text-slate-700">FG.ID {dealerProduct.finished_good_id} · {dealerProduct.article_code || dealerProduct.product_name} · {dealerProduct.color} · {dealerProduct.size}</p>
                <p className="mt-1 text-xs text-slate-500">Report period: {reportPeriod.dateFrom} to {reportPeriod.dateTo}</p>
              </div>
              <button type="button" onClick={() => setDealerProduct(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Close</button>
            </div>

            <div className="overflow-auto">
              <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="border-b border-slate-300 px-4 py-3">Dealer</th>
                    <th className="border-b border-slate-300 px-4 py-3">Offer assigned</th>
                    <th className="border-b border-slate-300 px-4 py-3">Offer ordered / taken</th>
                    <th className="border-b border-slate-300 px-4 py-3">Offer delivered</th>
                    <th className="border-b border-slate-300 px-4 py-3">Offer not delivered</th>
                    <th className="border-b border-slate-300 px-4 py-3">Unused assignment</th>
                    <th className="border-b border-slate-300 px-4 py-3">Regular ordered</th>
                    <th className="border-b border-slate-300 px-4 py-3">Regular delivered</th>
                    <th className="border-b border-slate-300 px-4 py-3">Regular not delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {(dealerProduct.dealer_details || []).map((dealer) => (
                    <tr key={dealer.user_id || `${dealer.dealer_email}-${dealer.dealer_name}`} className="border-b border-slate-200 align-top last:border-b-0">
                      <td className="px-4 py-3"><p className="font-bold text-slate-950">{dealer.dealer_name}</p><p className="text-xs text-slate-500">{dealer.dealer_email || "No email"}</p></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.offer_assigned_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.offer_ordered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.offer_delivered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="bg-amber-50 px-4 py-3"><Quantity pairs={dealer.offer_not_delivered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.offer_unused_assigned_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.regular_ordered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="px-4 py-3"><Quantity pairs={dealer.regular_delivered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                      <td className="bg-amber-50 px-4 py-3"><Quantity pairs={dealer.regular_not_delivered_pairs} size={dealerProduct.pairs_per_carton} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dealerProduct.dealer_details?.length ? <p className="p-8 text-center text-sm text-slate-500">No dealer assignment or order was recorded for this product in the selected dates.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
