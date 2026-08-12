import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingCart,
  X,
} from "lucide-react";
import { APP_BASE_URL } from "../services/api";
import { getCustomerVisibleStock, getRoundedCartons } from "../utils/displayStock";
import { formatNumber } from "../utils/format";
import { getNeighborImageUrls, preloadImages } from "../utils/imagePreload";

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

export default function ArticleCatalogCard({
  variants = [],
  offer = false,
  onAddToCart,
  onProductInterest,
  cartProductIds = new Set(),
  showStockDetails = false,
}) {
  const [previewProduct, setPreviewProduct] = useState(null);

  const sortedVariants = useMemo(
    () =>
      [...variants].sort((left, right) =>
        String(left.color || "").localeCompare(String(right.color || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [variants]
  );
  const previewVariants = useMemo(
    () => sortedVariants.filter((variant) => variant.image_url),
    [sortedVariants]
  );
  const previewIndex = Math.max(
    0,
    previewVariants.findIndex(
      (variant) => Number(variant.id) === Number(previewProduct?.id)
    )
  );
  const canNavigatePreview = previewVariants.length > 1;

  const changePreview = useCallback(
    (direction) => {
      if (!previewVariants.length) return;
      const currentIndex = Math.max(
        0,
        previewVariants.findIndex(
          (variant) => Number(variant.id) === Number(previewProduct?.id)
        )
      );
      const nextIndex =
        (currentIndex + direction + previewVariants.length) %
        previewVariants.length;
      setPreviewProduct(previewVariants[nextIndex]);
      onProductInterest?.(previewVariants[nextIndex]);
    },
    [onProductInterest, previewProduct?.id, previewVariants]
  );

  useEffect(() => {
    if (!previewProduct) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewProduct(null);
      if (event.key === "ArrowLeft" && canNavigatePreview) changePreview(-1);
      if (event.key === "ArrowRight" && canNavigatePreview) changePreview(1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigatePreview, changePreview, previewProduct]);

  useEffect(() => {
    if (!previewProduct || !previewVariants.length) return;

    preloadImages(
      getNeighborImageUrls(
        previewVariants,
        previewIndex,
        (variant) => `${APP_BASE_URL}${variant.image_url}`
      )
    );
  }, [previewIndex, previewProduct, previewVariants]);

  const product = sortedVariants[0];
  if (!product) return null;

  const series = getSeriesName(product.sole_code);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm transition hover:shadow-lg">
      <header className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white px-3 py-3 text-slate-950 sm:px-5 sm:py-4">
        <h2 className="min-w-0 break-words text-base font-black tracking-wide sm:text-xl">
          {product.article_code || product.name}
          {series ? <span className="font-medium text-slate-700"> · {series} Series</span> : null}
        </h2>
        {offer ? (
          <span className="shrink-0 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-amber-950">
            OFFER
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-2">
        {sortedVariants.map((variant) => {
          const availablePairs = getCustomerVisibleStock(variant);
          const availableCartons = getRoundedCartons(
            availablePairs,
            variant.inner_boxes_per_outer_box
          );
          const isOutOfStock = availablePairs <= 0;
          const isInCart = cartProductIds.has(Number(variant.id));

          return (
            <section
              key={variant.id}
              className="relative flex min-w-0 flex-col border-b border-r border-slate-300 bg-white p-2.5 sm:p-4"
            >
              <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-xs font-black text-slate-900 min-[380px]:text-sm sm:text-base">
                  {variant.color || "Standard color"}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${
                    isOutOfStock
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {isOutOfStock ? "OUT" : "IN STOCK"}
                </span>
              </div>

              <button
                type="button"
                disabled={!variant.image_url}
                onClick={() => {
                  setPreviewProduct(variant);
                  onProductInterest?.(variant);
                }}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 disabled:cursor-default"
                aria-label={`View ${variant.article_code || variant.name} ${
                  variant.color || ""
                } image`}
              >
                {variant.image_url ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={`${APP_BASE_URL}${variant.image_url}`}
                    alt={`${variant.article_code || variant.name} ${variant.color || ""}`}
                    className={`h-full w-full object-contain p-2 transition duration-300 group-hover:scale-105 ${
                      isOutOfStock ? "grayscale" : ""
                    }`}
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-slate-400">
                    <Package size={34} />
                  </span>
                )}
              </button>

              <div className="mt-3 flex items-center justify-between gap-2">
                {showStockDetails ? (
                  <p className="min-w-0 break-words text-[10px] font-semibold leading-4 text-slate-500 min-[380px]:text-[11px] sm:text-xs">
                    {formatNumber(availableCartons)} CTN · {formatNumber(availablePairs)} pairs
                  </p>
                ) : (
                  <span />
                )}
                {onAddToCart ? (
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => {
                      onProductInterest?.(variant);
                      onAddToCart(variant);
                    }}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                      isOutOfStock
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : isInCart
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                    aria-label={isInCart ? "Product is in cart" : "Add product to cart"}
                  >
                    {isInCart ? <Check size={15} /> : <ShoppingCart size={15} />}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {previewProduct?.image_url ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewProduct(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={`${APP_BASE_URL}${previewProduct.image_url}`}
              alt={previewProduct.name}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="max-h-[88vh] max-w-full rounded-2xl bg-white object-contain"
            />
            {canNavigatePreview ? (
              <>
                <button
                  type="button"
                  onClick={() => changePreview(-1)}
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-xl transition hover:bg-black/75 sm:-left-14 sm:bg-white sm:text-slate-900 sm:hover:bg-slate-100"
                  aria-label="Previous gallery photo"
                >
                  <ChevronLeft size={25} />
                </button>
                <button
                  type="button"
                  onClick={() => changePreview(1)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-xl transition hover:bg-black/75 sm:-right-14 sm:bg-white sm:text-slate-900 sm:hover:bg-slate-100"
                  aria-label="Next gallery photo"
                >
                  <ChevronRight size={25} />
                </button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
                  {previewIndex + 1} / {previewVariants.length}
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewProduct(null)}
              className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl"
              aria-label="Close image"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
