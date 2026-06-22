import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Package as PackageIcon, Eye, EyeOff } from "lucide-react";

import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import StatCard from "../components/StatCard";

import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber, formatPrice } from "../utils/format";

const getAvailableQty = (product) =>
  Number(product?.available_qty ?? product?.display_quantity ?? product?.quantity ?? 0);

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

// ─────────────────────────────────────────────────────────────
// ProductCard — dashboard product card with lightbox
// ─────────────────────────────────────────────────────────────
function ProductCard({ variants = [], canManageVisibility = false, onToggleVisibility }) {
  const [selectedVariant, setSelectedVariant] = useState(variants?.[0] || null);

  useEffect(() => {
    if (!variants?.length) { setSelectedVariant(null); return; }
    setSelectedVariant((current) => {
      const refreshed = variants.find((v) => Number(v.id) === Number(current?.id));
      if (refreshed) return refreshed;
      return variants.find((v) => getAvailableQty(v) > 0) || variants[0];
    });
  }, [variants]);

  if (!selectedVariant) return null; // ✅ safe now

  const availableQty = getAvailableQty(selectedVariant);
  const isLowStock   = availableQty > 0 && availableQty < 10;
  const isOutOfStock = availableQty <= 0;
  const isHidden = Number(selectedVariant.is_visible) !== 1;
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(availableQty / Number(selectedVariant.inner_boxes_per_outer_box))
    : 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">

      {/* IMAGE */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 cursor-zoom-in"
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
          {isHidden && (
            <span className="bg-amber-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1">
              <EyeOff size={12} />
              Hidden
            </span>
          )}
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold text-sm">Out of Stock</span>
          </div>
        )}
        <ProductImageGallery
          variants={variants}
          selectedVariant={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      {/* CONTENT */}
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
        {selectedVariant.sole_code && (
          <div className="text-xs text-slate-600">
            Sole: <span className="font-semibold">{selectedVariant.sole_code}</span>
          </div>
        )}
        {selectedVariant.size && (
          <div className="text-xs text-slate-600">Size: <span className="font-semibold">{selectedVariant.size}</span></div>
        )}
        {variants.length >= 1 && (
          <div className="flex gap-1 overflow-x-auto whitespace-wrap">
            {variants.map((variant) => (
              <button key={variant.id} onClick={() => setSelectedVariant(variant)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all
                  ${selectedVariant.id === variant.id ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {variant.color}
              </button>
            ))}
          </div>
        )}
       <div className=" rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">Price</span>
            <span className="text-sm font-bold text-emerald-700">{formatPrice(selectedVariant.price)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900">Available pairs: </span>
            <span className="text-sm font-bold text-slate-900">{formatNumber(availableQty)} {selectedVariant.unit || "pcs"}</span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-amber-200 pt-2">
              <span className="text-xs text-indigo-900">Cartons</span>
              <span className="text-xs font-bold text-indigo-500">{formatNumber(cartons)}</span>
            </div>
          )}
        </div>
        {canManageVisibility && (
          <button
            type="button"
            onClick={() => onToggleVisibility?.(selectedVariant)}
            aria-label={isHidden ? "Show product" : "Hide product"}
            title={isHidden ? "Show product" : "Hide product"}
            className={`mt-1 inline-flex h-10 w-10 items-center justify-center self-end rounded-xl transition ${
              isHidden
                ? "bg-indigo-500 text-white hover:bg-indigo-600"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200"
            }`}
          >
            {isHidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OnHoldCard — with lightbox
// ─────────────────────────────────────────────────────────────
function OnHoldCard({ variants = [], canManageVisibility = false, onToggleVisibility }) {
  const [selectedVariant, setSelectedVariant] = useState(variants?.[0] || null);

  useEffect(() => {
    if (!variants?.length) { setSelectedVariant(null); return; }
    setSelectedVariant((current) => {
      const refreshed = variants.find((v) => Number(v.id) === Number(current?.id));
      if (refreshed) return refreshed;
      return variants.find((v) => Number(v.quantity || 0) > 0) || variants[0];
    });
  }, [variants]);

  if (!selectedVariant) return null; // ✅ safe now

  const availableQty = Number(selectedVariant?.quantity || 0);
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(availableQty / Number(selectedVariant.inner_boxes_per_outer_box))
    : 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-amber-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">

      {/* IMAGE */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 opacity-60 cursor-zoom-in"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={42} />
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {isNew ? (
            <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold opacity-80">NEW</span>
          ) : <div />}
        </div>
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
          <span className="bg-amber-500 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2">
            <EyeOff size={14} />
            On Hold
          </span>
        </div>
        <ProductImageGallery
          variants={variants}
          selectedVariant={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      {/* CONTENT */}
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
        {variants.length >= 1 && (
          <div className="flex gap-1">
            {variants.map((variant) => (
              <button key={variant.id} onClick={() => setSelectedVariant(variant)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all
                  ${selectedVariant.id === variant.id
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
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
            <span className="text-sm font-bold text-slate-900">{formatNumber(availableQty)} {selectedVariant.unit || "pcs"}</span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-amber-200 pt-2">
              <span className="text-xs text-amber-600">Cartons</span>
              <span className="text-sm font-bold text-amber-700">{formatNumber(cartons)}</span>
            </div>
          )}
        </div>
        {canManageVisibility && Number(selectedVariant.is_visible) !== 1 && (
          <button
            type="button"
            onClick={() => onToggleVisibility?.(selectedVariant)}
            aria-label="Show product"
            title="Show product"
            className="mt-1 inline-flex h-10 w-10 items-center justify-center self-end rounded-xl bg-indigo-500 text-white transition hover:bg-indigo-600"
          >
            <Eye size={18} />
          </button>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PaginationBar — unchanged
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

function AdvertisementBanner({ advertisements = [] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (current >= advertisements.length) setCurrent(0);
  }, [advertisements.length, current]);

  useEffect(() => {
    if (paused || advertisements.length < 2) return undefined;
    const timer = window.setInterval(
      () => setCurrent((index) => (index + 1) % advertisements.length),
      5000
    );
    return () => window.clearInterval(timer);
  }, [advertisements.length, paused]);

  if (!advertisements.length) return null;
  const item = advertisements[current];
  const goTo = (index) => setCurrent((index + advertisements.length) % advertisements.length);
  const bannerHeight = Math.min(600, Math.max(180, Number(item.height_px || 320)));
  const bannerWidth = Math.min(100, Math.max(50, Number(item.width_percent || 100)));

  const content = (
    <article style={{ height: `${bannerHeight}px` }} className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900 shadow-xl">
      {item.image_url ? (
        item.media_type === "VIDEO" ? (
          <video
            key={item.id}
            src={`${APP_BASE_URL}${item.image_url}`}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <img src={`${APP_BASE_URL}${item.image_url}`} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]" />
        )
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/5" />
      <div className="relative flex h-full max-w-3xl flex-col justify-center px-8 py-12 text-white sm:px-16">
        <h2 className="max-w-2xl text-3xl font-black leading-tight tracking-tight drop-shadow-lg sm:text-5xl">{item.title}</h2>
        {item.message ? <p className="mt-4 max-w-xl text-sm leading-6 text-white/90 drop-shadow sm:text-lg">{item.message}</p> : null}
        {item.link_url ? <span className="mt-6 inline-flex w-fit items-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition group-hover:bg-indigo-50">View offer <span className="ml-2">→</span></span> : null}
      </div>
      {advertisements.length > 1 ? <span className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">{current + 1} / {advertisements.length}</span> : null}
    </article>
  );

  return (
    <section aria-label="Promotions" aria-roledescription="carousel" style={{ "--banner-width": `${bannerWidth}%` }} className="relative w-full sm:w-[var(--banner-width)] sm:mx-auto" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {item.link_url ? <a href={item.link_url} target="_blank" rel="noreferrer" className="block">{content}</a> : content}
      {advertisements.length > 1 ? (
        <>
          <button type="button" onClick={() => goTo(current - 1)} aria-label="Previous promotion" className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60"><ChevronLeft size={21} /></button>
          <button type="button" onClick={() => goTo(current + 1)} aria-label="Next promotion" className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60"><ChevronRight size={21} /></button>
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-full bg-black/25 px-3 py-2 backdrop-blur-sm">
            {advertisements.map((advertisement, index) => <button key={advertisement.id} type="button" onClick={() => goTo(index)} aria-label={`Show promotion ${index + 1}`} className={`h-2.5 rounded-full transition-all ${index === current ? "w-7 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80"}`} />)}
          </div>
        </>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// DashboardPage — unchanged
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState({
    stock: null,
    finishedGoods: [],
    formulas: [],
    production: [],
    consumption: [],
    orders: [],
    availability: [],
    permissions: [],
    advertisements: [],
  });

  const [search, setSearch]             = useState("");
  const [stockFilter, setStockFilter]   = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [onHoldSearch, setOnHoldSearch] = useState("");
  const [onHoldSeriesFilter, setOnHoldSeriesFilter] = useState("");
  const [currentPage, setCurrentPage]   = useState(1);
  const [onHoldPage, setOnHoldPage]     = useState(1);
  const PRODUCTS_PER_PAGE = 12;

  const isAdmin = user.role === "ADMIN" || user.role === "CO_ADMIN";
  const canViewDashboard = isAdmin || user.role === "MEMBER";

  const load = useCallback(async () => {
    const [
      stock,
      finishedGoods,
      formulas,
      production,
      consumption,
      orders,
      availability,
      permissions,
      advertisements,
    ] = await Promise.all([
      user.role !== "USER" ? api.getStockSummary(token) : Promise.resolve(null),
      api.getFinishedGoods(token),
      user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }),
      user.role !== "USER" ? api.getProductionHistory(token, { limit: 20, include_total: 0 }) : Promise.resolve({ data: [] }),
      user.role !== "MEMBER" ? api.getConsumptionLogs(token, { limit: 20, include_total: 0 }) : Promise.resolve({ data: [] }),
      user.role !== "MEMBER" ? api.getOrders(token, { limit: 100 }) : Promise.resolve({ data: [] }),
      isAdmin || user.role === "MEMBER"
        ? api.getAvailability(token, { includeHidden: isAdmin })
        : Promise.resolve({ data: [] }),
      isAdmin ? api.getPermissions(token) : Promise.resolve({ data: [] }),
      user.role === "USER" ? api.getAdvertisements(token) : Promise.resolve({ data: [] }),
    ]);

    setState({
      stock,
      finishedGoods: finishedGoods.data || [],
      formulas:      formulas.data      || [],
      production:    production.data    || [],
      consumption:   consumption.data   || [],
      orders:        orders.data        || [],
      availability:  availability.data  || [],
      permissions:   permissions.data   || [],
      advertisements: advertisements.data || [],
    });
  }, [token, user.role, isAdmin]);

  useEffect(() => { load().catch(console.error); }, [load]);
  useDataRefresh(load, "dashboard");

  const toggleVisibility = async (product) => {
    if (!isAdmin || !product) return;

    const nextVisible = Number(product.is_visible) !== 1;
    const label = product.article_code || product.name || "Product";

    try {
      await api.setFinishedGoodVisibility(product.id, { is_visible: nextVisible }, token);
      showToast({
        tone: "success",
        title: nextVisible ? "Product unhidden" : "Product hidden",
        message: `${label} was ${nextVisible ? "shown" : "hidden"} successfully.`,
      });
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Visibility update failed",
        message: error.message,
      });
    }
  };

  const lowStock      = state.stock?.low_stock_alerts?.length || 0;
  const finishedTotal = state.finishedGoods.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const rawTotal      = state.stock?.data?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

  const userOrders      = state.orders || [];
  const pendingOrders   = userOrders.filter((o) => o.status === "PENDING").length;
  const confirmedOrders = userOrders.filter((o) => o.status === "CONFIRMED").length;
  const deliveredOrders = userOrders.filter((o) => o.status === "DELIVERED").length;

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

  const seriesList = useMemo(
    () =>
      [
        ...new Set(
          state.availability.map((item) => getSeriesName(item.sole_code)).filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [state.availability]
  );

  const filteredProducts = useMemo(() => {
    return groupedProducts
      .map((variants) =>
        variants.filter((item) => {
          const isVisible = Number(item.is_visible) === 1;
          const matchSearch =
            !search ||
            item.name?.toLowerCase().includes(search.toLowerCase()) ||
            item.article_code?.toLowerCase().includes(search.toLowerCase());
          const qty = getAvailableQty(item);
          const matchStock =
            stockFilter === "all"         ? true
            : stockFilter === "available" ? qty >= 1
            : stockFilter === "out"       ? qty <= 0
            : qty > 0 && qty < 10;
          const matchSeries = !seriesFilter || getSeriesName(item.sole_code) === seriesFilter;
          return isVisible && matchSearch && matchStock && matchSeries;
        })
      )
      .filter((v) => v.length > 0)
      .sort((a, b) => new Date(b[0]?.created_at || 0) - new Date(a[0]?.created_at || 0));
  }, [groupedProducts, search, stockFilter, seriesFilter]);

  const onHoldBaseItems = useMemo(() => {
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
    return state.finishedGoods.filter(
        (product) =>
          Number(product.is_visible) !== 1 ||
          !activeProductIds.has(Number(product.id))
      );
  }, [state.permissions, state.finishedGoods]);

  const onHoldSeriesList = useMemo(
    () =>
      [...new Set(onHoldBaseItems.map((item) => getSeriesName(item.sole_code)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [onHoldBaseItems]
  );

  const onHoldProducts = useMemo(() => {
    const q = onHoldSearch.trim().toLowerCase();
    const onHoldItems = onHoldBaseItems
      .filter((product) => {
        const matchesSearch = !q || (
          (product.name         || "").toLowerCase().includes(q) ||
          (product.article_code || "").toLowerCase().includes(q) ||
          (product.sole_code    || "").toLowerCase().includes(q) ||
          (product.color        || "").toLowerCase().includes(q) ||
          (product.size         || "").toLowerCase().includes(q)
        );
        const matchesSeries =
          !onHoldSeriesFilter || getSeriesName(product.sole_code) === onHoldSeriesFilter;
        return matchesSearch && matchesSeries;
      });
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
  }, [onHoldBaseItems, onHoldSearch, onHoldSeriesFilter]);

  useEffect(() => { setCurrentPage(1); }, [search, stockFilter, seriesFilter]);
  useEffect(() => { setOnHoldPage(1); }, [onHoldSearch, onHoldSeriesFilter]);

  const totalPages        = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const onHoldTotal       = Math.ceil(onHoldProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE);
  const paginatedOnHold   = onHoldProducts.slice((onHoldPage - 1) * PRODUCTS_PER_PAGE, onHoldPage * PRODUCTS_PER_PAGE);
  const advertisementsAboveStatus = state.advertisements.filter(
    (advertisement) => advertisement.placement === "ABOVE_STATUS"
  );
  const advertisementsBelowStatus = state.advertisements.filter(
    (advertisement) => advertisement.placement !== "ABOVE_STATUS"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${user.role.replace("_", " ")} workspace`}
        title="Daily operations overview"
        description="Monitor raw-material health, production activity, and finished-goods readiness in one place."
        icon="dashboard"
      />

      {user.role === "USER" && advertisementsAboveStatus.length > 0 && (
        <AdvertisementBanner advertisements={advertisementsAboveStatus} />
      )}

      {/* STAT CARDS */}
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
            <StatCard label="Raw Material Stock"            value={formatNumber(rawTotal)}      tone="calm"    icon="materials" />
            <StatCard label="Finished Goods Stock In Pairs" value={formatNumber(finishedTotal)} tone="calm"    icon="finishedGoods" />
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

      {user.role === "USER" && advertisementsBelowStatus.length > 0 && (
        <AdvertisementBanner advertisements={advertisementsBelowStatus} />
      )}

      {/* FINISHED GOODS GRID */}
      {canViewDashboard && (
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
                <option value="out">Out of Stock</option>
              </select>
              <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value="">All Series</option>
                {seriesList.map((series) => (
                  <option key={series} value={series}>
                    {series}
                  </option>
                ))}
              </select>
              {(search || stockFilter !== "all" || seriesFilter) && (
                <button onClick={() => { setSearch(""); setStockFilter("all"); setSeriesFilter(""); }}
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
                  <ProductCard
                    key={variants.map((v) => v.id).join("-")}
                    variants={variants}
                    canManageVisibility={isAdmin}
                    onToggleVisibility={toggleVisibility}
                  />
                ))}
              </div>
              <PaginationBar total={totalPages} current={currentPage} setPage={setCurrentPage} />
            </>
          ) : (
            <div className="text-center py-16 text-slate-400 text-sm">No products found.</div>
          )}
        </div>
      )}

      {/* ON HOLD GRID */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <EyeOff size={18} className="text-amber-500" />
              On Hold&nbsp;
              <span className="text-slate-400 font-normal text-base">({onHoldProducts.length})</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="Search on hold…" value={onHoldSearch}
                onChange={(e) => setOnHoldSearch(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <select value={onHoldSeriesFilter} onChange={(e) => setOnHoldSeriesFilter(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent">
                <option value="">All Series</option>
                {onHoldSeriesList.map((series) => (
                  <option key={series} value={series}>{series}</option>
                ))}
              </select>
              {(onHoldSearch || onHoldSeriesFilter) && (
                <button onClick={() => { setOnHoldSearch(""); setOnHoldSeriesFilter(""); }}
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
                  <OnHoldCard
                    key={variants.map((v) => v.id).join("-")}
                    variants={variants}
                    canManageVisibility={isAdmin}
                    onToggleVisibility={toggleVisibility}
                  />
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
