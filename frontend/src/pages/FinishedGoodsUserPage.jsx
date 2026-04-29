import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ item }) {
  const isLowStock = item.quantity < 10;

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white hover:shadow-xl transition-all duration-300 overflow-hidden">
      
      {/* Image */}
      <div className="h-52 bg-slate-100 overflow-hidden">
        {item.image_url ? (
          <img
            src={`${APP_BASE_URL}${item.image_url}`}
            alt={item.name}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            No Image
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
            {item.name}
          </h3>

          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium
              ${isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}
          >
            {isLowStock ? "Low Stock" : "In Stock"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {item.color && (
            <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
              {item.color}
            </span>
          )}
          {item.size && (
            <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
              {item.size}
            </span>
          )}
        </div>

        <div className="pt-2">
          <p className="text-xs text-slate-400">Stock</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatNumber(item.quantity)} {item.unit}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);

  // 🔥 Filter toggle
  const [showFilters, setShowFilters] = useState(false);

  // 🔥 Filter state
  const [filters, setFilters] = useState({
    search: "",
    color: "",
    size: "",
    stock: "all",
  });

  const load = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  // Unique options
  const colors = [...new Set(items.map((i) => i.color).filter(Boolean))];
  const sizes = [...new Set(items.map((i) => i.size).filter(Boolean))];

  // Filter logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !filters.search ||
        item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.article_code?.toLowerCase().includes(filters.search.toLowerCase());

      const matchColor = !filters.color || item.color === filters.color;
      const matchSize = !filters.size || item.size === filters.size;

      const matchStock =
        filters.stock === "all"
          ? true
          : filters.stock === "low"
          ? item.quantity < 10
          : item.quantity >= 10;

      return matchSearch && matchColor && matchSize && matchStock;
    });
  }, [items, filters]);

  return (
    <div className="space-y-6">
      
      {/* HEADER + FILTER BUTTON */}
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Catalog"
          title="Available finished goods"
          description="Browse products easily"
          icon="finishedGoods"
        />

       
      </div>
       <button
          onClick={() => setShowFilters((prev) => !prev)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white shadow-sm hover:shadow-md transition"
        >
          <Filter size={18} />
          <span className="text-sm font-medium">Filters</span>
        </button>

      {/* FILTER PANEL */}
      {showFilters && (
        <SectionCard title="Filters">
          <div className="grid gap-3 md:grid-cols-4">

            {/* Search */}
            <input
              type="text"
              placeholder="Search product..."
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            />

            {/* Color */}
            <select
              value={filters.color}
              onChange={(e) =>
                setFilters((f) => ({ ...f, color: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="">All Colors</option>
              {colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            {/* Size */}
            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((f) => ({ ...f, size: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="">All Sizes</option>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            {/* Stock */}
            <select
              value={filters.stock}
              onChange={(e) =>
                setFilters((f) => ({ ...f, stock: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="all">All Stock</option>
              <option value="available">In Stock</option>
              <option value="low">Low Stock</option>
            </select>

          </div>
        </SectionCard>
      )}

      {/* PRODUCTS */}
      {filteredItems.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No products found"
          description="Try changing filters or search keyword."
        />
      )}
    </div>
  );
}