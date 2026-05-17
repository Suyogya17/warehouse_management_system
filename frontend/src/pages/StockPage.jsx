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

export default function StockPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [availability, setAvailability] = useState([]);
  const [search, setSearch] = useState("");
  // const [rawMaterialAvailability, setRawMaterialAvailability] = useState([]);
  // const [rawMaterialSearch, setRawMaterialSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const load = useCallback(async () => {
    const result = await api.getAvailability(token);
    setAvailability(result.data || []);
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

  const filteredAvailability = useMemo(() => {
    const q = search.trim().toLowerCase();

    return availability
      .filter((item) => {
        const available = Number(item.available_qty || 0);

        if (stockFilter === "available" && available <= 0) return false;
        if (stockFilter === "out" && available > 0) return false;

        if (!q) return true;

        return (
          (item.name || "").toLowerCase().includes(q) ||
          (item.article_code || "").toLowerCase().includes(q) ||
          (item.sole_code || "").toLowerCase().includes(q) ||
          (item.color || "").toLowerCase().includes(q) ||
          (item.size || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Number(b.available_qty || 0) - Number(a.available_qty || 0));
  }, [availability, search, stockFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        description="Physical stock, reservations, and available stock by product."
        icon="stock"
      />
      {/* Product Availability */}
      <SectionCard title="Products Availability" icon="stock">
        <div className="p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
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
          </div>

          <DataTable
            columns={[
              { key: "name", label: "Product" },
              { key: "article_code", label: "Article" },
              { key: "color", label: "Color" },
              {
                key: "physical_stock",
                label: "Physical",
                render: (row) => `${formatNumber(row.physical_stock)} ${row.unit}`,
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
            emptyTitle="No stock found"
            emptyDescription="Try a different search or stock filter."
          />
        </div>
      </SectionCard>

      {/* Raw Material Availability */}
      {/* <SectionCard title ="Raw Material Availability" icon="stock">
        <div className="p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <input
              type="text"
              value={rawMaterialSearch}
              onChange={(event) => setRawMaterialSearch(event.target.value)}
              placeholder="Search raw material..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
            <select
              value={rawMaterialStockFilter}
              onChange={(event) => setRawMaterialStockFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All stock</option>
              <option value="available">Available only</option>
              <option value="out">Out only</option>
            </select>
          </div>

          <DataTable
            columns={[
              { key: "name", label: "Product" },
              { key: "article_code", label: "Article" },
              { key: "color", label: "Color" },
              {
                key: "physical_stock",
                label: "Physical",
                render: (row) => `${formatNumber(row.physical_stock)} ${row.unit}`,
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
            emptyTitle="No stock found"
            emptyDescription="Try a different search or stock filter."
          />
        </div>
      </SectionCard> */}
    </div>
  );
}
