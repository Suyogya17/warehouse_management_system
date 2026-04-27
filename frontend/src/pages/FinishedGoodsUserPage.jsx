import { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ item }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-[4/3] bg-slate-100">
        {item.image_url ? (
          <img
            src={`${APP_BASE_URL}${item.image_url}`}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No image available
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Finished good</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{item.name}</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Color</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{item.color || "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Size</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{item.size || "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Stock</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatNumber(item.quantity)} {item.unit}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    api
      .getFinishedGoods(token)
      .then((result) => setItems(result.data || []))
      .catch(console.error);
  }, [token]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Available finished goods"
        description="Browse the products currently visible to users, including image, color, size, and stock."
        icon="finishedGoods"
      />

      <SectionCard
        title="Product catalog"
        subtitle="Only products displayed by the admin appear here."
        icon="finishedGoods"
      >
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
      </SectionCard>
    </div>
  );
}
