import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  Package as PackageIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import EmptyState from "../../components/EmptyState";
import PageHeader from "../../components/PageHeader";
import SectionCard from "../../components/SectionCard";

import { useAuth } from "../../context/AuthContext";
import { useDataRefresh } from "../../hooks/useDataRefresh";

import { api, APP_BASE_URL } from "../../services/api";
import { getCustomerVisibleStock } from "../../utils/displayStock";
import { formatNumber, formatUserPrice } from "../../utils/format";
import { getCommissionLabel, isCommissionProduct, matchesCommissionFilter } from "../../utils/commission";
import {
  sortProductGroupsByDisplayOrder,
  sortProductsByDisplayOrder,
} from "../../utils/productOrdering";

const getAvailableQty = getCustomerVisibleStock;

const getArticleKey = (item) =>
  item.article_code || item.name?.split("_")?.[0] || `product-${item.id}`;

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const getNextSort = (current) => {
  if (current === "display") return "newest";
  if (current === "newest") return "oldest";
  return "display";
};

const getSortLabel = (sort) => {
  if (sort === "display") return "Display order";
  if (sort !== "oldest") return "Newest";
  return "Oldest";
};

function ProductCard({ variants = [], onAddToCart, cartProductIds, user }) {
  const [selectedVariant, setSelectedVariant] = useState(
    variants?.find((v) => getAvailableQty(v) > 0) || variants?.[0] || null
  );
  const [lightbox, setLightbox] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  // ✅ Fix 1 — prevent body scroll when lightbox is open (mobile Chrome)
  useEffect(() => {
    if (lightbox) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightbox]);

  useEffect(() => {
    if (!variants?.length) {
      setSelectedVariant(null);
      return;
    }
    setSelectedVariant((current) => {
      const refreshedCurrent = variants.find(
        (variant) => Number(variant.id) === Number(current?.id)
      );
      if (refreshedCurrent) return refreshedCurrent;
      return variants.find((variant) => getAvailableQty(variant) > 0) || variants[0];
    });
  }, [variants]);

  const galleryVariants = useMemo(
    () => variants.filter((variant) => variant.image_url),
    [variants]
  );

  const selectedGalleryIndex = useMemo(
    () =>
      Math.max(
        0,
        galleryVariants.findIndex(
          (variant) => Number(variant.id) === Number(selectedVariant?.id)
        )
      ),
    [galleryVariants, selectedVariant]
  );

  useEffect(() => {
    if (!lightbox || galleryVariants.length <= 1) return;

    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        const prevIndex =
          (selectedGalleryIndex - 1 + galleryVariants.length) % galleryVariants.length;
        setSelectedVariant(galleryVariants[prevIndex]);
      }

      if (event.key === "ArrowRight") {
        const nextIndex = (selectedGalleryIndex + 1) % galleryVariants.length;
        setSelectedVariant(galleryVariants[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galleryVariants, lightbox, selectedGalleryIndex]);

  if (!selectedVariant) return null;

  const isInCart = cartProductIds.has(Number(selectedVariant.id));
  const availableQty = getAvailableQty(selectedVariant);
  const isLowStock = availableQty > 0 && availableQty < 10;
  const isOutOfStock = availableQty <= 0;
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(availableQty / Number(selectedVariant.inner_boxes_per_outer_box))
    : 0;
  const selectedImageUrl = selectedVariant.image_url
    ? `${APP_BASE_URL}${selectedVariant.image_url}`
    : "";
  const hasMultipleImages = galleryVariants.length > 1;
  const goToGalleryImage = (direction) => {
    if (!galleryVariants.length) return;
    const nextIndex =
      (selectedGalleryIndex + direction + galleryVariants.length) % galleryVariants.length;
    setSelectedVariant(galleryVariants[nextIndex]);
  };
  const handleDownloadImage = async (event) => {
    event.stopPropagation();
    if (!selectedImageUrl) return;

    const imageName = selectedVariant.article_code || selectedVariant.name || "product-image";
    const fileName = `${imageName.replace(/[^\w-]+/g, "-")}.jpg`;

    try {
      const response = await fetch(selectedImageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(selectedImageUrl, "_blank", "noopener,noreferrer");
    }
  };
  const handleLightboxTouchEnd = (event) => {
    if (touchStartX === null || !hasMultipleImages) return;

    const deltaX = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(deltaX) > 50) {
      goToGalleryImage(deltaX > 0 ? 1 : -1);
    }
    setTouchStartX(null);
  };

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">
      {/* IMAGE */}
      <div className="relative aspect-[5/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            onClick={() => setLightbox(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 cursor-zoom-in"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
          </div>
        )}

        {/* BADGES */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {isNew ? (
            <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold">
              NEW
            </span>
          ) : (
            <div />
          )}
          {isInCart && (
            <span className="bg-green-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1">
              <Check size={12} />
              In Cart
            </span>
          )}
        </div>

        {/* OUT OF STOCK OVERLAY */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold text-xs">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex flex-col">
        {/* TITLE + STOCK BADGE */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm font-bold text-slate-900 line-clamp-2 leading-snug min-h-[10px]">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>
          <span
            className={`text-[10px] px-2 py-1 rounded-full font-semibold gap-2
               ${
              isOutOfStock
                ? "bg-gray-100 text-gray-600"
                : isLowStock
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
            }`}
          >
            {isOutOfStock ? "Out" : isLowStock ? "Low" : "In Stock"}
          </span>
        </div>

        {/* SIZE */}
        {selectedVariant.size && (
          <div className="text-xs text-slate-600">
            Size: <span className="font-semibold">{selectedVariant.size}</span>
          </div>
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

        {/* COLOR VARIANTS */}
        {variants.length > 0 && (
          <div className="flex flex-row py-1">
            <div className="flex scrollbar-hidden  overflow-x-auto px-1 ">
              {variants.filter((variant) => getAvailableQty(variant) > 0).map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`px-2 rounded-lg text-xs font-medium transition-all
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
        )}

        {/* STOCK INFO */}
        <div className="bg-slate-50 rounded-xl p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Price</span>
            <span className="text-sm font-bold text-emerald-700">
              {formatUserPrice(selectedVariant.price, user)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Available Stock</span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(availableQty)} {selectedVariant.unit || "pcs"}
            </span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
              <span className="text-xs text-slate-500">Cartons</span>
              <span className="text-sm font-bold text-indigo-600">
                {formatNumber(cartons)}
              </span>
            </div>
          )}
        </div>

        {/* ADD TO CART BUTTON */}
        <div className="flex justify-center mt-auto pt-1">
          <button
            onClick={() => onAddToCart(selectedVariant)}
            disabled={isOutOfStock}
            className={`my-2 px-3 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
              isInCart
                ? "bg-green-500 text-white hover:bg-green-600"
                : isOutOfStock
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95"
            }`}
          >
            {isInCart ? (
              <>
                <Check size={16} />
                In Cart
              </>
            ) : (
              <>
                <Plus size={16} />
                Add to Cart
              </>
            )}
          </button>
        </div>
      </div>

      {/* ✅ LIGHTBOX — outside overflow:hidden, with mobile Chrome fixes */}
      {lightbox && selectedVariant.image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          style={{ touchAction: "none" }}   // ✅ Fix 2 — prevent swipe-back on Android
          onClick={() => setLightbox(false)}
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImageUrl}
              alt={selectedVariant.name}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />

            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={() => goToGalleryImage(-1)}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/90 text-slate-900 shadow-lg flex items-center justify-center hover:bg-white transition"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={() => goToGalleryImage(1)}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/90 text-slate-900 shadow-lg flex items-center justify-center hover:bg-white transition"
                  aria-label="Next image"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* Product name bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-2xl px-4 py-3">
              <p className="text-white font-semibold text-sm text-center">
                {selectedVariant.article_code || selectedVariant.name}
                {selectedVariant.color && (
                  <span className="ml-2 text-slate-300 font-normal">
                    · {selectedVariant.color}
                  </span>
                )}
              </p>
            </div>

            <div className="absolute -top-4 -right-4 flex gap-2">
              <button
                type="button"
                onClick={handleDownloadImage}
                className="bg-white text-slate-800 rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-slate-100 transition-all"
                aria-label="Download image"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                onClick={() => setLightbox(false)}
                className="bg-white text-slate-800 rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-slate-100 transition-all"
                aria-label="Close image viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {hasMultipleImages && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[92vw] overflow-x-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-2">
                {galleryVariants.map((variant, index) => (
                  <button
                    type="button"
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${
                      index === selectedGalleryIndex
                        ? "border-white"
                        : "border-white/20 opacity-70"
                    }`}
                    aria-label={`View ${variant.color || variant.name}`}
                  >
                    <img
                      src={`${APP_BASE_URL}${variant.image_url}`}
                      alt={variant.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [sort, setSort] = useState("display");
  const [filters, setFilters] = useState({
    search: "",
    size: "",
    stock: "all",
    series: "",
    commission: "all",
  });
  const [currentPage, setCurrentPage] = useState(1);

  const productsPerPage = 12;

  // ─── LOAD CART ────────────────────────────────────

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("userCart");
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        if (Array.isArray(parsedCart)) setCart(parsedCart);
      }
    } catch (err) {
      console.error("Failed to parse cart:", err);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  // ─── LOAD PRODUCTS ────────────────────────────────
  // FIX: Fetch from /orders/availability instead of /finished-goods.
  // This endpoint returns the same product list but enriched with:
  //   physical_stock  = raw warehouse quantity
  //   reserved_qty    = sum of all PENDING/CONFIRMED/PACKED orders
  //   display_stock   = min(product visible pairs, physical_stock - reserved_qty)
  const load = useCallback(async () => {
    const result = await api.getAvailability(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  // ─── GROUP BY ARTICLE CODE ────────────────────────

  const groupedProducts = useMemo(() => {
    const groups = new Map();

    items.forEach((item) => {
      const baseCode = getArticleKey(item);

      if (!groups.has(baseCode)) groups.set(baseCode, []);
      groups.get(baseCode).push(item);
    });

    return Array.from(groups.values())
      .map((variants) => [...variants].sort(sortProductsByDisplayOrder))
      .sort(sortProductGroupsByDisplayOrder);
  }, [items]);

  const sizes = [...new Set(items.map((i) => i.size).filter(Boolean))];
  const seriesList = useMemo(
    () =>
      [...new Set(items.map((item) => getSeriesName(item.sole_code)).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      ),
    [items]
  );

  // ─── FILTER & SORT ────────────────────────────────

  const filteredProducts = useMemo(() => {
    return groupedProducts
    
      .map((variants) =>
        variants.filter((item) => {
          const matchSearch =
            !filters.search ||
            item.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
            item.article_code?.toLowerCase().includes(filters.search.toLowerCase());
            // console.log("Group sample:", groupedProducts[0]?.map(v => ({ name: v.name, available_qty: v.available_qty })));

          const matchSize = !filters.size || item.size === filters.size;
          const matchSeries =
            !filters.series || getSeriesName(item.sole_code) === filters.series;
          const matchCommission = matchesCommissionFilter(item, filters.commission);

          // FIX: Filter by available_qty (reserved-aware), not raw quantity
          const availableQty = getAvailableQty(item);
          const matchStock =
            filters.stock === "all"
              ? true
              : filters.stock === "low"
              ? availableQty > 0 && availableQty < 10
              : availableQty >= 10;

          return matchSearch && matchSize && matchStock && matchSeries && matchCommission;
          
        })
      )
      .map((variants) => [...variants].sort(sortProductsByDisplayOrder))
      .filter((variants) => variants.some((v) => getAvailableQty(v) > 0))
      .sort((a, b) => {
        if (sort === "display") {
          return sortProductGroupsByDisplayOrder(a, b);
        }

        const dateA = new Date(a[0]?.created_at || 0);
        const dateB = new Date(b[0]?.created_at || 0);
        return sort !== "oldest" ? dateB - dateA : dateA - dateB;
      });
  }, [groupedProducts, filters, sort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sort]);

  // ─── PAGINATION ───────────────────────────────────

  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  // ─── CART HELPERS ─────────────────────────────────

  const cartProductIds = useMemo(
    () => new Set(cart.map((c) => Number(c.finished_good_id))),
    [cart]
  );

  // ─── ADD TO CART ──────────────────────────────────

  const handleAddToCart = (product) => {
    // FIX: Guard against out-of-stock using available_qty, not quantity
    const availableQty = getAvailableQty(product);
    if (!product || availableQty <= 0) return;

    const productId = Number(product.id);

    // Already in cart — take user to order page
    if (cartProductIds.has(productId)) {
      // navigate("/order-customer");
      return;
    }

    const cartItem = {
      finished_good_id: productId,
      qty_ordered: 1,
      orderBy: Number(product.inner_boxes_per_outer_box) > 0 ? "cartons" : "pairs",

      product: {
        id: productId,
        name: product.name || "",
        article_code: product.article_code || "",
        color: product.color || "",
        size: product.size || "",
        image_url: product.image_url || "",
        unit: product.unit || "pcs",
        inner_boxes_per_outer_box: Number(product.inner_boxes_per_outer_box || 0),

        // Raw physical stock (for reference / admin use)
        quantity: Number(product.physical_stock ?? product.quantity ?? 0),

        // Store the user-visible stock so the cart page enforces the same ceiling.
        display_stock: availableQty,
        available_qty: availableQty,
      },
    };

    setCart((prev) => [...prev, cartItem]);
    
  };

  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );

  // ─── PAGINATION BUTTONS ───────────────────────────

  const getPages = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
      }
    }
    return pages;
  };

  // ─── JSX ──────────────────────────────────────────

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Catalog"
        title="Browse Products"
        description="Select products and add to cart"
        icon="finishedGoods"
      />

      {/* TOP BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          onClick={() => navigate("/order-customer")} className="bg-indigo-500 flex flex-row w-fit gap-3 py-2 px-3 text-white rounded-xl"
          
        >
          <ShoppingCart size={18} />
          <span>Cart</span>
          {totalCartItems > 0 && (
            <span className="relative -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
              {totalCartItems}
            </span>
          )}
        </button>

       <div className="flex justify-between gap-2">
  <button
    onClick={() => setSort((prev) => getNextSort(prev))}
    className={`flex px-4 py-2.5 border rounded-xl font-medium transition-all
    ${
      sort !== "oldest"
        ? "bg-red-600 text-white border-red-300"
        : "bg-red-500 text-white hover:bg-slate-50 border-slate-300"
    }`}
  >
    {getSortLabel(sort)}
  </button>
</div>
      </div>

      {/* FILTERS */}
    
        <SectionCard title="Filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            <select
              value={filters.size}
              onChange={(e) => setFilters((f) => ({ ...f, size: e.target.value }))}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Sizes</option>
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <select
              value={filters.series}
              onChange={(e) => setFilters((f) => ({ ...f, series: e.target.value }))}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Series</option>
              {seriesList.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>

            <select
              value={filters.stock}
              onChange={(e) => setFilters((f) => ({ ...f, stock: e.target.value }))}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Stock</option>
              <option value="available">In Stock</option>
              <option value="low">Low Stock</option>
            </select>

            <select
              value={filters.commission}
              onChange={(e) => setFilters((f) => ({ ...f, commission: e.target.value }))}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All commission</option>
              <option value="commission">Percentage only</option>
              <option value="non_commission">Non commission only</option>
            </select>

            <button
              onClick={() =>
                setFilters({ search: "", size: "", stock: "all", series: "", commission: "all" })
              }
              className="px-4 py-2 mx-10 bg-black text-white rounded-xl text-sm font-medium hover:bg-slate-200 transition-all"
            >
              Clear
            </button>
          </div>
        </SectionCard>

      {/* COUNT */}
      <div className="text-sm text-slate-600">
        <span className="font-semibold">{filteredProducts.length}</span> products found
      </div>

      {/* PRODUCTS GRID */}
      {paginatedProducts.length ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {paginatedProducts.map((variants) => (
              <ProductCard
                key={variants.map((variant) => variant.id).join("-")}
                variants={variants}
                onAddToCart={handleAddToCart}
                cartProductIds={cartProductIds}
                user={user}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 flex-wrap pt-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
              >
                Previous
              </button>

              {getPages().map((page, index) =>
                page === "..." ? (
                  <span key={index} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={index}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-xl border text-sm font-semibold transition-all
                    ${
                      currentPage === page
                        ? "bg-indigo-500 text-white border-indigo-500"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
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
