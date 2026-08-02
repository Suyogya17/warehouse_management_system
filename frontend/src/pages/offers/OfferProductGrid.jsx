import { useEffect, useState } from "react";
import { Check, Package, ShoppingCart, Tag } from "lucide-react";
import Button from "../../components/Button";
import EmptyState from "../../components/EmptyState";
import ProductImageGallery from "../../components/ProductImageGallery";
import { APP_BASE_URL } from "../../services/api";
import { getCustomerVisibleStock, getRoundedCartons } from "../../utils/displayStock";
import {
  formatNumber,
  formatPrice,
  formatUserPrice,
  getProductPriceForUser,
} from "../../utils/format";
import {
  OFFER_PRODUCTS_PER_PAGE,
  getOfferGroupKey,
  isActiveOffer,
} from "./offerUtils";

function OfferProductCard({ variants, canManage, canOrder, viewer, onEdit, onRemove, onAddToCart, onProductInterest, cartProductIds }) {
  const [selected, setSelected] = useState(variants.find(isActiveOffer) || variants[0]);
  const selectVariant = (variant) => {
    setSelected(variant);
    onProductInterest?.(variant);
  };

  useEffect(() => {
    setSelected((current) => variants.find((item) => Number(item.id) === Number(current?.id)) || variants.find(isActiveOffer) || variants[0]);
  }, [variants]);

  if (!selected) return null;
  const active = isActiveOffer(selected);
  const availableQty = canManage
    ? Number(selected.quantity || 0)
    : getCustomerVisibleStock(selected);
  const cartons = getRoundedCartons(availableQty, selected.inner_boxes_per_outer_box);
  const targetQuantities = (selected.offer_targets || [])
    .map((target) => Number(target.display_quantity || 0))
    .filter((quantity) => quantity > 0);
  const audienceSummary = Number(selected.offer_all_users) === 1
    ? "All users"
    : `${targetQuantities.length} selected user(s)${targetQuantities.length ? ` · ${targetQuantities.map(formatNumber).join(", ")} pairs` : ""}`;
  const customerBasePrice = getProductPriceForUser(selected, viewer);
  const backendOfferPrice = Number(selected.effective_offer_price);
  const customerOfferPrice =
    Number.isFinite(backendOfferPrice) && backendOfferPrice > 0
      ? backendOfferPrice
      : Number(customerBasePrice) > 0
        ? Number(customerBasePrice) + 50
        : null;
  return (
    <article className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:shadow-xl ${active ? "border-amber-300" : "border-slate-200"}`}>
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selected.image_url ? (
          <img loading="lazy" decoding="async" src={`${APP_BASE_URL}${selected.image_url}`} alt={selected.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><Package size={36} /></div>
        )}
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${active ? "bg-amber-500" : "bg-slate-500"}`}><Tag size={13} />{active ? "ON OFFER" : "NOT ON OFFER"}</span>
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold text-white ${availableQty > 0 ? "bg-emerald-600" : "bg-red-600"}`}>
          {availableQty > 0 ? "IN STOCK" : "OUT OF STOCK"}
        </span>
        <ProductImageGallery variants={variants} selectedVariant={selected} onSelect={selectVariant} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{selected.article_code || selected.name}</h3>
          {selected.sole_code && <p className="text-xs text-slate-600">Sole: <span className="font-semibold">{selected.sole_code}</span></p>}
          {selected.size && <p className="text-xs text-slate-600">Size: <span className="font-semibold">{selected.size}</span></p>}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {variants.map((variant) => (
            <button key={variant.id} type="button" onClick={() => selectVariant(variant)} className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition ${Number(selected.id) === Number(variant.id) ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {variant.color || `Variant ${variant.id}`}
            </button>
          ))}
        </div>
        {active ? (
          <div className="rounded-xl bg-amber-50 p-2">
            <p className="text-xs font-semibold uppercase text-amber-700">{selected.offer_label || "Special offer"}</p>
            {selected.offer_ends_at && <p className="mt-1 text-xs text-slate-500">Ends {new Date(selected.offer_ends_at).toLocaleString()}</p>}
            {canManage && <p className="mt-1 text-xs font-medium text-slate-600">Audience: {audienceSummary}</p>}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">Qty stock</p><p className="text-sm font-bold text-indigo-700">{formatNumber(availableQty)} {selected.unit || "pairs"}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">CTN stock</p><p className="text-sm font-bold text-amber-600">{formatNumber(cartons)} CTN</p></div>
        </div>
        {canManage && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 px-3 py-2"><div><p className="text-[10px] font-semibold uppercase text-slate-500">Original price</p><p className="text-base font-bold text-slate-800">{Number(selected.price || 0) > 0 ? formatPrice(selected.price, "NPR") : "-"}</p></div><div className="border-l border-slate-200 pl-3"><p className="text-[10px] font-semibold uppercase text-emerald-600">Offer price</p><p className="text-base font-bold text-emerald-800">{Number(selected.price || 0) > 0 ? formatPrice(Number(selected.price) + 50, "NPR") : "-"}</p></div></div>}
        {!canManage && customerOfferPrice !== null && <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2"><span className="text-xs font-semibold uppercase text-emerald-600">Offer price</span><span className="text-base font-bold text-emerald-800">{formatUserPrice(customerOfferPrice, viewer)}</span></div>}
        {canManage && <div className="mt-auto flex gap-2"><Button type="button" onClick={() => onEdit(selected)}>{active ? "Edit offer" : "Add offer"}</Button>{active && <Button type="button" variant="secondary" onClick={() => onRemove(selected)}>Remove</Button>}</div>}
        {!canManage && canOrder && (() => {
          const inCart = cartProductIds.has(Number(selected.id));
          return <button type="button" disabled={availableQty <= 0} onClick={() => onAddToCart(selected)} className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${availableQty <= 0 ? "cursor-not-allowed bg-slate-200 text-slate-500" : inCart ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}>{availableQty <= 0 ? "Out of stock" : inCart ? <><Check size={16} />In cart</> : <><ShoppingCart size={16} />Add to cart</>}</button>;
        })()}
      </div>
    </article>
  );
}

export default function OfferProductGrid({
  productGroups,
  paginatedProductGroups,
  canManage,
  canOrder,
  viewer,
  onEdit,
  onRemove,
  onAddToCart,
  onProductInterest,
  cartProductIds,
  currentPage,
  totalPages,
  onPageChange,
}) {
  if (!productGroups.length) {
    return (
      <EmptyState
        title="No offers found"
        description={
          canManage
            ? "Search for a product and publish an offer."
            : "There are no active product offers right now."
        }
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {paginatedProductGroups.map((variants) => (
          <OfferProductCard
            key={getOfferGroupKey(variants[0])}
            variants={variants}
            canManage={canManage}
            canOrder={canOrder}
            viewer={viewer}
            onEdit={onEdit}
            onRemove={onRemove}
            onAddToCart={onAddToCart}
            onProductInterest={onProductInterest}
            cartProductIds={cartProductIds}
          />
        ))}
      </div>
      {productGroups.length > OFFER_PRODUCTS_PER_PAGE ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
          aria-label="Offer product pages"
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            Previous
          </Button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={currentPage === page ? "page" : undefined}
                className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            )
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </>
  );
}
