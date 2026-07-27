import { useMemo, useState } from "react";
import Button from "../../components/Button";
import DataTable from "../../components/DataTable";
import { formatDate, formatNumber, formatUserPrice } from "../../utils/format";

export default function OfferPurchases({ purchases, loading, viewer }) {
  const [search, setSearch] = useState("");

  const filteredPurchases = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return purchases.filter((row) => {
      const searchable = [
        row.article_code,
        row.product_name,
        row.sole_code,
        row.color,
        row.customer_name,
        row.account_name,
        row.account_email,
        row.status,
        row.delivery_note_number,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [purchases, search]);

  const summary = useMemo(() => {
    const delivered = filteredPurchases.filter(
      (row) => row.status === "DELIVERED"
    );
    return {
      orderCount: new Set(
        filteredPurchases.map((row) => Number(row.order_id))
      ).size,
      orderedPairs: filteredPurchases.reduce(
        (sum, row) => sum + Number(row.qty_ordered || 0),
        0
      ),
      orderedCartons: filteredPurchases.reduce((sum, row) => {
        const pairsPerCarton = Number(
          row.offer_pairs_per_carton_snapshot || 0
        );
        return (
          sum +
          (pairsPerCarton > 0
            ? Number(row.qty_ordered || 0) / pairsPerCarton
            : 0)
        );
      }, 0),
      deliveredPairs: delivered.reduce(
        (sum, row) => sum + Number(row.qty_ordered || 0),
        0
      ),
      deliveredSales: delivered.reduce(
        (sum, row) =>
          sum +
          Number(row.qty_ordered || 0) *
            Number(row.offer_price_snapshot || 0),
        0
      ),
    };
  }, [filteredPurchases]);

  const groupedPurchases = useMemo(() => {
    const groups = new Map();
    filteredPurchases.forEach((row) => {
      const orderId = Number(row.order_id);
      if (!groups.has(orderId)) {
        groups.set(orderId, { ...row, items: [] });
      }
      groups.get(orderId).items.push(row);
    });
    return [...groups.values()].map((order) => ({
      ...order,
      total_offer_pairs: order.items.reduce(
        (sum, item) => sum + Number(item.qty_ordered || 0),
        0
      ),
      total_offer_cartons: order.items.reduce((sum, item) => {
        const pairsPerCarton = Number(
          item.offer_pairs_per_carton_snapshot || 0
        );
        return (
          sum +
          (pairsPerCarton > 0
            ? Number(item.qty_ordered || 0) / pairsPerCarton
            : 0)
        );
      }, 0),
    }));
  }, [filteredPurchases]);

  const exportPurchases = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredPurchases.map((row) => ({
      "Order ID": row.order_id,
      "Delivery Note": row.delivery_note_number || "",
      Product: row.article_code || row.product_name,
      Series: row.sole_code || "",
      Color: row.color || "",
      Customer: row.customer_name || row.account_name || "",
      Email: row.account_email || "",
      Status: row.status,
      "Ordered Pairs": Number(row.qty_ordered || 0),
      "Ordered CTN":
        Number(row.offer_pairs_per_carton_snapshot || 0) > 0
          ? Number(row.qty_ordered || 0) /
            Number(row.offer_pairs_per_carton_snapshot)
          : 0,
      "Offer Price": Number(row.offer_price_snapshot || 0),
      "Offer Label": row.offer_label_snapshot || "",
      "Assigned Percentage": row.offer_display_percentage ?? "",
      "Assigned Pair Limit": row.offer_display_quantity ?? "",
      "Order Date": formatDate(row.created_at),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "Offer Purchases"
    );
    XLSX.writeFile(workbook, "offer-purchases.xlsx");
  };

  const columns = [
    {
      key: "order_id",
      label: "Order / DN",
      render: (row) =>
        `#${row.order_id}${
          row.delivery_note_number ? ` / ${row.delivery_note_number}` : ""
        }`,
    },
    {
      key: "customer",
      label: "Customer",
      render: (row) =>
        row.customer_name ||
        row.account_name ||
        row.account_email ||
        "-",
    },
    {
      key: "user",
      label: "User",
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-800">
            {row.account_name || "-"}
          </p>
          <p className="text-xs text-slate-500">{row.account_email || "-"}</p>
        </div>
      ),
    },
    {
      key: "items",
      label: "Offer Items",
      render: (row) => (
        <div className="min-w-[250px] space-y-1">
          {row.items.map((item) => {
            const cartons =
              Number(item.offer_pairs_per_carton_snapshot || 0) > 0
                ? Number(item.qty_ordered) /
                  Number(item.offer_pairs_per_carton_snapshot)
                : 0;
            return (
              <div
                key={item.order_item_id}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
              >
                <p className="font-semibold leading-tight text-slate-900">
                  {item.article_code || item.product_name}
                  {item.sole_code ? ` / ${item.sole_code}` : ""}
                  {item.color ? ` / ${item.color}` : ""}
                </p>
                <p className="mt-0.5 leading-tight text-slate-500">
                  {formatNumber(item.qty_ordered)} pairs /{" "}
                  {formatNumber(cartons)} CTN ·{" "}
                  {item.offer_price_snapshot === null
                    ? "-"
                    : formatUserPrice(item.offer_price_snapshot, viewer)}
                </p>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "total_offer_quantity",
      label: "Total Ordered",
      exportValue: (row) =>
        `${formatNumber(row.total_offer_cartons)} CTN / ${formatNumber(
          row.total_offer_pairs
        )} pairs`,
      render: (row) => (
        <div className="min-w-[110px] rounded-lg bg-indigo-50 px-2.5 py-2">
          <p className="font-bold text-indigo-700">
            {formatNumber(row.total_offer_cartons)} CTN
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">
            {formatNumber(row.total_offer_pairs)} pairs
          </p>
        </div>
      ),
    },
    { key: "status", label: "Status" },
    {
      key: "created_at",
      label: "Order Date",
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Offer Purchases</h3>
          <p className="text-sm text-slate-500">
            Permanent snapshots of orders placed from active offers.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={exportPurchases}
          disabled={!filteredPurchases.length}
        >
          Export Excel
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs uppercase text-slate-500">Offer orders</p>
          <p className="text-xl font-bold">
            {formatNumber(summary.orderCount)}
          </p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase text-indigo-600">
            Total ordered CTN
          </p>
          <p className="text-xl font-bold text-indigo-800">
            {formatNumber(summary.orderedCartons)}
          </p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase text-indigo-600">
            Total ordered pairs
          </p>
          <p className="text-xl font-bold text-indigo-800">
            {formatNumber(summary.orderedPairs)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs uppercase text-slate-500">Delivered pairs</p>
          <p className="text-xl font-bold">
            {formatNumber(summary.deliveredPairs)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs uppercase text-slate-500">
            Delivered offer sales
          </p>
          <p className="text-xl font-bold">
            {formatUserPrice(summary.deliveredSales, viewer)}
          </p>
        </div>
      </div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search product, series, customer, status or DN..."
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
      />
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading offer purchases...
        </p>
      ) : (
        <DataTable
          rows={groupedPurchases}
          emptyTitle="No offer purchases recorded"
          columns={columns}
        />
      )}
    </div>
  );
}
