import { useCallback, useEffect, useMemo, useState } from "react";
import { Package as PackageIcon, EyeOff } from "lucide-react";

import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const getAvailableQty = (product) =>
  Number(product?.available_qty ?? product?.display_quantity ?? product?.quantity ?? 0);

// ─────────────────────────────────────────────────────────────
// ProductCard — read-only, no cart
// ─────────────────────────────────────────────────────────────
function ProductCard({ variants = [] }) {
  const [selectedVariant, setSelectedVariant] = useState(variants?.[0] || null);

  useEffect(() => {
    if (!variants?.length) { setSelectedVariant(null); return; }
    setSelectedVariant((current) => {
      const refreshed = variants.find((v) => Number(v.id) === Number(current?.id));
      if (refreshed) return refreshed;
      return variants.find((v) => getAvailableQty(v) > 0) || variants[0];
    });
  }, [variants]);

  if (!selectedVariant) return null;

  const availableQty = getAvailableQty(selectedVariant);
  const isLowStock   = availableQty > 0 && availableQty < 10;
  const isOutOfStock = availableQty <= 0;
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(availableQty / Number(selectedVariant.inner_boxes_per_outer_box))
    : 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={42} />
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {isNew ? (
            <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold">NEW</span>
          ) : <div />}
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold text-sm">Out of Stock</span>
          </div>
        )}
      </div>

      <div className="flex flex-col p-3 gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>
          <span className={`text-[10px] px-2 py-1 rounded-full font-semibold whitespace-nowrap
            ${isOutOfStock ? "bg-gray-100 text-gray-600" : isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
            {isOutOfStock ? "Out" : isLowStock ? "Low" : "In Stock"}
          </span>
        </div>
        {selectedVariant.size && (
          <div className="text-xs text-slate-600">Size: <span className="font-semibold">{selectedVariant.size}</span></div>
        )}
        {variants.length >= 1 && (
          <div className="flex flex-wrap gap-1">
            {variants.map((variant) => (
              <button key={variant.id} onClick={() => setSelectedVariant(variant)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all
                  ${selectedVariant.id === variant.id ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {variant.color}
              </button>
            ))}
          </div>
        )}
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Available Stock</span>
            <span className="text-sm font-bold text-slate-900">{formatNumber(availableQty)} {selectedVariant.unit || "pcs"}</span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-xs text-slate-500">Cartons</span>
              <span className="text-sm font-bold text-indigo-600">{formatNumber(cartons)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OnHoldCard — with color variant selection
// ─────────────────────────────────────────────────────────────
function OnHoldCard({ variants = [] }) {
  const [selectedVariant, setSelectedVariant] = useState(variants?.[0] || null);

  useEffect(() => {
    if (!variants?.length) { setSelectedVariant(null); return; }
    setSelectedVariant((current) => {
      const refreshed = variants.find((v) => Number(v.id) === Number(current?.id));
      if (refreshed) return refreshed;
      return variants.find((v) => Number(v.quantity || 0) > 0) || variants[0];
    });
  }, [variants]);

  if (!selectedVariant) return null;

  const availableQty = Number(selectedVariant?.quantity || 0);
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(availableQty / Number(selectedVariant.inner_boxes_per_outer_box))
    : 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-amber-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 opacity-60"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={42} />
          </div>
        )}
        
        {/* BADGES */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {isNew ? (
            <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold opacity-80">NEW</span>
          ) : <div />}
        </div>
        
        {/* ON HOLD OVERLAY */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="bg-amber-500 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2">
            <EyeOff size={14} />
            On Hold
          </span>
        </div>
      </div>

      <div className="flex flex-col p-3 gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>
          <span className="text-[10px] px-2 py-1 rounded-full font-semibold whitespace-nowrap bg-amber-100 text-amber-700">
            On Hold
          </span>
        </div>
        
        {selectedVariant.size && (
          <div className="text-xs text-slate-600">Size: <span className="font-semibold">{selectedVariant.size}</span></div>
        )}
        
        {/* COLOR VARIANTS */}
        {variants.length >= 1 && (
          <div className="flex flex-wrap gap-1">
            {variants.map((variant) => (
              <button 
                key={variant.id} 
                onClick={() => setSelectedVariant(variant)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all
                  ${selectedVariant.id === variant.id 
                    ? "bg-amber-500 text-white" 
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                {variant.color}
              </button>
            ))}
          </div>
        )}
        
        {selectedVariant.sole_code && (
          <div className="text-xs text-slate-600">
            Sole: <span className="font-semibold">{selectedVariant.sole_code}</span>
          </div>
        )}
        
        <div className="bg-amber-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-600">Stock</span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(availableQty)} {selectedVariant.unit || "pcs"}
            </span>
          </div>
          
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-amber-200 pt-2">
              <span className="text-xs text-amber-600">Cartons</span>
              <span className="text-sm font-bold text-amber-700">
                {formatNumber(cartons)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reusable pagination bar
// ─────────────────────────────────────────────────────────────
function PaginationBar({ total, current, setPage }) {
  if (total <= 1) return null;

  const getPages = () => {
    const pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else if (current <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", total);
    } else if (current >= total - 3) {
      pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, "...", current - 1, current, current + 1, "...", total);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
      <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={current === 1}
        className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-medium">
        Previous
      </button>
      {getPages().map((page, index) =>
        page === "..." ? (
          <span key={index} className="px-2 text-slate-400">...</span>
        ) : (
          <button key={index} onClick={() => setPage(page)}
            className={`w-10 h-10 rounded-xl border text-sm font-semibold transition-all
              ${current === page ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
            {page}
          </button>
        )
      )}
      <button onClick={() => setPage((p) => Math.min(p + 1, total))} disabled={current === total}
        className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-medium">
        Next
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DashboardPage
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { token, user } = useAuth();

  const [state, setState] = useState({
    stock: null,
    finishedGoods: [],
    formulas: [],
    production: [],
    consumption: [],
    orders: [],
    availability: [],
    permissions: [],
  });

  const [search, setSearch]             = useState("");
  const [stockFilter, setStockFilter]   = useState("all");
  const [onHoldSearch, setOnHoldSearch] = useState("");
  const [currentPage, setCurrentPage]   = useState(1);
  const [onHoldPage, setOnHoldPage]     = useState(1);
  const PRODUCTS_PER_PAGE = 12;

  const isAdmin = user.role === "ADMIN" || user.role === "CO_ADMIN";

  const load = useCallback(async () => {
    const requests = [];

    if (user.role !== "USER") requests.push(api.getStockSummary(token));
    else requests.push(Promise.resolve(null));

    requests.push(api.getFinishedGoods(token));
    requests.push(user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "USER" ? api.getProductionHistory(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "STORE_KEEPER" ? api.getConsumptionLogs(token) : Promise.resolve({ data: [] }));
    requests.push(user.role !== "STORE_KEEPER" ? api.getOrders(token) : Promise.resolve({ data: [] }));

    if (isAdmin) {
      requests.push(api.getAvailability(token));
      requests.push(api.getPermissions(token));
    } else {
      requests.push(Promise.resolve({ data: [] }));
      requests.push(Promise.resolve({ data: [] }));
    }

    const [stock, finishedGoods, formulas, production, consumption, orders, availability, permissions] =
      await Promise.all(requests);

    setState({
      stock,
      finishedGoods: finishedGoods.data || [],
      formulas:      formulas.data      || [],
      production:    production.data    || [],
      consumption:   consumption.data   || [],
      orders:        orders.data        || [],
      availability:  availability.data  || [],
      permissions:   permissions.data   || [],
    });
  }, [token, user.role, isAdmin]);

  useEffect(() => { load().catch(console.error); }, [load]);
  useDataRefresh(load, "dashboard");

  // ── Stat values ───────────────────────────────────────────
  const lowStock      = state.stock?.low_stock_alerts?.length || 0;
  const finishedTotal = state.finishedGoods.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const rawTotal      = state.stock?.data?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

  const userOrders      = state.orders || [];
  const pendingOrders   = userOrders.filter((o) => o.status === "PENDING").length;
  const confirmedOrders = userOrders.filter((o) => o.status === "CONFIRMED").length;
  const deliveredOrders = userOrders.filter((o) => o.status === "DELIVERED").length;

  // ── Group availability by article_code ────────────────────
  const groupedProducts = useMemo(() => {
    const groups = {};
    state.availability.forEach((item) => {
      const key =
        item.article_code ||
        item.name?.split("_")?.slice(0, -1)?.join("_") ||
        item.name ||
        `product-${item.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.values(groups);
  }, [state.availability]);

  // ── Filter finished goods ─────────────────────────────────
  const filteredProducts = useMemo(() => {
    return groupedProducts
      .map((variants) =>
        variants.filter((item) => {
          const matchSearch =
            !search ||
            item.name?.toLowerCase().includes(search.toLowerCase()) ||
            item.article_code?.toLowerCase().includes(search.toLowerCase());

          const qty = getAvailableQty(item);
          const matchStock =
            stockFilter === "all"         ? true
            : stockFilter === "available" ? qty >= 1
            : stockFilter === "out"       ? qty <= 0
            : qty > 0 && qty < 10;        // low

          return matchSearch && matchStock;
        })
      )
      .filter((v) => v.length > 0)
      .sort((a, b) => new Date(b[0]?.created_at || 0) - new Date(a[0]?.created_at || 0));
  }, [groupedProducts, search, stockFilter]);

  // ── On Hold products with grouping ───────────
  const onHoldProducts = useMemo(() => {
    const q = onHoldSearch.trim().toLowerCase();

    const deniedKeys = new Set(
      state.permissions
        .filter((p) => Number(p.can_view) === 0)
        .map((p) => `${Number(p.user_id)}:${Number(p.finished_good_id)}`)
    );

    const activeProductIds = new Set();
    state.permissions.forEach((p) => {
      const key = `${Number(p.user_id)}:${Number(p.finished_good_id)}`;
      if (Number(p.can_view) === 1 && !deniedKeys.has(key)) {
        activeProductIds.add(Number(p.finished_good_id));
      }
    });

    const onHoldItems = state.finishedGoods
      .filter((product) => !activeProductIds.has(Number(product.id)))
      .filter((product) => {
        if (!q) return true;
        return (
          (product.name         || "").toLowerCase().includes(q) ||
          (product.article_code || "").toLowerCase().includes(q) ||
          (product.sole_code    || "").toLowerCase().includes(q) ||
          (product.color        || "").toLowerCase().includes(q) ||
          (product.size         || "").toLowerCase().includes(q)
        );
      });

    // Group by article_code
    const groups = {};
    onHoldItems.forEach((item) => {
      const key =
        item.article_code ||
        item.name?.split("_")?.slice(0, -1)?.join("_") ||
        item.name ||
        `product-${item.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return Object.values(groups);
  }, [state.permissions, state.finishedGoods, onHoldSearch]);

  useEffect(() => { setCurrentPage(1); }, [search, stockFilter]);
  useEffect(() => { setOnHoldPage(1); }, [onHoldSearch]);

  // ── Pagination ────────────────────────────────────────────
  const totalPages     = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const onHoldTotal    = Math.ceil(onHoldProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE);
  const paginatedOnHold   = onHoldProducts.slice((onHoldPage - 1) * PRODUCTS_PER_PAGE, onHoldPage * PRODUCTS_PER_PAGE);

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${user.role.replace("_", " ")} workspace`}
        title="Daily operations overview"
        description="Monitor raw-material health, production activity, and finished-goods readiness in one place."
        icon="dashboard"
      />

      {/* ── STAT CARDS ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {user.role === "USER" ? (
          <>
            <StatCard label="Catalog Status"   value="Active"                        tone="default" icon="finishedGoods" />
            <StatCard label="Pending Orders"   value={formatNumber(pendingOrders)}   tone="alert"   icon="orders" />
            <StatCard label="Confirmed Orders" value={formatNumber(confirmedOrders)} tone="calm"    icon="check" />
            <StatCard label="Delivered Orders" value={formatNumber(deliveredOrders)} tone="default" icon="check" />
          </>
        ) : (
          <>
            <StatCard label="Raw Material Stock"            value={formatNumber(rawTotal)}       tone="calm"  icon="materials" />
            <StatCard label="Finished Goods Stock In Pairs" value={formatNumber(finishedTotal)}  tone="calm"  icon="finishedGoods" />
            {/* <StatCard label="Low Stock Alerts"              value={formatNumber(lowStock)}        tone={lowStock ? "alert" : "default"} icon={lowStock ? "warning" : "check"} /> */}
            <StatCard label="Production Runs"               value={formatNumber(state.production.length)} tone="default" icon="production" />
            <StatCard label="Active Orders"
              value={formatNumber(state.orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status)).length)}
              tone="alert" icon="orders"
            />
            {isAdmin && (
              <StatCard label="On Hold Products" value={formatNumber(onHoldProducts.length)} tone="alert" icon="hidden" />
            )}
          </>
        )}
      </div>

      {/* ── FINISHED GOODS GRID ── */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">
              Finished Goods&nbsp;
              <span className="text-slate-400 font-normal text-base">({filteredProducts.length})</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="Search products…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value="all">All Stock</option>
                <option value="available">In Stock</option>
                {/* <option value="low">Low Stock</option> */}
                <option value="out">Out of Stock</option>
              </select>
              {(search || stockFilter !== "all") && (
                <button onClick={() => { setSearch(""); setStockFilter("all"); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                  Clear
                </button>
              )}
            </div>
          </div>

          {paginatedProducts.length ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {paginatedProducts.map((variants) => (
                  <ProductCard key={variants.map((v) => v.id).join("-")} variants={variants} />
                ))}
              </div>
              <PaginationBar total={totalPages} current={currentPage} setPage={setCurrentPage} />
            </>
          ) : (
            <div className="text-center py-16 text-slate-400 text-sm">No products found.</div>
          )}
        </div>
      )}

      {/* ── ON HOLD GRID ── */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <EyeOff size={18} className="text-amber-500" />
              On Hold&nbsp;
              <span className="text-slate-400 font-normal text-base">({onHoldProducts.length})</span>
            </h2>
            <div className="flex gap-2">
              <input type="text" placeholder="Search on hold…" value={onHoldSearch}
                onChange={(e) => setOnHoldSearch(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              {onHoldSearch && (
                <button onClick={() => setOnHoldSearch("")}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                  Clear
                </button>
              )}
            </div>
          </div>

          {paginatedOnHold.length ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {paginatedOnHold.map((variants) => (
                  <OnHoldCard key={variants.map((v) => v.id).join("-")} variants={variants} />
                ))}
              </div>
              <PaginationBar total={onHoldTotal} current={onHoldPage} setPage={setOnHoldPage} />
            </>
          ) : (
            <div className="text-center py-16 text-slate-400 text-sm">
              {onHoldSearch ? "No on hold products match your search." : "No products are currently on hold."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}