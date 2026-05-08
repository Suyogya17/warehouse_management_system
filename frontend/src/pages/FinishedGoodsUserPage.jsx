import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ variants }) {
  const [selectedVariant, setSelectedVariant] = useState(variants[0]);
useEffect(() => {
    setSelectedVariant(variants[0]);
  }, [variants]);

  // ADD HERE
 useEffect(() => {
  const otherVariants = variants.slice(1);

  otherVariants.forEach((variant) => {
    if (variant.image_url) {
      const image = new Image();

      image.loading = "eager";
      image.src = `${APP_BASE_URL}${variant.image_url}`;
    }
  });
}, [variants]);

  const isLowStock = selectedVariant.quantity < 10; 

  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) >
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(
        selectedVariant.quantity /
          selectedVariant.inner_boxes_per_outer_box
      )
    : 0;

  return (
    <div className="group rounded-xl border border-slate-200 bg-white hover:shadow-lg transition-all duration-300 overflow-hidden">
      
      {/* IMAGE */}
      <div className="h-36 sm:h-44 md:h-52 bg-slate-100 overflow-hidden relative">

        {/* NEW BADGE */}
        {isNew && (
          <div className="absolute top-2 left-2 bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold z-10">
            NEW
          </div>
        )}

        {selectedVariant.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-xs">
            No Image
          </div>
        )}

        {variants.length > 1 && (
          <div className="absolute top-2 right-2 bg-white/90 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium text-slate-700">
            {variants.length} colors
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 line-clamp-1">
            {selectedVariant.article_code ||
              selectedVariant.name.split("_").slice(0, -1).join("_")}
          </h3>

          <span
            className={`text-[10px] sm:text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-medium
            ${
              isLowStock
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
            }`}
          >
            {isLowStock ? "Low Stock" : "In Stock"}
          </span>
        </div>

{/* COLORS */}
{variants.length > 1 ? (
  <div className="space-y-1">
    <span className="text-[10px] sm:text-xs text-slate-500 font-medium">
      Colors:
    </span>

    <div className="flex items-center gap-1.5 flex-wrap">
      {variants.map((variant) => (
        <button
  key={variant.id}
  onClick={() => setSelectedVariant(variant)}
  className={`text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all
  ${
    selectedVariant.id === variant.id
      ? "bg-indigo-500 text-white"
      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`}
>
  {variant.color}
</button>
      ))}
    </div>
  </div>
) : (
  selectedVariant.color && (
    <span className="text-[10px] sm:text-xs bg-slate-100 px-2 py-1 rounded-md text-slate-600">
      {selectedVariant.color}
    </span>
  )
)}

        {/* SIZE */}
        {selectedVariant.size && (
          <span className="text-[10px] sm:text-xs bg-slate-100 px-2 py-1 rounded-md text-slate-600">
            Size: {selectedVariant.size}
          </span>
        )}

        {/* STOCK */}
        <div className="pt-2 border-t border-slate-100 flex justify-between">
          <div>
            <p className="text-[10px] sm:text-xs text-slate-400">
              Stock
            </p>

            <p className="text-xs sm:text-sm font-semibold text-slate-900">
              {formatNumber(selectedVariant.quantity)}{" "}
              {selectedVariant.unit}
            </p>
          </div>

          {selectedVariant.inner_boxes_per_outer_box && (
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-slate-400">
                Cartons
              </p>

              <p className="text-xs sm:text-sm font-semibold text-indigo-600">
                {formatNumber(cartons)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState("newest");

  const [filters, setFilters] = useState({
    search: "",
    color: "",
    size: "",
    stock: "all",
  });

  /* PAGINATION */
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 12;

  const load = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  const groupedProducts = useMemo(() => {
    const groups = {};

    items.forEach((item) => {
      const baseCode =
        item.article_code ||
        item.name.split("_").slice(0, -1).join("_") ||
        item.name;

      if (!groups[baseCode]) groups[baseCode] = [];

      groups[baseCode].push(item);
    });

    return Object.values(groups);
  }, [items]);

  const sizes = [
    ...new Set(items.map((i) => i.size).filter(Boolean)),
  ];

  const filteredProducts = useMemo(() => {
    return groupedProducts
      .map((variants) =>
        variants.filter((item) => {
          const matchSearch =
            !filters.search ||
            item.name
              .toLowerCase()
              .includes(filters.search.toLowerCase()) ||
            item.article_code
              ?.toLowerCase()
              .includes(filters.search.toLowerCase());

          const matchSize =
            !filters.size || item.size === filters.size;

          const matchStock =
            filters.stock === "all"
              ? true
              : filters.stock === "low"
              ? item.quantity < 10
              : item.quantity >= 10;

          return matchSearch && matchSize && matchStock;
        })
      )
      .filter((variants) => variants.length > 0)
      .sort((a, b) => {
        const dateA = new Date(a[0].created_at || 0);
        const dateB = new Date(b[0].created_at || 0);

        return sort === "newest"
          ? dateB - dateA
          : dateA - dateB;
      });
  }, [groupedProducts, filters, sort]);

  /* RESET PAGE WHEN FILTER CHANGES */
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sort]);

  /* PAGINATION LOGIC */
  const totalPages = Math.ceil(
    filteredProducts.length / productsPerPage
  );

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Available finished goods"
        description="Browse products easily"
        icon="finishedGoods"
      />

      {/* BUTTONS */}
      <div className="flex justify-end gap-2">

        {/* FILTER BUTTON */}
        <button
          onClick={() => setShowFilters((prev) => !prev)}
          className="px-4 py-2 border rounded-xl bg-white"
        >
          <Filter size={16} />
        </button>

        {/* SORT BUTTON */}
        <button
  onClick={() =>
    setSort((prev) =>
      prev === "newest" ? "oldest" : "newest"
    )
  }
  className={`px-4 py-2 border rounded-xl text-sm font-medium transition-all
  ${
    sort === "newest"
      ? "bg-indigo-500 text-white border-indigo-500"
      : "bg-white text-slate-700 hover:bg-slate-100"
  }`}
>
  {sort === "newest" ? "Newest" : "Oldest"}
</button>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <SectionCard title="Filters">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">

            {/* SEARCH */}
            <input
              type="text"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  search: e.target.value,
                }))
              }
              className="border rounded-xl px-3 py-2 text-sm"
            />

            {/* SIZE */}
            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  size: e.target.value,
                }))
              }
              className="border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">All Sizes</option>

              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            {/* STOCK */}
            <select
              value={filters.stock}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  stock: e.target.value,
                }))
              }
              className="border rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">All Stock</option>
              <option value="available">In Stock</option>
              <option value="low">Low Stock</option>
            </select>
          </div>
        </SectionCard>
      )}

      {/* PRODUCTS */}
      {paginatedProducts.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">

            {paginatedProducts.map((variants, i) => (
              <ProductCard key={i} variants={variants} />
            ))}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">

              {/* PREVIOUS */}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.max(p - 1, 1))
                }
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl border bg-white disabled:opacity-50"
              >
                Previous
              </button>

             {/* PAGE NUMBERS */}
<div className="flex items-center gap-2 flex-wrap">

  {Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;

    return (
      <button
        key={page}
        onClick={() => setCurrentPage(page)}
        className={`min-w-[38px] h-10 px-3 rounded-xl border text-sm font-medium transition-all
        ${
          currentPage === page
            ? "bg-indigo-500 text-white border-indigo-500"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        {page}
      </button>
    );
  })}
</div>

              {/* NEXT */}
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(p + 1, totalPages)
                  )
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl border bg-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState title="No products found" />
      )}
    </div>
  );
}