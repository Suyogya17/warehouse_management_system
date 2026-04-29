import { useCallback, useEffect, useState } from "react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ item, onView }) {
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
        
        {/* Name + Stock Status */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
            {item.name}
          </h3>

          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap
              ${isLowStock 
                ? "bg-red-100 text-red-600" 
                : "bg-green-100 text-green-600"}`}
          >
            {isLowStock ? "Low Stock" : "In Stock"}
          </span>
        </div>

        {/* Meta */}
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

        {/* Stock Quantity */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-xs text-slate-400">Stock</p>
            <p className="text-sm font-semibold text-slate-900">
              {formatNumber(item.quantity)} {item.unit}
            </p>
          </div>

          {/* <button
            onClick={() => onView?.(item)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
          >
            Details →
          </button> */}
        </div>
      </div>
    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Available finished goods"
        description="Browse the products currently visible to users, including image, color, size, and stock."
        icon="finishedGoods"
      />

      {/* <SectionCard
        title="Product catalog"
        subtitle="Only products displayed by the admin appear here."
        icon="finishedGoods"
      > */}
        {items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No products available"
            description="There are no visible finished goods right now. Ask the admin to display products when stock is ready."
          />
        )}
      {/* </SectionCard> */}
    </div>
  );
}
