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
import { getCustomerVisibleStock } from "../utils/displayStock";
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

function OfferProductCard({ variants, canManage, onEdit, onRemove, onAddToCart, cartProductIds }) {
  const [selected, setSelected] = useState(variants.find(isActiveOffer) || variants[0]);

  useEffect(() => {
    setSelected((current) => variants.find((item) => Number(item.id) === Number(current?.id)) || variants.find(isActiveOffer) || variants[0]);
  }, [variants]);

  if (!selected) return null;
  const active = isActiveOffer(selected);
  const availableQty = canManage
    ? Number(selected.quantity || 0)
    : getCustomerVisibleStock(selected);
  const cartons = Number(selected.inner_boxes_per_outer_box) > 0
    ? Math.floor(availableQty / Number(selected.inner_boxes_per_outer_box))
    : 0;
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
            {canManage && <p className="mt-1 text-xs font-medium text-slate-600">Audience: {Number(selected.offer_all_users) === 1 ? "All users" : `${selected.offer_target_user_ids?.length || 0} selected user(s)`}</p>}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">Qty stock</p><p className="text-sm font-bold text-indigo-700">{formatNumber(availableQty)} {selected.unit || "pairs"}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-slate-400">CTN stock</p><p className="text-sm font-bold text-amber-600">{formatNumber(cartons)} CTN</p></div>
        </div>
        {canManage && <div className="mt-auto flex gap-2"><Button type="button" onClick={() => onEdit(selected)}>{active ? "Edit offer" : "Add offer"}</Button>{active && <Button type="button" variant="secondary" onClick={() => onRemove(selected)}>Remove</Button>}</div>}
        {!canManage && (() => {
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
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ offer_label: "Special offer", offer_ends_at: "", offer_all_users: true, offer_target_user_ids: [] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [result, usersResult] = await Promise.all([
      canManage ? api.getFinishedGoods(token) : api.getAvailability(token),
      canManage ? api.getUsers(token) : Promise.resolve({ data: [] }),
    ]);
    setProducts(result.data || []);
    setCustomers((usersResult.data || []).filter((account) => account.role === "USER"));
  }, [canManage, token]);

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
    setEditing(product);
    setForm({
      offer_label: product.offer_label || "Special offer",
      offer_ends_at: product.offer_ends_at ? String(product.offer_ends_at).slice(0, 16) : "",
      offer_all_users: Number(product.offer_all_users ?? 1) === 1,
      offer_target_user_ids: product.offer_target_user_ids || [],
    });
  };

  const saveOffer = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateFinishedGoodOffer(editing.id, { offer_enabled: true, ...form }, token);
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
      showToast({ tone: "success", title: "Offer removed", message: `${product.article_code || product.name} returned to its regular price.` });
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Could not remove offer", message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={canManage ? "Product Offers" : "Offers"} description={canManage ? "Choose products, set the audience, and publish offers for customers." : "Browse products currently available as special offers."} />
      {!canManage && <div className="flex justify-start"><button type="button" onClick={() => navigate("/order-customer")} className="flex w-fit flex-row gap-3 rounded-xl bg-indigo-500 px-3 py-2 text-white transition hover:bg-indigo-600"><ShoppingCart size={18} /><span>Cart</span>{totalCartItems > 0 && <span className="relative -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{totalCartItems}</span>}</button></div>}
      <SectionCard title={canManage ? "Manage offers" : "Current offers"} subtitle={`${offers.length} active offer${offers.length === 1 ? "" : "s"}`} icon="finishedGoods">
        <div className="mb-4 flex max-w-xs flex-col gap-1">
          <label htmlFor="offer-series" className="text-xs font-medium text-slate-500">Series</label>
          <select id="offer-series" value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
            <option value="">All Series</option>
            {seriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
          </select>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, article or color..." className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500" />
        {!productGroups.length ? <EmptyState title="No offers found" description={canManage ? "Search for a product and add its offer price." : "There are no active product offers right now."} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {productGroups.map((variants) => <OfferProductCard key={getOfferGroupKey(variants[0])} variants={variants} canManage={canManage} onEdit={beginEdit} onRemove={removeOffer} onAddToCart={addToCart} cartProductIds={cartProductIds} />)}
          </div>
        )}
      </SectionCard>
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={() => setEditing(null)}><form onSubmit={saveOffer} onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div><h2 className="text-lg font-bold">Offer for {editing.article_code || editing.name}</h2><p className="text-sm text-slate-500">Mark this product as an offer and choose who can see it.</p></div><label className="block text-sm font-semibold">Offer label<input maxLength="120" value={form.offer_label} onChange={(event) => setForm({ ...form, offer_label: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-sm font-semibold">End date (optional)<input type="datetime-local" value={form.offer_ends_at} onChange={(event) => setForm({ ...form, offer_ends_at: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Who can see this offer?</legend><label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: true, offer_target_user_ids: [] })} />All users</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={!form.offer_all_users} onChange={() => setForm({ ...form, offer_all_users: false })} />Selected users only</label>{!form.offer_all_users && <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2">{customers.length ? customers.map((customer) => { const checked = form.offer_target_user_ids.includes(Number(customer.id)); return <label key={customer.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white"><input type="checkbox" checked={checked} onChange={() => setForm({ ...form, offer_target_user_ids: checked ? form.offer_target_user_ids.filter((id) => Number(id) !== Number(customer.id)) : [...form.offer_target_user_ids, Number(customer.id)] })} /><span>{customer.name || customer.email}</span><span className="ml-auto text-xs text-slate-400">{customer.email}</span></label>; }) : <p className="text-sm text-slate-500">No user accounts found.</p>}</div>}</fieldset><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Publish offer"}</Button></div></form></div>}
    </div>
  );
}
