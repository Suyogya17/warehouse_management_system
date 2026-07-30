import { useCallback, useEffect, useMemo, useState } from "react";
import { Package as PackageIcon } from "lucide-react";

import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { getCommissionLabel, isCommissionProduct } from "../utils/commission";
import { getRoundedCartons } from "../utils/displayStock";
import { formatNumber, formatProductPriceForUser } from "../utils/format";

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const getAvailableQuantity = (product = {}) =>
  Math.max(
    0,
    Number(
      product.available_qty ??
        product.physical_stock ??
        product.quantity ??
        0
    )
  );

const PRODUCTS_PER_PAGE = 12;

function OutOfStockCard({ variants = [], user }) {
  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);

  useEffect(() => {
    if (!variants.length) {
      setSelectedVariant(null);
      return;
    }

    setSelectedVariant((current) => {
      const refreshed = variants.find(
        (variant) => Number(variant.id) === Number(current?.id)
      );
      return refreshed || variants[0];
    });
  }, [variants]);

  if (!selectedVariant) return null;

  const availableQuantity = getAvailableQuantity(selectedVariant);
  const cartons = getRoundedCartons(
    availableQuantity,
    selectedVariant.inner_boxes_per_outer_box
  );
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) >
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-red-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selectedVariant.image_url ? (
          <img
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name || selectedVariant.article_code}
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            className="h-full w-full cursor-zoom-in object-cover opacity-70 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
          </div>
        )}

        {isNew && (
          <span className="absolute left-2 top-2 rounded-full bg-indigo-500 px-2 py-1 text-[10px] font-semibold text-white sm:text-xs">
            NEW
          </span>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55">
          <span className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white">
            Out of Stock
          </span>
        </div>

        <ProductImageGallery
          variants={variants}
          selectedVariant={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm font-bold leading-snug text-slate-900">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>
          <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700">
            Out
          </span>
        </div>

        {selectedVariant.sole_code && (
          <p className="text-xs text-slate-600">
            Sole: <span className="font-semibold">{selectedVariant.sole_code}</span>
          </p>
        )}

        {selectedVariant.size && (
          <p className="text-xs text-slate-600">
            Size: <span className="font-semibold">{selectedVariant.size}</span>
          </p>
        )}

        <span
          className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold ${
            isCommissionProduct(selectedVariant)
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {getCommissionLabel(selectedVariant)}
        </span>

        <div className="flex gap-1 overflow-x-auto">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedVariant(variant)}
              className={`whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                Number(selectedVariant.id) === Number(variant.id)
                  ? "bg-red-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {variant.color || "Standard"}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-1.5 rounded-xl bg-red-50 p-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-red-700">Price</span>
            <span className="text-sm font-bold text-red-700">
              {formatProductPriceForUser(selectedVariant, user)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-700">Available pairs</span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(availableQuantity)} {selectedVariant.unit || "pairs"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-red-200 pt-1.5">
            <span className="text-xs text-slate-600">Cartons</span>
            <span className="text-xs font-bold text-red-600">
              {formatNumber(cartons)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function OutOfStockPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getAvailability(token, { include_hidden: 1 });
      setProducts(result.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Load failed",
        message: error.message || "Could not load out-of-stock products.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    load();
  }, [load]);

  useDataRefresh(load, "finished-goods");

  const outOfStockProducts = useMemo(
    () =>
      products
        .filter((product) => getAvailableQuantity(product) <= 0)
        .sort(
          (left, right) =>
            String(left.article_code || left.name || "").localeCompare(
              String(right.article_code || right.name || ""),
              undefined,
              { numeric: true, sensitivity: "base" }
            ) ||
            String(left.color || "").localeCompare(
              String(right.color || ""),
              undefined,
              { numeric: true, sensitivity: "base" }
            )
        ),
    [products]
  );

  const seriesOptions = useMemo(
    () =>
      [
        ...new Set(
          outOfStockProducts
            .map((product) => getSeriesName(product.sole_code))
            .filter(Boolean)
        ),
      ].sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [outOfStockProducts]
  );

  const groupedProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const groups = new Map();

    outOfStockProducts.forEach((product) => {
      const matchesSeries =
        !seriesFilter ||
        getSeriesName(product.sole_code) === seriesFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          product.name,
          product.article_code,
          product.sole_code,
          product.color,
          product.size,
        ].some((value) =>
          String(value || "").toLowerCase().includes(normalizedSearch)
        );

      if (!matchesSeries || !matchesSearch) return;

      const articleKey =
        product.article_code ||
        product.name?.split("_")?.slice(0, -1)?.join("_") ||
        product.name ||
        `product-${product.id}`;

      if (!groups.has(articleKey)) groups.set(articleKey, []);
      groups.get(articleKey).push(product);
    });

    return [...groups.values()].map((variants) =>
      variants.sort((left, right) =>
        String(left.color || "").localeCompare(
          String(right.color || ""),
          undefined,
          { numeric: true, sensitivity: "base" }
        )
      )
    );
  }, [outOfStockProducts, search, seriesFilter]);

  const articleCount = useMemo(
    () =>
      new Set(
        outOfStockProducts.map(
          (product) => product.article_code || product.name || product.id
        )
      ).size,
    [outOfStockProducts]
  );

  useEffect(() => {
    setPage(1);
  }, [search, seriesFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(groupedProducts.length / PRODUCTS_PER_PAGE)
  );
  const paginatedProducts = groupedProducts.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finished goods"
        title="Out of Stock Products"
        description="All unavailable finished goods are kept here and excluded from the Dashboard, Displayed Products, and On Hold sections."
        icon="finishedGoods"
        actions={
          <Button
            variant="secondary"
            icon="refresh"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Out-of-stock variants"
          value={formatNumber(outOfStockProducts.length)}
          tone="alert"
          icon="finishedGoods"
        />
        <StatCard
          label="Affected articles"
          value={formatNumber(articleCount)}
          tone="alert"
          icon="stock"
        />
        <StatCard
          label="Affected series"
          value={formatNumber(seriesOptions.length)}
          tone="default"
          icon="production"
        />
      </div>

      <SectionCard
        title="Out-of-stock products"
        subtitle="Products are grouped by article with each unavailable colour shown inside the same card."
        icon="finishedGoods"
      >
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search article, product, colour or size..."
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100 sm:min-w-72"
            />
            <select
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              className="h-11 min-w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            >
              <option value="">All Series</option>
              {seriesOptions.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>

            {(search || seriesFilter) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setSeriesFilter("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {paginatedProducts.length ? (
            <>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {paginatedProducts.map((variants) => (
                  <OutOfStockCard
                    key={variants.map((variant) => variant.id).join("-")}
                    variants={variants}
                    user={user}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="px-3 text-sm font-semibold text-slate-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-red-200 bg-red-50/50 py-14 text-center">
              <PackageIcon className="mx-auto text-red-300" size={34} />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                {loading ? "Loading products..." : "No out-of-stock products"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Please wait while stock information is loaded."
                  : search || seriesFilter
                  ? "No unavailable products match these filters."
                  : "Every finished good currently has available stock."}
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
