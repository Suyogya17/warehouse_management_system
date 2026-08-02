import { useEffect, useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useProductInterestTracking } from "../hooks/useProductInterestTracking";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { getCustomerVisibleStock, getRoundedCartons } from "../utils/displayStock";
import { formatNumber } from "../utils/format";
import OfferAllocationReport from "./offers/OfferAllocationReport";
import OfferEditor from "./offers/OfferEditor";
import OfferProductGrid from "./offers/OfferProductGrid";
import OfferPurchases from "./offers/OfferPurchases";
import OfferStockByUserTable from "./offers/OfferStockByUserTable";
import useOffers from "./offers/useOffers";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  OFFER_PRODUCTS_PER_PAGE,
  getOfferGroupKey,
  getSeriesName,
  isActiveOffer,
} from "./offers/offerUtils";


export default function OffersPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canManage = user?.role === "ADMIN" || user?.role === "CO_ADMIN";
  const canOrder = user?.role === "USER";
  const {
    products,
    customers,
    cartProductIds,
    totalCartItems,
    loadOffers,
    addProductToCart,
  } = useOffers({ token, canManage, navigate });
  const [availabilityProducts, setAvailabilityProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [showOnlyOffers, setShowOnlyOffers] = useState(false);
  const [showOfferPurchases, setShowOfferPurchases] = useState(false);
  const [showOfferStockTable, setShowOfferStockTable] = useState(false);
  const [showOfferAllocationReport, setShowOfferAllocationReport] = useState(false);
  const [loadingOfferStockTable, setLoadingOfferStockTable] = useState(false);
  const [loadingOfferAllocationReport, setLoadingOfferAllocationReport] = useState(false);
  const [offerPurchases, setOfferPurchases] = useState([]);
  const [loadingOfferPurchases, setLoadingOfferPurchases] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    offer_label: "Special offer",
    offer_ends_at: "",
    offer_all_users: true,
    offer_target_user_ids: [],
    offer_target_quantities: {},
    offer_target_percentages: {},
    offer_target_cartons: {},
    offer_division_mode: "PERCENTAGE",
  });
  const [saving, setSaving] = useState(false);
  const offers = useMemo(() => products.filter(isActiveOffer), [products]);
  const offerAvailabilityById = useMemo(
    () => new Map(availabilityProducts.map((product) => [Number(product.id), product])),
    [availabilityProducts]
  );
  const currentCampaignUsageByUser = useMemo(() => {
    const usage = new Map();
    offerPurchases.forEach((purchase) => {
      if (
        String(purchase.status || "").toUpperCase() === "CANCELLED" ||
        Number(purchase.offer_campaign_id || 0) <= 0
      ) {
        return;
      }
      const email = String(purchase.account_email || "").trim().toLowerCase();
      const key = `${Number(purchase.offer_campaign_id)}::${email}`;
      usage.set(key, Number(usage.get(key) || 0) + Number(purchase.qty_ordered || 0));
    });
    return usage;
  }, [offerPurchases]);
  const offerStockByUserRows = useMemo(() => offers.flatMap((product) => {
    const availability = offerAvailabilityById.get(Number(product.id)) || product;
    const globallyAvailablePairs = Number(availability.available_qty ?? availability.quantity ?? product.quantity ?? 0);
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const targetsByUserId = new Map((product.offer_targets || []).map((target) => [Number(target.user_id), target]));
    const isForAllUsers = Number(product.offer_all_users ?? 1) === 1;

    return customers.filter((customer) => isForAllUsers || targetsByUserId.has(Number(customer.id))).map((customer) => {
      const target = targetsByUserId.get(Number(customer.id));
      const assignedPairs = Number(target?.display_quantity ?? product.display_quantity ?? 450);
      const campaignUsageKey = `${Number(product.offer_campaign_id || 0)}::${String(
        customer.email || ""
      ).trim().toLowerCase()}`;
      const orderedPairs = Number(
        currentCampaignUsageByUser.get(campaignUsageKey) || 0
      );
      const remainingAssignedPairs = Math.max(0, assignedPairs - orderedPairs);
      const visiblePairs = Math.max(
        0,
        Math.min(remainingAssignedPairs, globallyAvailablePairs)
      );

      return {
        id: `${product.id}-${customer.id}`,
        finished_good_id: Number(product.id),
        offer_campaign_id: Number(product.offer_campaign_id || 0) || null,
        offer_starting_pairs: Number(
          product.offer_stock_quantity_snapshot ?? product.quantity ?? 0
        ),
        offer_starting_cartons: getRoundedCartons(
          product.offer_stock_quantity_snapshot ?? product.quantity ?? 0,
          product.offer_pairs_per_carton_snapshot ??
            product.inner_boxes_per_outer_box
        ),
        article_code: product.article_code || product.name,
        product_name: product.name,
        sole_code: product.sole_code,
        color: product.color,
        user_name: customer.name,
        user_email: customer.email,
        audience: isForAllUsers ? "All users" : "Selected user",
        is_shown: true,
        assigned_percentage: target?.display_percentage ?? null,
        pairs_per_carton: pairsPerCarton,
        assigned_pairs: assignedPairs,
        assigned_cartons: getRoundedCartons(assignedPairs, pairsPerCarton),
        ordered_pairs: orderedPairs,
        remaining_assigned_pairs: remainingAssignedPairs,
        visible_pairs: visiblePairs,
        visible_cartons: getRoundedCartons(visiblePairs, pairsPerCarton),
        globally_available_pairs: globallyAvailablePairs,
        globally_available_cartons: getRoundedCartons(globallyAvailablePairs, pairsPerCarton),
        stock_status: visiblePairs > 0 ? "IN STOCK" : "OUT OF STOCK",
      };
    });
  }), [customers, currentCampaignUsageByUser, offerAvailabilityById, offers]);
  const shownOfferUserRows = offerStockByUserRows.filter((row) => row.is_shown);
  const inStockOfferUserCount = shownOfferUserRows.filter((row) => row.stock_status === "IN STOCK").length;
  const outOfStockOfferUserCount = shownOfferUserRows.filter((row) => row.stock_status === "OUT OF STOCK").length;

  const addToCart = (product) => {
    trackOfferInterest(product);
    addProductToCart(product);
  };

  const seriesOptions = useMemo(() => {
    const source = canManage ? products : offers;
    return [...new Set(source.map((product) => getSeriesName(product.sole_code)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [canManage, offers, products]);

  const stockFilterCandidates = useMemo(() => {
    const source = canManage ? (showOnlyOffers ? offers : products) : offers;
    const q = search.trim().toLowerCase();
    return source.filter((item) => {
      const matchesSeries = !seriesFilter || getSeriesName(item.sole_code) === seriesFilter;
      const matchesSearch = !q || [item.name, item.article_code, item.sole_code, item.color]
        .some((value) => String(value || "").toLowerCase().includes(q));
      return matchesSeries && matchesSearch;
    });
  }, [canManage, offers, products, search, seriesFilter, showOnlyOffers]);
  const offerStockCounts = useMemo(() => stockFilterCandidates.reduce((counts, item) => {
    const available = canManage ? Number(item.quantity || 0) : getCustomerVisibleStock(item);
    counts[available > 0 ? "IN_STOCK" : "OUT_OF_STOCK"] += 1;
    return counts;
  }, { IN_STOCK: 0, OUT_OF_STOCK: 0 }), [canManage, stockFilterCandidates]);
  const shownProducts = useMemo(() => stockFilterCandidates.filter((item) => {
    if (stockFilter === "ALL") return true;
    const available = canManage ? Number(item.quantity || 0) : getCustomerVisibleStock(item);
    return stockFilter === "IN_STOCK" ? available > 0 : available <= 0;
  }), [canManage, stockFilter, stockFilterCandidates]);
  const trackOfferInterest = useProductInterestTracking({
    token,
    search,
    resultCount: shownProducts.length,
    surface: "OFFERS",
  });

  const productGroups = useMemo(() => {
    const groups = new Map();
    shownProducts.forEach((product) => {
      const key = getOfferGroupKey(product);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    });
    return Array.from(groups.values());
  }, [shownProducts]);
  const totalPages = Math.max(1, Math.ceil(productGroups.length / OFFER_PRODUCTS_PER_PAGE));
  const paginatedProductGroups = useMemo(() => {
    const start = (currentPage - 1) * OFFER_PRODUCTS_PER_PAGE;
    return productGroups.slice(start, start + OFFER_PRODUCTS_PER_PAGE);
  }, [currentPage, productGroups]);

  useEffect(() => { setCurrentPage(1); }, [search, seriesFilter, showOnlyOffers, stockFilter]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const beginEdit = (product) => {
    const savedTargets = product.offer_targets || [];
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const savedAsCartons =
      savedTargets.length > 0 &&
      savedTargets.every(
        (target) =>
          target.display_percentage === null ||
          target.display_percentage === undefined
      );
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
      offer_target_cartons: Object.fromEntries(
        savedTargets.map((target) => [
          Number(target.user_id),
          pairsPerCarton > 0
            ? Math.floor(Number(target.display_quantity || 0) / pairsPerCarton)
            : 0,
        ])
      ),
      offer_division_mode: savedAsCartons ? "CTN" : "PERCENTAGE",
    });
  };

  const saveOffer = async (offerTargets) => {
    setSaving(true);
    try {
      await api.updateFinishedGoodOffer(editing.id, { offer_enabled: true, ...form, offer_targets: offerTargets }, token);
      showToast({ tone: "success", title: "Offer saved", message: `${editing.article_code || editing.name} is now on offer.` });
      setEditing(null);
      await loadOffers();
    } catch (error) {
      showToast({ tone: "error", title: "Could not save offer", message: error.message });
    } finally { setSaving(false); }
  };

  const removeOffer = async (product) => {
    try {
      await api.updateFinishedGoodOffer(product.id, { offer_enabled: false }, token);
      showToast({ tone: "success", title: "Offer removed", message: `${product.article_code || product.name} is no longer shown as an offer.` });
      await loadOffers();
    } catch (error) {
      showToast({ tone: "error", title: "Could not remove offer", message: error.message });
    }
  };

  const toggleOfferPurchases = async () => {
    if (showOfferPurchases) {
      setShowOfferPurchases(false);
      return;
    }
    setShowOfferStockTable(false);
    setShowOfferAllocationReport(false);
    setShowOfferPurchases(true);
    setLoadingOfferPurchases(true);
    try {
      const result = await api.getOfferPurchases(token);
      setOfferPurchases(result.data || []);
    } catch (error) {
      showToast({ tone: "error", title: "Could not load offer purchases", message: error.message });
    } finally {
      setLoadingOfferPurchases(false);
    }
  };

  const toggleOfferStockTable = async () => {
    if (showOfferStockTable) {
      setShowOfferStockTable(false);
      return;
    }
    setShowOfferPurchases(false);
    setShowOfferAllocationReport(false);
    setShowOfferStockTable(true);
    setLoadingOfferStockTable(true);
    try {
      const [availabilityResult, purchasesResult] = await Promise.all([
        api.getAvailability(token, { include_hidden: 1 }),
        api.getOfferPurchases(token),
      ]);
      setAvailabilityProducts(availabilityResult.data || []);
      setOfferPurchases(purchasesResult.data || []);
    } catch (error) {
      showToast({ tone: "error", title: "Could not load offer stock", message: error.message });
    } finally {
      setLoadingOfferStockTable(false);
    }
  };

  const toggleOfferAllocationReport = async () => {
    if (showOfferAllocationReport) {
      setShowOfferAllocationReport(false);
      return;
    }
    setShowOfferPurchases(false);
    setShowOfferStockTable(false);
    setShowOfferAllocationReport(true);
    setLoadingOfferAllocationReport(true);
    try {
      const [availabilityResult, purchasesResult] = await Promise.all([
        api.getAvailability(token, { include_hidden: 1 }),
        api.getOfferPurchases(token),
      ]);
      setAvailabilityProducts(availabilityResult.data || []);
      setOfferPurchases(purchasesResult.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not load offer allocation report",
        message: error.message,
      });
    } finally {
      setLoadingOfferAllocationReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={canManage ? "Product Offers" : "Offers"} description={canManage ? "Choose products, set the audience, and publish offers for customers." : "Browse products currently available as special offers."} />
      {canOrder && <div className="flex justify-start"><button type="button" onClick={() => navigate("/order-customer")} className="flex w-fit flex-row gap-3 rounded-xl bg-indigo-500 px-3 py-2 text-white transition hover:bg-indigo-600"><ShoppingCart size={18} /><span>Cart</span>{totalCartItems > 0 && <span className="relative -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{totalCartItems}</span>}</button></div>}
      <SectionCard title={canManage ? "Manage offers" : "Current offers"} subtitle={`${offers.length} active offer${offers.length === 1 ? "" : "s"}`} icon="finishedGoods">
        {canManage && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button type="button" variant={!showOnlyOffers && !showOfferPurchases && !showOfferStockTable && !showOfferAllocationReport ? "primary" : "secondary"} onClick={() => { setShowOnlyOffers(false); setShowOfferPurchases(false); setShowOfferStockTable(false); setShowOfferAllocationReport(false); }}>Show all products</Button>
            <Button type="button" variant={showOnlyOffers && !showOfferPurchases && !showOfferStockTable && !showOfferAllocationReport ? "primary" : "secondary"} onClick={() => { setShowOnlyOffers(true); setShowOfferPurchases(false); setShowOfferStockTable(false); setShowOfferAllocationReport(false); }}>Show products in offer ({offers.length})</Button>
            <Button type="button" variant={showOfferPurchases ? "primary" : "secondary"} onClick={toggleOfferPurchases}>Offer purchases</Button>
            <Button type="button" variant={showOfferStockTable ? "primary" : "secondary"} onClick={toggleOfferStockTable}>Offer stock by user</Button>
            <Button type="button" variant={showOfferAllocationReport ? "primary" : "secondary"} onClick={toggleOfferAllocationReport}>Offer allocation report</Button>
          </div>
        )}
        {canManage && showOfferAllocationReport && (
          <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div>
              <h3 className="font-bold text-slate-900">Offer allocation report</h3>
              <p className="text-sm text-slate-500">
                Compare current offer stock, quantities shown to each selected user,
                quantities ordered, and the remaining assignment balance.
              </p>
            </div>
            {loadingOfferAllocationReport ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Loading offer allocation report...
              </p>
            ) : (
              <OfferAllocationReport
                rows={offerStockByUserRows}
                purchases={offerPurchases}
              />
            )}
          </div>
        )}
        {canManage && showOfferStockTable && (
          <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <h3 className="font-bold text-slate-900">Offer stock by user</h3>
              <p className="text-sm text-slate-500">See who can view each offer and the quantity currently available to that user.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3"><p className="text-xs uppercase text-slate-500">Shown user offers</p><p className="text-xl font-bold">{formatNumber(shownOfferUserRows.length)}</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">In stock</p><p className="text-xl font-bold text-emerald-800">{formatNumber(inStockOfferUserCount)}</p></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-xs font-semibold uppercase text-red-700">Out of stock</p><p className="text-xl font-bold text-red-800">{formatNumber(outOfStockOfferUserCount)}</p></div>
            </div>
            {loadingOfferStockTable ? <p className="py-8 text-center text-sm text-slate-500">Loading offer stock by user...</p> : <OfferStockByUserTable rows={offerStockByUserRows} purchases={offerPurchases} />}
          </div>
        )}
        {canManage && showOfferPurchases ? (
          <OfferPurchases
            purchases={offerPurchases}
            loading={loadingOfferPurchases}
            viewer={user}
          />
        ) : null}
        {!showOfferPurchases &&
        !showOfferStockTable &&
        !showOfferAllocationReport ? (
          <>
            <div className="mb-4 flex max-w-xs flex-col gap-1">
              <label
                htmlFor="offer-series"
                className="text-xs font-medium text-slate-500"
              >
                Series
              </label>
              <select
                id="offer-series"
                value={seriesFilter}
                onChange={(event) => setSeriesFilter(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="">All Series</option>
                {seriesOptions.map((series) => (
                  <option key={series} value={series}>
                    {series}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="mb-4 flex flex-wrap gap-2"
              aria-label="Filter products by stock"
            >
              <Button
                type="button"
                size="sm"
                variant={stockFilter === "ALL" ? "primary" : "secondary"}
                onClick={() => setStockFilter("ALL")}
              >
                All ({offerStockCounts.IN_STOCK + offerStockCounts.OUT_OF_STOCK})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={stockFilter === "IN_STOCK" ? "primary" : "secondary"}
                onClick={() => setStockFilter("IN_STOCK")}
              >
                In stock ({offerStockCounts.IN_STOCK})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  stockFilter === "OUT_OF_STOCK" ? "danger" : "secondary"
                }
                onClick={() => setStockFilter("OUT_OF_STOCK")}
              >
                Out of stock ({offerStockCounts.OUT_OF_STOCK})
              </Button>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, article or color..."
              className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <OfferProductGrid
              productGroups={productGroups}
              paginatedProductGroups={paginatedProductGroups}
              canManage={canManage}
              canOrder={canOrder}
              viewer={user}
              onEdit={beginEdit}
              onRemove={removeOffer}
              onAddToCart={addToCart}
              onProductInterest={trackOfferInterest}
              cartProductIds={cartProductIds}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        ) : null}
      </SectionCard>
      <OfferEditor
        editing={editing}
        form={form}
        setForm={setForm}
        customers={customers}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={saveOffer}
      />
    </div>
  );
}
