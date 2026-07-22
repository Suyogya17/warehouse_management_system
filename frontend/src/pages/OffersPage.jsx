import { useCallback, useEffect, useMemo, useState } from "react";
import { Tag, Package, ShoppingCart, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, APP_BASE_URL } from "../services/api";
import { getCustomerVisibleStock, getRoundedCartons } from "../utils/displayStock";
import { formatNumber } from "../utils/format";

const isActiveOffer = (item) =>
  Number(item.offer_enabled) === 1 &&
  (!item.offer_ends_at || new Date(item.offer_ends_at).getTime() >= Date.now());

const getOfferGroupKey = (item) =>
  `${String(item.article_code || item.name || item.id).trim().toLowerCase()}::${String(item.sole_code || "").trim().toLowerCase()}`;

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const OFFER_PERCENTAGES_BY_EMAIL = {
  "pramod.kathmandu@nepcha.com": 40,
  "ishwor.birtamod@nepcha.com": 30,
  "kamal.butwal@nepcha.com": 20,
  "ramesh.pokhara@nepcha.com": 5,
  "deepak@nepcha.com": 5,
};

const getPercentageAllocations = (product, targets = []) => {
  const pairsPerCarton = Number(product?.inner_boxes_per_outer_box || 0);
  const totalCartons = getRoundedCartons(product?.quantity, pairsPerCarton);
  if (pairsPerCarton <= 0 || totalCartons <= 0) return new Map();

  const allocations = targets.filter((target) => Number(target.percentage) > 0).map((target, index) => {
    const percentage = Number(target.percentage);
    const exactCartons = totalCartons * percentage / 100;
    const cartons = Math.floor(exactCartons);
    return { user_id: Number(target.user_id), percentage, cartons, remainder: exactCartons - cartons, index };
  });
  const totalPercentage = allocations.reduce((sum, allocation) => sum + allocation.percentage, 0);
  const targetCartons = Math.min(totalCartons, Math.round(totalCartons * totalPercentage / 100));
  let cartonsLeft = targetCartons - allocations.reduce((sum, allocation) => sum + allocation.cartons, 0);
  [...allocations]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach((allocation) => {
      if (cartonsLeft <= 0) return;
      allocation.cartons += 1;
      cartonsLeft -= 1;
    });

  // With small stock, a valid percentage can round down to zero. When there
  // are enough cartons for every selected user, move cartons from the largest
  // allocations so no selected audience member is saved with zero quantity.
  if (targetCartons >= allocations.length) {
    allocations.filter((allocation) => allocation.cartons === 0).forEach((emptyAllocation) => {
      const donor = allocations
        .filter((allocation) => allocation.cartons > 1)
        .sort((left, right) => right.cartons - left.cartons || right.percentage - left.percentage || left.index - right.index)[0];
      if (donor) {
        donor.cartons -= 1;
        emptyAllocation.cartons = 1;
      }
    });
  }

  return new Map(allocations.map((allocation) => [allocation.user_id, {
    ...allocation,
    pairs: allocation.cartons * pairsPerCarton,
  }]));
};

function OfferProductCard({ variants, canManage, canOrder, onEdit, onRemove, onAddToCart, cartProductIds }) {
  const [selected, setSelected] = useState(variants.find(isActiveOffer) || variants[0]);

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
  return (
    <article className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:shadow-xl ${active ? "border-amber-300" : "border-slate-200"}`}>
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selected.image_url ? (
          <img loading="lazy" decoding="async" src={`${APP_BASE_URL}${selected.image_url}`} alt={selected.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><Package size={36} /></div>
        )}
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${active ? "bg-amber-500" : "bg-slate-500"}`}><Tag size={13} />{active ? "ON OFFER" : "NOT ON OFFER"}</span>
        <ProductImageGallery variants={variants} selectedVariant={selected} onSelect={setSelected} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{selected.article_code || selected.name}</h3>
          {selected.sole_code && <p className="text-xs text-slate-600">Sole: <span className="font-semibold">{selected.sole_code}</span></p>}
          {selected.size && <p className="text-xs text-slate-600">Size: <span className="font-semibold">{selected.size}</span></p>}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {variants.map((variant) => (
            <button key={variant.id} type="button" onClick={() => setSelected(variant)} className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition ${Number(selected.id) === Number(variant.id) ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
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
        {canManage && <div className="mt-auto flex gap-2"><Button type="button" onClick={() => onEdit(selected)}>{active ? "Edit offer" : "Add offer"}</Button>{active && <Button type="button" variant="secondary" onClick={() => onRemove(selected)}>Remove</Button>}</div>}
        {!canManage && canOrder && (() => {
          const inCart = cartProductIds.has(Number(selected.id));
          return <button type="button" disabled={availableQty <= 0} onClick={() => onAddToCart(selected)} className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${availableQty <= 0 ? "cursor-not-allowed bg-slate-200 text-slate-500" : inCart ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}>{availableQty <= 0 ? "Out of stock" : inCart ? <><Check size={16} />In cart</> : <><ShoppingCart size={16} />Add to cart</>}</button>;
        })()}
      </div>
    </article>
  );
}

export default function OffersPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canManage = user?.role === "ADMIN" || user?.role === "CO_ADMIN";
  const canOrder = user?.role === "USER";
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ offer_label: "Special offer", offer_ends_at: "", offer_all_users: true, offer_target_user_ids: [], offer_target_quantities: {}, offer_target_percentages: {} });
  const [saving, setSaving] = useState(false);
  const percentageTargets = useMemo(() => form.offer_target_user_ids.map((userId) => ({
    user_id: Number(userId),
    percentage: form.offer_target_percentages[userId],
  })), [form.offer_target_percentages, form.offer_target_user_ids]);
  const percentageAllocations = useMemo(() => getPercentageAllocations(editing, percentageTargets), [editing, percentageTargets]);
  const selectedPercentageTotal = percentageTargets.reduce((sum, target) => sum + Number(target.percentage || 0), 0);
  const hasZeroPercentageAllocation = [...percentageAllocations.values()].some((allocation) => allocation.pairs <= 0);
  const editingTotalPairs = Number(editing?.quantity || 0);
  const editingTotalCartons = getRoundedCartons(editingTotalPairs, editing?.inner_boxes_per_outer_box);

  const load = useCallback(async () => {
    const [result, usersResult] = await Promise.all([
      canManage ? api.getFinishedGoods(token) : api.getAvailability(token, user?.role === "ELDER" ? { offer_view: 1 } : {}),
      canManage ? api.getUsers(token) : Promise.resolve({ data: [] }),
    ]);
    setProducts(result.data || []);
    setCustomers((usersResult.data || []).filter((account) => account.role === "USER"));
  }, [canManage, token, user?.role]);

  useEffect(() => { load().catch(console.error); }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("userCart");
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) setCart(parsed);
    } catch (error) {
      console.error("Failed to load cart:", error);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (cartLoaded) localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  const cartProductIds = useMemo(() => new Set(cart.map((item) => Number(item.finished_good_id))), [cart]);
  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );
  const addToCart = (product) => {
    const productId = Number(product.id);
    if (cartProductIds.has(productId)) {
      navigate("/order-customer");
      return;
    }
    const availableQty = getCustomerVisibleStock(product);
    if (availableQty <= 0) return;
    setCart((current) => [...current, {
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
        quantity: Number(product.physical_stock ?? product.quantity ?? 0),
        display_stock: availableQty,
        available_qty: availableQty,
      },
    }]);
  };

  const offers = useMemo(() => products.filter(isActiveOffer), [products]);
  const seriesOptions = useMemo(() => {
    const source = canManage ? products : offers;
    return [...new Set(source.map((product) => getSeriesName(product.sole_code)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [canManage, offers, products]);

  const shownProducts = useMemo(() => {
    const source = canManage ? products : offers;
    const q = search.trim().toLowerCase();
    return source.filter((item) => {
      const matchesSeries = !seriesFilter || getSeriesName(item.sole_code) === seriesFilter;
      const matchesSearch = !q || [item.name, item.article_code, item.sole_code, item.color]
        .some((value) => String(value || "").toLowerCase().includes(q));
      return matchesSeries && matchesSearch;
    });
  }, [canManage, offers, products, search, seriesFilter]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    shownProducts.forEach((product) => {
      const key = getOfferGroupKey(product);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    });
    return Array.from(groups.values());
  }, [shownProducts]);

  const beginEdit = (product) => {
    const savedTargets = product.offer_targets || [];
    setEditing(product);
    setForm({
      offer_label: product.offer_label || "Special offer",
      offer_ends_at: product.offer_ends_at ? String(product.offer_ends_at).slice(0, 16) : "",
      offer_all_users: Number(product.offer_all_users ?? 1) === 1,
      offer_target_user_ids: savedTargets.length ? savedTargets.map((target) => Number(target.user_id)) : product.offer_target_user_ids || [],
      offer_target_quantities: Object.fromEntries(savedTargets.map((target) => [Number(target.user_id), Number(target.display_quantity || 450)])),
      offer_target_percentages: Object.fromEntries(savedTargets.map((target) => {
        const customer = customers.find((account) => Number(account.id) === Number(target.user_id));
        const defaultPercentage = OFFER_PERCENTAGES_BY_EMAIL[String(customer?.email || "").trim().toLowerCase()];
        return [Number(target.user_id), target.display_percentage ?? defaultPercentage ?? ""];
      })),
    });
  };

  const saveOffer = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const offerTargets = form.offer_target_user_ids.map((userId) => {
        const allocation = percentageAllocations.get(Number(userId));
        const percentage = form.offer_target_percentages[userId];
        return {
          user_id: Number(userId),
          display_quantity: Number(allocation ? allocation.pairs : form.offer_target_quantities[userId] || 0),
          display_percentage: percentage === "" || percentage === undefined ? null : Number(percentage),
        };
      });
      await api.updateFinishedGoodOffer(editing.id, { offer_enabled: true, ...form, offer_targets: offerTargets }, token);
      showToast({ tone: "success", title: "Offer saved", message: `${editing.article_code || editing.name} is now on offer.` });
      setEditing(null);
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Could not save offer", message: error.message });
    } finally { setSaving(false); }
  };

  const removeOffer = async (product) => {
    try {
      await api.updateFinishedGoodOffer(product.id, { offer_enabled: false }, token);
      showToast({ tone: "success", title: "Offer removed", message: `${product.article_code || product.name} is no longer shown as an offer.` });
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Could not remove offer", message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={canManage ? "Product Offers" : "Offers"} description={canManage ? "Choose products, set the audience, and publish offers for customers." : "Browse products currently available as special offers."} />
      {canOrder && <div className="flex justify-start"><button type="button" onClick={() => navigate("/order-customer")} className="flex w-fit flex-row gap-3 rounded-xl bg-indigo-500 px-3 py-2 text-white transition hover:bg-indigo-600"><ShoppingCart size={18} /><span>Cart</span>{totalCartItems > 0 && <span className="relative -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{totalCartItems}</span>}</button></div>}
      <SectionCard title={canManage ? "Manage offers" : "Current offers"} subtitle={`${offers.length} active offer${offers.length === 1 ? "" : "s"}`} icon="finishedGoods">
        <div className="mb-4 flex max-w-xs flex-col gap-1">
          <label htmlFor="offer-series" className="text-xs font-medium text-slate-500">Series</label>
          <select id="offer-series" value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
            <option value="">All Series</option>
            {seriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
          </select>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, article or color..." className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500" />
        {!productGroups.length ? <EmptyState title="No offers found" description={canManage ? "Search for a product and publish an offer." : "There are no active product offers right now."} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {productGroups.map((variants) => <OfferProductCard key={getOfferGroupKey(variants[0])} variants={variants} canManage={canManage} canOrder={canOrder} onEdit={beginEdit} onRemove={removeOffer} onAddToCart={addToCart} cartProductIds={cartProductIds} />)}
          </div>
        )}
      </SectionCard>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={() => setEditing(null)}>
          <form onSubmit={saveOffer} onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="text-lg font-bold">Offer for {editing.article_code || editing.name}</h2><p className="text-sm text-slate-500">Choose each user and the maximum quantity that user can see and order.</p></div>
              <div className="grid shrink-0 grid-cols-2 gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Total CTN</p><p className="text-lg font-bold text-indigo-800">{formatNumber(editingTotalCartons)}</p></div>
                <div className="border-l border-indigo-200 pl-2"><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Total pairs</p><p className="text-lg font-bold text-indigo-800">{formatNumber(editingTotalPairs)}</p></div>
              </div>
            </div>
            <label className="block text-sm font-semibold">Offer label<input maxLength="120" value={form.offer_label} onChange={(event) => setForm({ ...form, offer_label: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <label className="block text-sm font-semibold">End date (optional)<input type="datetime-local" value={form.offer_ends_at} onChange={(event) => setForm({ ...form, offer_ends_at: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Who can see this offer?</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: true, offer_target_user_ids: [], offer_target_quantities: {}, offer_target_percentages: {} })} />All users (normal display limit)</label>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={!form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: false })} />Selected users with personalized quantities</label>
              {!form.offer_all_users && (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
                  {customers.length ? customers.map((customer) => {
                    const userId = Number(customer.id);
                    const checked = form.offer_target_user_ids.includes(userId);
                    const defaultPercentage = OFFER_PERCENTAGES_BY_EMAIL[String(customer.email || "").trim().toLowerCase()];
                    const configuredPercentage = form.offer_target_percentages[userId] ?? defaultPercentage ?? "";
                    const percentageAllocation = percentageAllocations.get(userId);
                    const assignedPairs = percentageAllocation?.pairs ?? form.offer_target_quantities[userId] ?? "";
                    return (
                      <div key={customer.id} className="grid grid-cols-[auto_1fr_140px] items-center gap-2 rounded-lg bg-white px-2 py-2">
                        <input type="checkbox" checked={checked} onChange={() => setForm((current) => ({
                          ...current,
                          offer_target_user_ids: checked ? current.offer_target_user_ids.filter((id) => Number(id) !== userId) : [...current.offer_target_user_ids, userId],
                          offer_target_quantities: checked ? current.offer_target_quantities : { ...current.offer_target_quantities, [userId]: percentageAllocation?.pairs || current.offer_target_quantities[userId] || 450 },
                          offer_target_percentages: checked ? current.offer_target_percentages : { ...current.offer_target_percentages, [userId]: configuredPercentage },
                        }))} />
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{customer.name || customer.email}</p><p className="truncate text-xs text-slate-400">{customer.email}</p>{percentageAllocation && <p className="mt-0.5 text-xs font-semibold text-indigo-600">{formatNumber(percentageAllocation.cartons)} CTN · {formatNumber(percentageAllocation.pairs)} pairs</p>}</div>
                        <div>
                          {defaultPercentage !== undefined || form.offer_target_percentages[userId] !== undefined ? (
                            <label className="text-[11px] font-semibold text-slate-500">Percentage<input type="number" min="0.01" max="100" step="0.01" required={checked} disabled={!checked} value={checked ? configuredPercentage : ""} onChange={(event) => setForm((current) => ({ ...current, offer_target_percentages: { ...current.offer_target_percentages, [userId]: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100" /></label>
                          ) : (
                            <input type="number" min="1" step="1" required={checked} disabled={!checked} value={checked ? assignedPairs : ""} onChange={(event) => setForm((current) => ({ ...current, offer_target_quantities: { ...current.offer_target_quantities, [userId]: event.target.value } }))} placeholder="Pairs" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100" />
                          )}
                        </div>
                      </div>
                    );
                  }) : <p className="text-sm text-slate-500">No user accounts found.</p>}
                  {selectedPercentageTotal > 0 && <p className={`px-2 text-xs font-semibold ${selectedPercentageTotal > 100 ? "text-red-600" : "text-slate-500"}`}>Selected percentage total: {formatNumber(selectedPercentageTotal)}%{selectedPercentageTotal > 100 ? " (must not exceed 100%)" : ""}</p>}
                  {hasZeroPercentageAllocation && <p className="px-2 text-xs font-semibold text-red-600">There are not enough cartons to give every selected user at least 1 CTN. Select fewer users or increase the stock.</p>}
                </div>
              )}
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving || selectedPercentageTotal > 100 || hasZeroPercentageAllocation}>{saving ? "Saving..." : "Publish offer"}</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}
