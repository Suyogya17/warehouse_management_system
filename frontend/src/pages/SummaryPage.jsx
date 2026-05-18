import { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

const TRACKED_STATUSES = ["DELIVERED"];
const statusTone = {
  DELIVERED: "success",
};

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getOrderDate = (order) => toDateInputValue(new Date(order.created_at));

const getItemCartons = (item) => {
  const pairs = Number(item.qty_ordered || 0);
  const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);
  return pairsPerCarton > 0 ? pairs / pairsPerCarton : 0;
};

const emptyStatusTotals = () => ({
  pairs: 0,
  cartons: 0,
  orders: new Set(),
});

export default function SummaryPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getOrders(token);
      setOrders(result.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Summary failed",
        message: error.message || "Could not load order summary.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    load();
  }, [load]);

  const summaryRows = useMemo(() => {
    const rowsByKey = new Map();

    orders
      .filter((order) => getOrderDate(order) === selectedDate)
      .filter((order) => TRACKED_STATUSES.includes(order.status))
      .forEach((order) => {
        const createdBy = order.created_by_name || "Unknown";

        (order.items || []).forEach((item) => {
          const productName = item.product_name || "Unknown product";
          const key = [
            selectedDate,
            createdBy,
            item.finished_good_id || productName,
          ].join("::");

          if (!rowsByKey.has(key)) {
            rowsByKey.set(key, {
              id: key,
              date: selectedDate,
              created_by_name: createdBy,
              product_name: productName,
              article_code: item.article_code || "-",
              unit: item.unit || "pairs",
              CONFIRMED: emptyStatusTotals(),
              PACKED: emptyStatusTotals(),
              DELIVERED: emptyStatusTotals(),
              CANCELLED: emptyStatusTotals(),
            });
          }

          const row = rowsByKey.get(key);
          const statusTotals = row[order.status];
          const pairs = Number(item.qty_ordered || 0);

          statusTotals.pairs += pairs;
          statusTotals.cartons += getItemCartons(item);
          statusTotals.orders.add(order.id);
        });
      });

    return Array.from(rowsByKey.values())
      .map((row) => ({
        ...row,
        total_pairs:
          row.CONFIRMED.pairs +row.PACKED+ row.DELIVERED.pairs + row.CANCELLED.pairs,
        total_cartons:
          row.CONFIRMED.cartons +row.PACKED+ row.DELIVERED.cartons + row.CANCELLED.cartons,
      }))
      .sort((a, b) => {
        const userCompare = a.created_by_name.localeCompare(b.created_by_name);
        if (userCompare !== 0) return userCompare;

        return a.product_name.localeCompare(b.product_name);
      });
  }, [orders, selectedDate]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return summaryRows;

    return summaryRows.filter((row) =>
      [
        row.created_by_name,
        row.product_name,
        row.article_code,
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [search, summaryRows]);

  const pageTotals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          TRACKED_STATUSES.forEach((status) => {
            acc[status].pairs += row[status].pairs;
            acc[status].cartons += row[status].cartons;
          });

          acc.total_pairs += row.total_pairs;
          acc.total_cartons += row.total_cartons;
          return acc;
        },
        {
          CONFIRMED: { pairs: 0, cartons: 0 },
          PACKED: { pairs:0, cartoons:0 },
          DELIVERED: { pairs: 0, cartons: 0 },
          CANCELLED: { pairs: 0, cartons: 0 },
          total_pairs: 0,
          total_cartons: 0,
        }
      ),
    [filteredRows]
  );

  const formatQty = (totals, unit = "pairs") => (
    <div className="space-y-1">
      <p>{formatNumber(totals.pairs)} {unit}</p>
      <p className="text-xs text-slate-400">
        {formatNumber(totals.cartons)} carton
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Confirmed Pairs"
          value={formatNumber(pageTotals.CONFIRMED.pairs)}
          tone="calm"
          icon="orders"
        />
        <StatCard
          label="Packed Pairs"
          value={formatNumber(pageTotals.PACKED.pairs)}
          tone="calm"
          icon="check"
        />
        <StatCard
          label="Delivered Pairs"
          value={formatNumber(pageTotals.DELIVERED.pairs)}
          tone="calm"
          icon="check"
        />
        <StatCard
          label="Cancelled Pairs"
          value={formatNumber(pageTotals.CANCELLED.pairs)}
          tone="alert"
          icon="warning"
        />
        <StatCard
          label="Total Cartons"
          value={formatNumber(pageTotals.total_cartons)}
          icon="stock"
        />
      </div>

      <SectionCard
        title="Daily order summary"
        subtitle="Products are grouped by order date, created by, and product."
        icon="orders"
      >
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user, product, or article..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 md:max-w-sm"
          />
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Loading summary...
          </div>
        ) : (
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "created_by_name", label: "Created By" },
              { key: "product_name", label: "Product" },
              { key: "article_code", label: "Article" },
              {
                key: "confirmed",
                label: "Confirmed",
                render: (row) => (
                  <div className="space-y-2">
                    <StatusBadge tone={statusTone.CONFIRMED}>CONFIRMED</StatusBadge>
                    {formatQty(row.CONFIRMED, row.unit)}
                  </div>
                ),
              },

              {
                key: "packed",
                label: "Packed",
                render: (row) => (
                  <div className="space-y-2">
                    <StatusBadge tone={statusTone.CONFIRMED}>PACKED</StatusBadge>
                    {formatQty(row.PACKED, row.unit)}
                  </div>
                ),
              },
              
              {
                key: "delivered",
                label: "Delivered",
                render: (row) => (
                  <div className="space-y-2">
                    <StatusBadge tone={statusTone.DELIVERED}>DELIVERED</StatusBadge>
                    {formatQty(row.DELIVERED, row.unit)}
                  </div>
                ),
              },
              {
                key: "cancelled",
                label: "Cancelled",
                render: (row) => (
                  <div className="space-y-2">
                    <StatusBadge tone={statusTone.CANCELLED}>CANCELLED</StatusBadge>
                    {formatQty(row.CANCELLED, row.unit)}
                  </div>
                ),
              },
              {
                key: "total",
                label: "Total",
                render: (row) => (
                  <div className="space-y-1 font-semibold text-slate-900">
                    <p>{formatNumber(row.total_pairs)} {row.unit}</p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(row.total_cartons)} carton
                    </p>
                  </div>
                ),
              },
            ]}
            rows={filteredRows}
            emptyTitle="No summary for this date"
            emptyDescription="Confirmed, delivered, and cancelled products will appear here."
          />
        )}
      </SectionCard>
    </div>
  );
}
