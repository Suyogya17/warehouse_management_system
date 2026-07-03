import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

const getCartons = (quantity, item) => {
  const pairs = Number(quantity || 0);
  const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);

  return pairsPerCarton > 0 ? Math.floor(pairs / pairsPerCarton) : 0;
};

const formatWarehouses = (warehouses = [], unit = "pairs") =>
  warehouses.length
    ? warehouses
        .map((warehouse) => `${warehouse.warehouse_name} (${formatNumber(warehouse.quantity)} ${unit})`)
        .join(", ")
    : "-";

const getWarehouseTotal = (warehouses = []) =>
  warehouses.reduce((sum, warehouse) => sum + Number(warehouse.quantity || 0), 0);

export default function StockPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [availability, setAvailability] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [search, setSearch] = useState("");
  const [searchId, setSearchId] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const load = useCallback(async () => {
    const [availabilityResult, warehouseStockResult] = await Promise.all([
      api.getAvailability(token, { includeHidden: true }),
      api.getWarehouseStock(token),
    ]);

    setAvailability(availabilityResult.data || []);
    setWarehouseStock((warehouseStockResult.data || []).filter((row) => Number(row.quantity || 0) > 0));
  }, [token]);

  useEffect(() => {
    load().catch((error) => {
      showToast({
        tone: "error",
        title: "Product stock failed to load",
        message: error.message || "Could not load product stock availability.",
      });
    });
  }, [load, showToast]);

  useDataRefresh(load, "stock");

  const warehousesByProductId = useMemo(() => {
    const groups = new Map();

    warehouseStock.forEach((row) => {
      const key = String(row.finished_good_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    return groups;
  }, [warehouseStock]);

  const filteredAvailability = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qId = searchId.trim().toLowerCase();

    return availability
      .filter((item) => {
        const available = Number(item.available_qty || 0);

        if (stockFilter === "available" && available <= 0) return false;
        if (stockFilter === "out" && available > 0) return false;

        if (qId && !String(item.id || "").toLowerCase().includes(qId)) return false;

        if (!q) return true;

        const warehouses = formatWarehouses(
          warehousesByProductId.get(String(item.id)) || [],
          item.unit || "pairs"
        );

        return (
          (item.name || "").toLowerCase().includes(q) ||
          (item.article_code || "").toLowerCase().includes(q) ||
          (item.sole_code || "").toLowerCase().includes(q) ||
          (item.color || "").toLowerCase().includes(q) ||
          (item.size || "").toLowerCase().includes(q) ||
          warehouses.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Number(b.available_qty || 0) - Number(a.available_qty || 0));
  }, [availability, search, searchId, stockFilter, warehousesByProductId]);

  const exportToExcel = () => {
    if (!filteredAvailability.length) {
      showToast({
        tone: "error",
        title: "Nothing to export",
        message: "No stock rows match the current filter.",
      });
      return;
    }

    const rows = filteredAvailability.map((item) => ({
      "FG.ID": item.id || "",
      Product: item.name || "",
      Article: item.article_code || "",
      Warehouse: formatWarehouses(
        warehousesByProductId.get(String(item.id)) || [],
        item.unit || "pairs"
      ),
      Color: item.color || "",
      Size: item.size || "",
      "Physical Stock": Number(item.physical_stock || 0),
      "Warehouse Total": getWarehouseTotal(warehousesByProductId.get(String(item.id)) || []),
      Reserved: Number(item.reserved_qty || 0),
      Available: Number(item.available_qty || 0),
      CTN: getCartons(item.available_qty, item),
      Unit: item.unit || "",
      Visibility: Number(item.is_visible) === 1 ? "Displayed" : "On hold",
      Status: Number(item.available_qty || 0) > 0 ? "Available" : "Out",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 8  }, // FG.ID
      { wch: 32 }, // Product
      { wch: 14 }, // Article
      { wch: 30 }, // Warehouse
      { wch: 14 }, // Color
      { wch: 10 }, // Size
      { wch: 14 }, // Physical Stock
      { wch: 16 }, // Warehouse Total
      { wch: 12 }, // Reserved
      { wch: 12 }, // Available
      { wch: 10 }, // CTN
      { wch: 8  }, // Unit
      { wch: 12 }, // Visibility
      { wch: 12 }, // Status
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `stock-availability-${today}.xlsx`);

    showToast({
      tone: "success",
      title: "Excel exported",
      message: `${rows.length} row${rows.length === 1 ? "" : "s"} exported.`,
    });
  };
const totalPhysical  = filteredAvailability.reduce((sum, item) => sum + Number(item.physical_stock || 0), 0);
const totalReserved  = filteredAvailability.reduce((sum, item) => sum + Number(item.reserved_qty  || 0), 0);
const totalAvailable = filteredAvailability.reduce((sum, item) => sum + Number(item.available_qty || 0), 0);
const totalAvailableCartons = filteredAvailability.reduce((sum, item) => sum + getCartons(item.available_qty, item), 0);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        description="Physical stock, reservations, and available stock by product."
        icon="stock"
      />

      <SectionCard title="Products Availability" icon="stock">
        <div className="p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[80px_minmax(0,1fr)_180px_auto]">
            <input
              type="text"
              value={searchId}
              onChange={(event) => setSearchId(event.target.value)}
              placeholder="FG.ID..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, article, sole, color, or size..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All stock</option>
              <option value="available">Available only</option>
              <option value="out">Out only</option>
            </select>
            <button
              onClick={exportToExcel}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 whitespace-nowrap"
            >
              Export Excel
            </button>
          </div>

          <DataTable
            columns={[
              { key: "id", label: "FG.ID" },
              { key: "name", label: "Product" },
              { key: "article_code", label: "Article" },
              {
                key: "warehouse",
                label: "Warehouse",
                render: (row) => (
                  <div className="max-w-56 text-xs text-slate-500">
                    {formatWarehouses(
                      warehousesByProductId.get(String(row.id)) || [],
                      row.unit || "pairs"
                    )}
                  </div>
                ),
              },
              { key: "size", label: "Size" },
              { key: "color", label: "Color" },
              {
                key: "physical_stock",
                label: "Product Stock",
                render: (row) => `${formatNumber(row.physical_stock)} ${row.unit}`,
              },
              {
                key: "warehouse_total",
                label: "Warehouse Total",
                render: (row) => {
                  const warehouseTotal = getWarehouseTotal(
                    warehousesByProductId.get(String(row.id)) || []
                  );
                  const productStock = Number(row.physical_stock || 0);
                  const difference = warehouseTotal - productStock;

                  return (
                    <div className="space-y-1">
                      <p>{formatNumber(warehouseTotal)} {row.unit}</p>
                      {difference !== 0 ? (
                        <StatusBadge tone="warning">
                          {difference > 0 ? "+" : ""}{formatNumber(difference)} mismatch
                        </StatusBadge>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: "reserved_qty",
                label: "Reserved",
                render: (row) => `${formatNumber(row.reserved_qty)} ${row.unit}`,
              },
              {
                key: "available_qty",
                label: "Available",
                render: (row) => `${formatNumber(row.available_qty)} ${row.unit}`,
              },
              {
                key: "ctn",
                label: "CTN",
                render: (row) => formatNumber(getCartons(row.available_qty, row)),
              },
              {
                key: "visibility",
                label: "Visibility",
                render: (row) => (
                  <StatusBadge tone={Number(row.is_visible) === 1 ? "success" : "neutral"}>
                    {Number(row.is_visible) === 1 ? "Displayed" : "On hold"}
                  </StatusBadge>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <StatusBadge tone={Number(row.available_qty || 0) > 0 ? "success" : "danger"}>
                    {Number(row.available_qty || 0) > 0 ? "Available" : "Out"}
                  </StatusBadge>
                ),
              },
            ]}
            rows={filteredAvailability}
            showToolbar={false}
            emptyTitle="No stock found"
            emptyDescription="Try a different search or stock filter."
          />
         <div className="mt-3 flex justify-center gap-6 px-2">
  <span className="text-sm text-slate-500">
    Physical: <span className="font-medium text-slate-800">{formatNumber(totalPhysical)}</span>
  </span>
  <span className="text-sm text-slate-500">
    Reserved: <span className="font-medium text-slate-800">{formatNumber(totalReserved)}</span>
  </span>
  <span className="text-sm text-slate-500">
    Available: <span className="font-medium text-green-700">{formatNumber(totalAvailable)}</span>
  </span>
  <span className="text-sm text-slate-500">
    CTN: <span className="font-medium text-green-700">{formatNumber(totalAvailableCartons)}</span>
  </span>
</div>
        </div>
      </SectionCard>
    </div>
  );
}
