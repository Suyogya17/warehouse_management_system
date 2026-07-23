import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Package as PackageIcon, Eye, EyeOff, Megaphone, ShoppingBag, Sparkles } from "lucide-react";

import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import StatCard from "../components/StatCard";

import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber, formatUserPrice } from "../utils/format";
import { canManageProductVisibility } from "../utils/pagePermissions";
import { getCommissionLabel, isCommissionProduct } from "../utils/commission";
import { getRoundedCartons } from "../utils/displayStock";

const getAvailableQty = (product) =>
  Number(product?.available_qty ?? product?.display_quantity ?? product?.quantity ?? 0);

const getGroupDisplayOrder = (variants = []) =>
  Math.min(...variants.map((variant) => Number(variant.display_order || 999999)));

const sortByDisplayOrder = (a, b) => {
  const orderDiff = Number(a.display_order || 999999) - Number(b.display_order || 999999);
  if (orderDiff !== 0) return orderDiff;

  return Number(a.id || 0) - Number(b.id || 0);
};

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const isActiveOffer = (product) =>
  Number(product?.offer_enabled) === 1 &&
  (!product?.offer_ends_at || new Date(product.offer_ends_at).getTime() >= Date.now());

const advertisementPlacement = (advertisement) =>
  String(advertisement?.placement || "BELOW_STATUS").trim().toUpperCase();

const countryNames = {
  NP: "Nepal",
  IN: "India",
};

const getCountryLabel = (countryCode = "NP") =>
  countryNames[String(countryCode || "NP").toUpperCase()] || String(countryCode || "NP").toUpperCase();

// ─────────────────────────────────────────────────────────────
// ProductCard — dashboard product card with lightbox
// ─────────────────────────────────────────────────────────────
function ProductCard({
  variants = [],
  canManageVisibility = false,
  onShowForCountry,
  onHideForCountry,
  user,
}) {
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
  const cartons = getRoundedCartons(availableQty, selectedVariant.inner_boxes_per_outer_box);

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">

      {/* IMAGE */}
      <div className="relative aspect-[5/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 cursor-zoom-in"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
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
            <span className="bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold text-xs">Out of Stock</span>
          </div>
        )}
        <ProductImageGallery
          variants={variants}
          selectedVariant={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      {/* CONTENT */}
      <div className="flex flex-col p-2.5 gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
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
        <div>
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
              isCommissionProduct(selectedVariant)
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {getCommissionLabel(selectedVariant)}
          </span>
        </div>
        {variants.length >= 1 && (
          <div className="flex gap-1 overflow-x-auto whitespace-wrap">
            {variants.map((variant) => (
              <button key={variant.id} onClick={() => setSelectedVariant(variant)}
                className={`px-2 py-0.5 rounded-lg text-xs font-medium transition-all
                  ${selectedVariant.id === variant.id ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {variant.color}
              </button>
            ))}
          </div>
        )}
       <div className=" rounded-xl p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">Price</span>
            <span className="text-sm font-bold text-emerald-700">{formatUserPrice(selectedVariant.price, user)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900">Available pairs: </span>
            <span className="text-sm font-bold text-slate-900">{formatNumber(availableQty)} {selectedVariant.unit || "pcs"}</span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-amber-200 pt-1.5">
              <span className="text-xs text-indigo-900">Cartons</span>
              <span className="text-xs font-bold text-indigo-500">{formatNumber(cartons)}</span>
            </div>
          )}
        </div>
        {canManageVisibility && (
          <div className="mt-1 rounded-xl border border-slate-100 bg-white p-2">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              {isHidden ? "Show to" : "Hide from"}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["NP", "Nepal"],
                ["IN", "India"],
                ["both", "Both"],
              ].map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() =>
                    isHidden
                      ? onShowForCountry?.(selectedVariant, scope)
                      : onHideForCountry?.(selectedVariant, scope)
                  }
                  className={`h-8 rounded-lg px-2 text-[11px] font-bold transition focus:outline-none focus:ring-2 ${
                    isHidden
                      ? "bg-indigo-500 text-white hover:bg-indigo-600 focus:ring-indigo-300"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200 focus:ring-amber-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OnHoldCard — with lightbox
// ─────────────────────────────────────────────────────────────
function OnHoldCard({ variants = [], canManageVisibility = false, onShowForCountry }) {
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
  const cartons = getRoundedCartons(availableQty, selectedVariant.inner_boxes_per_outer_box);

  return (
    <div className="group flex flex-col rounded-2xl border border-amber-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">

      {/* IMAGE */}
      <div className="relative aspect-[5/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy" decoding="async" width={400} height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 opacity-60 cursor-zoom-in"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {isNew ? (
            <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold opacity-80">NEW</span>
          ) : <div />}
        </div>
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
          <span className="bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2">
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
      <div className="flex flex-col p-2.5 gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
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
                className={`px-2 py-0.5 rounded-lg text-xs font-medium transition-all
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
        <div className="bg-amber-50 rounded-xl p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-600">Stock</span>
            <span className="text-sm font-bold text-slate-900">{formatNumber(availableQty)} {selectedVariant.unit || "pcs"}</span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-amber-200 pt-1.5">
              <span className="text-xs text-amber-600">Cartons</span>
              <span className="text-sm font-bold text-amber-700">{formatNumber(cartons)}</span>
            </div>
          )}
        </div>
        {canManageVisibility && (
          <div className="mt-1 rounded-xl border border-amber-100 bg-white p-2">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Eye size={13} />
              Show to
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["NP", "Nepal"],
                ["IN", "India"],
                ["both", "Both"],
              ].map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onShowForCountry?.(selectedVariant, scope)}
                  className="h-8 rounded-lg bg-indigo-500 px-2 text-[11px] font-bold text-white transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
      <div className="absolute inset-0 " />
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

function AdvertisementMedia({ item, className = "" }) {
  if (!item?.image_url) {
    return <div className={`flex items-center justify-center bg-slate-100 text-sm text-slate-400 ${className}`}>No media</div>;
  }

  if (item.media_type === "VIDEO") {
    return (
      <video
        src={`${APP_BASE_URL}${item.image_url}`}
        controls
        playsInline
        preload="metadata"
        className={`bg-black object-cover ${className}`}
      />
    );
  }

  return (
    <img
      src={`${APP_BASE_URL}${item.image_url}`}
      alt={item.title}
      className={`object-cover ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}

function AdvertisementFeed({ advertisements = [], variant = "facebook" }) {
  if (!advertisements.length) return null;

  const isInstagram = variant === "instagram";
  const mediaAspect = isInstagram ? "aspect-square" : "aspect-[5/3]";

  return (
    <section aria-label="Promotions">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,360px))] gap-4">
        {advertisements.map((item) => {
          const card = (
            <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg">
              <div className="relative overflow-hidden bg-slate-100">
                <AdvertisementMedia item={item} className={`${mediaAspect} w-full transition duration-500 group-hover:scale-[1.03]`} />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-950">{item.title}</h3>
                  {item.message ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.message}</p> : null}
                </div>
                {item.link_url ? (
                  <span className="mt-auto inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition group-hover:bg-indigo-600">
                    View promotion
                  </span>
                ) : null}
              </div>
            </article>
          );

          return item.link_url ? (
            <a key={item.id} href={item.link_url} target="_blank" rel="noreferrer" className="block">
              {card}
            </a>
          ) : (
            <div key={item.id}>{card}</div>
          );
        })}
      </div>
    </section>
  );
}

function PublishedNotices({ notices = [] }) {
  if (!notices.length) return null;

  return (
    <section aria-label="Notices" className="space-y-3">
      {notices.map((notice) => (
        <article
          key={notice.id}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-slate-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Megaphone size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-5 text-slate-950">{notice.title}</h2>
              {notice.message ? (
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {notice.message}
                </p>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function UserDashboardShowcase({ products = [], notices = [], user }) {
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const productGroups = useMemo(() => {
    const groups = {};
    products
      .filter((product) => Number(product.is_visible) === 1 && !isActiveOffer(product))
      .forEach((item) => {
        const key =
          item.article_code ||
          item.name?.split("_")?.slice(0, -1)?.join("_") ||
          item.name ||
          `product-${item.id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });

    return Object.values(groups)
      .map((variants) => [...variants].sort(sortByDisplayOrder))
      .sort((a, b) => getGroupDisplayOrder(a) - getGroupDisplayOrder(b));
  }, [products]);

  const newestProductGroups = useMemo(
    () =>
      [...productGroups]
        .sort((a, b) => {
          const newestA = Math.max(...a.map((item) => new Date(item.created_at || 0).getTime() || 0));
          const newestB = Math.max(...b.map((item) => new Date(item.created_at || 0).getTime() || 0));
          return newestB - newestA;
        })
        .slice(0, 5),
    [productGroups]
  );
  const adminFeaturedGroups = useMemo(
    () =>
      productGroups
        .filter((group) => group.some((item) => Number(item.dashboard_featured) === 1))
        .sort((a, b) => {
          const orderA = Math.min(...a.map((item) => Number(item.dashboard_featured_order || 999999)));
          const orderB = Math.min(...b.map((item) => Number(item.dashboard_featured_order || 999999)));
          return orderA - orderB;
        })
        .slice(0, 5),
    [productGroups]
  );
  const carouselProductGroups = adminFeaturedGroups.length ? adminFeaturedGroups : newestProductGroups;

  useEffect(() => {
    setFeaturedIndex(0);
  }, [carouselProductGroups.length]);

  useEffect(() => {
    if (carouselProductGroups.length < 2) return undefined;

    const timer = window.setInterval(
      () => setFeaturedIndex((index) => (index + 1) % carouselProductGroups.length),
      5000
    );

    return () => window.clearInterval(timer);
  }, [carouselProductGroups.length]);

  const featuredGroup = carouselProductGroups[featuredIndex] || productGroups[0] || [];
  const featured = featuredGroup.find((item) => item.image_url) || featuredGroup[0] || null;
  const featuredSlides = carouselProductGroups.map((group) => group.find((item) => item.image_url) || group[0]);
  const articleCards = productGroups
    .filter((group) => group[0]?.id !== featuredGroup[0]?.id)
    .slice(0, 3)
    .map((group) => group.find((item) => item.image_url) || group[0]);
  const mainNotice = notices[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <ShoppingBag size={18} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase text-indigo-600">Customer catalog</p>
              <h2 className="text-lg font-bold text-slate-950">Products, articles & notices</h2>
            </div>
          </div>
          <Link
            to="/finished-goods"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            Our products <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="relative aspect-[16/11] overflow-hidden bg-slate-100 sm:aspect-[16/9]">
            <div
              className="flex h-full transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${featuredIndex * 100}%)` }}
            >
              {(featuredSlides.length ? featuredSlides : [featured]).map((slide, index) => (
                <div key={slide?.id || index} className="relative flex h-full w-full shrink-0 items-center justify-center bg-slate-100">
                  {slide?.image_url ? (
                    <img
                      src={`${APP_BASE_URL}${slide.image_url}`}
                      alt={slide.article_code || slide.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center text-slate-400">
                      <PackageIcon size={52} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
              {adminFeaturedGroups.length ? "Featured" : "Newest"}
            </span>
            {carouselProductGroups.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setFeaturedIndex((index) => (index - 1 + carouselProductGroups.length) % carouselProductGroups.length)}
                  aria-label="Previous newest product"
                  className="absolute left-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setFeaturedIndex((index) => (index + 1) % carouselProductGroups.length)}
                  aria-label="Next newest product"
                  className="absolute right-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/85 px-3 py-2 shadow-sm">
                  {carouselProductGroups.map((group, index) => (
                    <button
                      key={group.map((item) => item.id).join("-")}
                      type="button"
                      onClick={() => setFeaturedIndex(index)}
                      aria-label={`Show newest product ${index + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        index === featuredIndex ? "w-6 bg-indigo-600" : "w-2 bg-slate-300 hover:bg-slate-400"
                      }`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-5 border-t border-slate-100 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-indigo-600">
                  {adminFeaturedGroups.length ? "Featured product" : "Newest product"} {carouselProductGroups.length > 1 ? `${featuredIndex + 1} / ${carouselProductGroups.length}` : ""}
                </p>
                <h1 className="mt-2 break-words text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  {featured?.article_code || featured?.name || "Our Products"}
                </h1>
                <p className="mt-2 break-words text-sm font-semibold text-slate-600">
                  {featured?.name || "Browse latest articles and available stock"}
                </p>
              </div>
              <Link
                to="/finished-goods"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-indigo-600"
              >
                Start shopping <ArrowRight size={16} />
              </Link>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-slate-500">Available</p>
                <p className="mt-1 font-bold text-slate-950">{formatNumber(getAvailableQty(featured))} {featured?.unit || "pcs"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-slate-500">Price</p>
                <p className="mt-1 font-bold text-emerald-700">{featured ? formatUserPrice(featured.price, user) : "-"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-slate-500">Color</p>
                <p className="mt-1 font-bold text-slate-950">{featured?.color || "-"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-slate-500">Size</p>
                <p className="mt-1 font-bold text-slate-950">{featured?.size || "-"}</p>
              </div>
            </div>

            {featuredSlides.length > 1 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {featuredSlides.map((slide, index) => (
                  <button
                    key={slide?.id || index}
                    type="button"
                    onClick={() => setFeaturedIndex(index)}
                    className={`overflow-hidden rounded-xl border bg-white text-left transition ${
                      index === featuredIndex
                        ? "border-indigo-500 ring-2 ring-indigo-100"
                        : "border-slate-200 hover:border-indigo-200"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-slate-100">
                      {slide?.image_url ? (
                        <img
                          src={`${APP_BASE_URL}${slide.image_url}`}
                          alt={slide.article_code || slide.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <PackageIcon size={18} />
                        </div>
                      )}
                    </div>
                    <p className="truncate px-2 py-1 text-[11px] font-bold text-slate-700">
                      {slide?.article_code || slide?.name || "-"}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Megaphone size={20} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-amber-700">Announcement</p>
                <h3 className="mt-2 text-lg font-black text-slate-950">
                  {mainNotice?.title || "Notice !!!"}
                </h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {mainNotice?.message ||
                    "We are pleased to announce that our products and articles are available in the catalog. Please check stock and price before placing your order."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase text-slate-500">Articles</p>
              <span className="text-xs font-semibold text-slate-500">{formatNumber(productGroups.length)} total</span>
            </div>
            {articleCards.length ? articleCards.map((item) => (
              <Link
                key={item.id}
                to="/finished-goods"
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {item.image_url ? (
                    <img src={`${APP_BASE_URL}${item.image_url}`} alt={item.article_code || item.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <PackageIcon size={22} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-950">{item.article_code || item.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.color || "Color"} · {item.size || "Size"}</p>
                  <p className="mt-1 text-xs font-bold text-emerald-700">{formatUserPrice(item.price, user)}</p>
                </div>
                <ArrowRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </Link>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
                No product articles are available yet.
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function AdminDashboardControls() {
  const controls = [
    {
      title: "Products & articles",
      description: "Control product visibility, article order, and country access.",
      to: "/product-display",
      icon: ShoppingBag,
      tone: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    },
    {
      title: "Announcement & notice",
      description: "Publish notices, banners, and dashboard advertisements.",
      to: "/advertisements",
      icon: Megaphone,
      tone: "bg-amber-50 text-amber-700 ring-amber-100",
    },
    {
      title: "Product content",
      description: "Edit product photos, prices, article codes, size, and color.",
      to: "/finished-goods",
      icon: Sparkles,
      tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-indigo-600">Dashboard controls</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Control customer dashboard content</h2>
          <p className="mt-1 text-sm text-slate-500">
            Admin and Co-admin can control products, articles, announcements, notices, and advertisements from here.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {controls.map((item) => {
          const ControlIcon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-indigo-200 hover:bg-white hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${item.tone}`}>
                  <ControlIcon size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-600">
                    Manage <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
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
    users: [],
    advertisements: [],
  });

  const [search, setSearch]             = useState("");
  const [stockFilter, setStockFilter]   = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [onHoldSearch, setOnHoldSearch] = useState("");
  const [onHoldSeriesFilter, setOnHoldSeriesFilter] = useState("");
  const [selectedHoldCountry, setSelectedHoldCountry] = useState("NP");
  const [currentPage, setCurrentPage]   = useState(1);
  const [onHoldPage, setOnHoldPage]     = useState(1);
  const PRODUCTS_PER_PAGE = 12;

  const isAdmin = user.role === "ADMIN" || user.role === "CO_ADMIN";
  const canManageVisibility = canManageProductVisibility(user);
  const canViewDashboard = isAdmin || user.role === "MEMBER";
  const canViewOnHold = canManageVisibility || user.role === "MEMBER";

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
      users,
      advertisements,
    ] = await Promise.all([
      user.role !== "USER" ? api.getStockSummary(token) : Promise.resolve(null),
      api.getFinishedGoods(token),
      user.role === "ADMIN" ? api.getFormulas(token) : Promise.resolve({ data: [] }),
      user.role !== "USER" ? api.getProductionHistory(token, { limit: 20, include_total: 0 }) : Promise.resolve({ data: [] }),
      user.role !== "MEMBER" ? api.getConsumptionLogs(token, { limit: 20, include_total: 0 }) : Promise.resolve({ data: [] }),
      user.role !== "MEMBER" ? api.getOrders(token, { limit: 100 }) : Promise.resolve({ data: [] }),
      canManageVisibility || user.role === "MEMBER" || user.role === "USER"
        ? api.getAvailability(token, { includeHidden: canManageVisibility || user.role === "MEMBER" })
        : Promise.resolve({ data: [] }),
      canManageVisibility ? api.getPermissions(token) : Promise.resolve({ data: [] }),
      canManageVisibility ? api.getUsers(token) : Promise.resolve({ data: [] }),
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
      users: users.data || [],
      advertisements: advertisements.data || [],
    });
  }, [token, user.role, canManageVisibility]);

  useEffect(() => { load().catch(console.error); }, [load]);
  useDataRefresh(load, "dashboard");

  const getProductCountryTargets = (countryScope = "both") => {
    const scopeCodes = countryScope === "both" ? ["NP", "IN"] : [String(countryScope || "NP").toUpperCase()];
    const scopeLabel =
      countryScope === "both"
        ? "Nepal and India"
        : getCountryLabel(scopeCodes[0]);
    const customerRoles = new Set(["USER", "MEMBER", "ELDER"]);
    const targetUsers = (state.users || []).filter((item) => {
      const role = String(item.role || "").toUpperCase();
      const countryCode = String(item.country_code || "NP").toUpperCase();
      return customerRoles.has(role) && scopeCodes.includes(countryCode);
    });

    return { scopeLabel, targetUsers };
  };

  const showProductForCountries = async (product, countryScope = "both") => {
    if (!canManageVisibility || !product) return;

    const { scopeLabel, targetUsers } = getProductCountryTargets(countryScope);
    const label = product.article_code || product.name || "Product";

    if (!targetUsers.length) {
      showToast({
        tone: "error",
        title: "No users found",
        message: `No ${scopeLabel} customers were found for this product.`,
      });
      return;
    }

    try {
      await Promise.all(
        targetUsers.map((targetUser) =>
          api.grantPermission(
            { user_id: targetUser.id, finished_good_ids: [product.id] },
            token
          )
        )
      );
      showToast({
        tone: "success",
        title: "Product shown",
        message: `${label} is now visible to ${scopeLabel} customers.`,
      });
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Show product failed",
        message: error.message,
      });
    }
  };

  const hideProductForCountries = async (product, countryScope = "both") => {
    if (!canManageVisibility || !product) return;

    const { scopeLabel, targetUsers } = getProductCountryTargets(countryScope);
    const label = product.article_code || product.name || "Product";

    if (!targetUsers.length) {
      showToast({
        tone: "error",
        title: "No users found",
        message: `No ${scopeLabel} customers were found for this product.`,
      });
      return;
    }

    try {
      await Promise.all(
        targetUsers.map((targetUser) =>
          api.revokePermission(
            { user_id: targetUser.id, finished_good_id: product.id },
            token
          )
        )
      );
      showToast({
        tone: "success",
        title: "Product hidden",
        message: `${label} is now hidden from ${scopeLabel} customers.`,
      });
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Hide product failed",
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
      .map((variants) => [...variants].sort(sortByDisplayOrder))
      .filter((v) => v.length > 0)
      .sort((a, b) => {
        const orderDiff = getGroupDisplayOrder(a) - getGroupDisplayOrder(b);
        if (orderDiff !== 0) return orderDiff;

        return String(a[0]?.article_code || a[0]?.name || "").localeCompare(
          String(b[0]?.article_code || b[0]?.name || ""),
          undefined,
          { numeric: true, sensitivity: "base" }
        );
      });
  }, [groupedProducts, search, stockFilter, seriesFilter]);

  const onHoldBaseItems = useMemo(() => {
    if (!canManageVisibility) {
      return state.availability.filter((product) => Number(product.is_visible) !== 1);
    }

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
  }, [canManageVisibility, state.permissions, state.finishedGoods, state.availability]);

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

  const usersByCountry = useMemo(() => {
    const grouped = new Map();
    (state.users || [])
      .filter((item) => ["USER", "MEMBER", "ELDER"].includes(String(item.role || "").toUpperCase()))
      .forEach((item) => {
        const countryCode = String(item.country_code || "NP").toUpperCase();
        if (!grouped.has(countryCode)) grouped.set(countryCode, []);
        grouped.get(countryCode).push(item);
      });
    return grouped;
  }, [state.users]);

  const countryOptions = useMemo(() => {
    const codes = new Set(["NP", "IN"]);
    usersByCountry.forEach((_, countryCode) => codes.add(countryCode));
    return Array.from(codes).sort((a, b) => {
      const priority = { NP: 0, IN: 1 };
      return (priority[a] ?? 10) - (priority[b] ?? 10) || getCountryLabel(a).localeCompare(getCountryLabel(b));
    });
  }, [usersByCountry]);

  const countryHoldGroups = useMemo(() => {
    if (!canManageVisibility) return [];

    const deniedKeys = new Set(
      state.permissions
        .filter((permission) => Number(permission.can_view) === 0)
        .map((permission) => `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`)
    );
    const grantedKeys = new Set(
      state.permissions
        .filter((permission) => Number(permission.can_view) === 1)
        .map((permission) => `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`)
    );
    const q = onHoldSearch.trim().toLowerCase();
    const matchesProduct = (product) => {
      const matchesSearch = !q || (
        (product.name || "").toLowerCase().includes(q) ||
        (product.article_code || "").toLowerCase().includes(q) ||
        (product.sole_code || "").toLowerCase().includes(q) ||
        (product.color || "").toLowerCase().includes(q) ||
        (product.size || "").toLowerCase().includes(q)
      );
      const matchesSeries =
        !onHoldSeriesFilter || getSeriesName(product.sole_code) === onHoldSeriesFilter;
      return matchesSearch && matchesSeries;
    };

    return countryOptions.map((countryCode) => {
      const countryUsers = usersByCountry.get(countryCode) || [];
      if (!countryUsers.length) {
        return {
          countryCode,
          users: countryUsers,
          products: [],
        };
      }
      const holdItems = state.finishedGoods.filter((product) => {
        if (!matchesProduct(product)) return false;
        const hasVisibleUser = countryUsers.some((countryUser) => {
          const key = `${Number(countryUser.id)}:${Number(product.id)}`;
          return grantedKeys.has(key) && !deniedKeys.has(key);
        });
        return !hasVisibleUser;
      });
      const groups = {};
      holdItems.forEach((item) => {
        const key =
          item.article_code ||
          item.name?.split("_")?.slice(0, -1)?.join("_") ||
          item.name ||
          `product-${item.id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
      return {
        countryCode,
        users: countryUsers,
        products: Object.values(groups),
      };
    });
  }, [
    canManageVisibility,
    countryOptions,
    onHoldSearch,
    onHoldSeriesFilter,
    state.finishedGoods,
    state.permissions,
    usersByCountry,
  ]);

  const countryHoldTotal = countryHoldGroups.reduce(
    (sum, group) => sum + group.products.length,
    0
  );
  const selectedCountryHoldGroup =
    countryHoldGroups.find((group) => group.countryCode === selectedHoldCountry) ||
    countryHoldGroups[0] ||
    null;
  const selectedCountryHoldProducts = selectedCountryHoldGroup?.products || [];
  const selectedCountryHoldTotal = Math.ceil(selectedCountryHoldProducts.length / PRODUCTS_PER_PAGE);
  const paginatedSelectedCountryHold = selectedCountryHoldProducts.slice(
    (onHoldPage - 1) * PRODUCTS_PER_PAGE,
    onHoldPage * PRODUCTS_PER_PAGE
  );

  useEffect(() => { setCurrentPage(1); }, [search, stockFilter, seriesFilter]);
  useEffect(() => { setOnHoldPage(1); }, [onHoldSearch, onHoldSeriesFilter]);
  useEffect(() => { setOnHoldPage(1); }, [selectedHoldCountry]);
  useEffect(() => {
    if (!countryHoldGroups.length) return;
    if (!countryHoldGroups.some((group) => group.countryCode === selectedHoldCountry)) {
      setSelectedHoldCountry(countryHoldGroups[0].countryCode);
    }
  }, [countryHoldGroups, selectedHoldCountry]);

  const totalPages        = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const onHoldTotal       = Math.ceil(onHoldProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE);
  const paginatedOnHold   = onHoldProducts.slice((onHoldPage - 1) * PRODUCTS_PER_PAGE, onHoldPage * PRODUCTS_PER_PAGE);
  const advertisementsAboveStatus = state.advertisements.filter(
    (advertisement) => advertisementPlacement(advertisement) === "ABOVE_STATUS"
  );
  const publishedNotices = state.advertisements.filter(
    (advertisement) => advertisementPlacement(advertisement) === "NOTICE"
  );
  const advertisementsBelowStatus = state.advertisements.filter(
    (advertisement) => advertisementPlacement(advertisement) === "BELOW_STATUS"
  );
  const facebookFeedAdvertisements = state.advertisements.filter(
    (advertisement) => advertisementPlacement(advertisement) === "FACEBOOK_FEED"
  );
  const instagramFeedAdvertisements = state.advertisements.filter(
    (advertisement) => advertisementPlacement(advertisement) === "INSTAGRAM_FEED"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${user.role.replace("_", " ")} workspace`}
        title="Daily operations overview"
        description="Monitor raw-material health, production activity, and finished-goods readiness in one place."
        icon="dashboard"
      />

      {user.role === "USER" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Catalog Status" value="Active" tone="default" icon="finishedGoods" />
          <StatCard label="Pending Orders" value={formatNumber(pendingOrders)} tone="alert" icon="orders" />
          <StatCard label="Confirmed Orders" value={formatNumber(confirmedOrders)} tone="calm" icon="check" />
          <StatCard label="Delivered Orders" value={formatNumber(deliveredOrders)} tone="default" icon="check" />
        </div>
      )}

      {canManageVisibility && <AdminDashboardControls />}

      {user.role === "USER" && advertisementsAboveStatus.length > 0 && (
        <AdvertisementBanner advertisements={advertisementsAboveStatus} />
      )}

      {user.role === "USER" && (
        <UserDashboardShowcase
          products={state.availability}
          notices={publishedNotices}
          user={user}
        />
      )}

      {user.role !== "USER" && publishedNotices.length > 0 && (
        <PublishedNotices notices={publishedNotices} />
      )}

      {/* STAT CARDS */}
      {user.role !== "USER" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <>
            <StatCard label="Raw Material Stock"            value={formatNumber(rawTotal)}      tone="calm"    icon="materials" />
            <StatCard label="Finished Goods Stock In Pairs" value={formatNumber(finishedTotal)} tone="calm"    icon="finishedGoods" />
            <StatCard label="Production Runs"               value={formatNumber(state.production.length)} tone="default" icon="production" />
            <StatCard label="Active Orders"
              value={formatNumber(state.orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status)).length)}
              tone="alert" icon="orders"
            />
            {canViewOnHold && (
              <StatCard
                label="On Hold Products"
                value={formatNumber(canManageVisibility ? countryHoldTotal : onHoldProducts.length)}
                tone="alert"
                icon="hidden"
              />
            )}
          </>
        </div>
      )}

      {user.role === "USER" && advertisementsBelowStatus.length > 0 && (
        <AdvertisementBanner advertisements={advertisementsBelowStatus} />
      )}

      {user.role === "USER" && facebookFeedAdvertisements.length > 0 && (
        <AdvertisementFeed advertisements={facebookFeedAdvertisements} variant="facebook" />
      )}

      {user.role === "USER" && instagramFeedAdvertisements.length > 0 && (
        <AdvertisementFeed advertisements={instagramFeedAdvertisements} variant="instagram" />
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
                    canManageVisibility={canManageVisibility}
                    onShowForCountry={showProductForCountries}
                    onHideForCountry={hideProductForCountries}
                    user={user}
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
      {canViewOnHold && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <EyeOff size={18} className="text-amber-500" />
              On Hold&nbsp;
              <span className="text-slate-400 font-normal text-base">
                ({canManageVisibility ? countryHoldTotal : onHoldProducts.length})
              </span>
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
          {canManageVisibility ? (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {countryHoldGroups.map((group) => (
                  <button
                    key={group.countryCode}
                    type="button"
                    onClick={() => setSelectedHoldCountry(group.countryCode)}
                    className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${
                      selectedHoldCountry === group.countryCode
                        ? "border-amber-300 bg-amber-50 ring-4 ring-amber-100"
                        : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {getCountryLabel(group.countryCode)}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">
                      {formatNumber(group.products.length)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      on hold for {formatNumber(group.users.length)} customer{group.users.length === 1 ? "" : "s"}
                    </p>
                  </button>
                ))}
              </div>

              {selectedCountryHoldGroup ? (
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {getCountryLabel(selectedCountryHoldGroup.countryCode)} on hold
                      </h3>
                      <p className="text-sm text-slate-500">
                        Products hidden from every customer in {getCountryLabel(selectedCountryHoldGroup.countryCode)}.
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedCountryHoldGroup.products.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {selectedCountryHoldGroup.products.length ? `${formatNumber(selectedCountryHoldGroup.products.length)} needs review` : "All shown"}
                    </span>
                  </div>
                  {selectedCountryHoldGroup.products.length ? (
                    <>
                      <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {paginatedSelectedCountryHold.map((variants) => (
                          <OnHoldCard
                            key={`${selectedCountryHoldGroup.countryCode}-${variants.map((v) => v.id).join("-")}`}
                            variants={variants}
                            canManageVisibility={canManageVisibility}
                            onShowForCountry={showProductForCountries}
                          />
                        ))}
                      </div>
                      <PaginationBar
                        total={selectedCountryHoldTotal}
                        current={onHoldPage}
                        setPage={setOnHoldPage}
                      />
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
                      No products are on hold for {getCountryLabel(selectedCountryHoldGroup.countryCode)}.
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          ) : paginatedOnHold.length ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {paginatedOnHold.map((variants) => (
                  <OnHoldCard
                    key={variants.map((v) => v.id).join("-")}
                    variants={variants}
                    canManageVisibility={canManageVisibility}
                    onShowForCountry={showProductForCountries}
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
