import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Images, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ArticleCatalogCard from "../components/ArticleCatalogCard";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { getCustomerVisibleStock } from "../utils/displayStock";
import {
  sortProductGroupsByDisplayOrder,
  sortProductsByDisplayOrder,
} from "../utils/productOrdering";

const ARTICLES_PER_PAGE = 6;

const isActiveOffer = (product) =>
  Number(product.offer_enabled) === 1 &&
  (!product.offer_ends_at || new Date(product.offer_ends_at).getTime() >= Date.now());

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const getArticleGroupKey = (product) =>
  `${getSeriesName(product.sole_code).toLowerCase()}::${String(
    product.article_code || product.name || product.id
  ).trim().toLowerCase()}`;

export default function GalleryPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const role = String(user?.role || "").toUpperCase();
  const canOrder = role === "USER";
  const canBrowseOffers = role !== "MEMBER";

  const [regularProducts, setRegularProducts] = useState([]);
  const [offerProducts, setOfferProducts] = useState([]);
  const [mode, setMode] = useState("PRODUCTS");
  const [series, setSeries] = useState("");
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [downloadOption, setDownloadOption] = useState("FILTERED");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [regularResult, offerResult] = await Promise.all([
        api.getAvailability(token),
        canBrowseOffers
          ? api.getAvailability(token, { offer_view: 1 })
          : Promise.resolve({ data: [] }),
      ]);
      setRegularProducts((regularResult.data || []).filter((product) => !isActiveOffer(product)));
      setOfferProducts((offerResult.data || []).filter(isActiveOffer));
    } finally {
      setLoading(false);
    }
  }, [canBrowseOffers, token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("userCart");
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) setCart(parsed);
    } catch (error) {
      console.error("Failed to load gallery cart:", error);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (cartLoaded) localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  const sourceProducts = mode === "OFFERS" ? offerProducts : regularProducts;
  const seriesOptions = useMemo(
    () =>
      [...new Set(sourceProducts.map((product) => getSeriesName(product.sole_code)).filter(Boolean))]
        .sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
        ),
    [sourceProducts]
  );

  const articleGroups = useMemo(() => {
    const groups = new Map();
    sourceProducts.forEach((product) => {
      const key = getArticleGroupKey(product);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    });

    const query = search.trim().toLowerCase();
    return [...groups.values()]
      .map((variants) => [...variants].sort(sortProductsByDisplayOrder))
      .filter((variants) => {
        const matchesSeries =
          !series || variants.some((variant) => getSeriesName(variant.sole_code) === series);
        const matchesSearch =
          !query ||
          variants.some((variant) =>
            [variant.article_code, variant.name, variant.sole_code, variant.color]
              .some((value) => String(value || "").toLowerCase().includes(query))
          );
        const availableValues = variants.map(getCustomerVisibleStock);
        const matchesStock =
          stock === "ALL"
            ? true
            : stock === "IN_STOCK"
            ? availableValues.some((quantity) => quantity > 0)
            : availableValues.every((quantity) => quantity <= 0);
        return matchesSeries && matchesSearch && matchesStock;
      })
      .sort(sortProductGroupsByDisplayOrder);
  }, [search, series, sourceProducts, stock]);

  const totalPages = Math.max(1, Math.ceil(articleGroups.length / ARTICLES_PER_PAGE));
  const visibleGroups = articleGroups.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [mode, search, series, stock]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!seriesOptions.includes(series)) setSeries("");
  }, [series, seriesOptions]);

  useEffect(() => {
    if (!series && downloadOption === "SERIES") {
      setDownloadOption("FILTERED");
    }
  }, [downloadOption, series]);

  const cartProductIds = useMemo(
    () => new Set(cart.map((item) => Number(item.finished_good_id))),
    [cart]
  );
  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );
  const canDownload =
    downloadOption === "ALL_STANDARD" || downloadOption === "ALL_HIGH"
      ? sourceProducts.length > 0
      : downloadOption === "SERIES"
      ? Boolean(series)
      : articleGroups.length > 0;

  const addToCart = (product) => {
    const availableQty = getCustomerVisibleStock(product);
    const productId = Number(product.id);
    if (availableQty <= 0) return;
    if (cartProductIds.has(productId)) {
      navigate("/order-customer");
      return;
    }

    setCart((current) => [
      ...current,
      {
        finished_good_id: productId,
        qty_ordered: 1,
        orderBy:
          Number(product.inner_boxes_per_outer_box) > 0 ? "cartons" : "pairs",
        product: {
          id: productId,
          name: product.name || "",
          article_code: product.article_code || "",
          color: product.color || "",
          size: product.size || "",
          image_url: product.image_url || "",
          unit: product.unit || "pairs",
          inner_boxes_per_outer_box: Number(
            product.inner_boxes_per_outer_box || 0
          ),
          quantity: Number(
            product.physical_stock ?? product.quantity ?? 0
          ),
          display_stock: availableQty,
          available_qty: availableQty,
        },
      },
    ]);
  };

  const downloadGallery = async () => {
    if (!canDownload || downloadLoading) return;

    const optionMap = {
      FILTERED: { scope: "filtered", quality: "standard" },
      SERIES: { scope: "series", quality: "standard" },
      ALL_STANDARD: { scope: "all", quality: "standard" },
      ALL_HIGH: { scope: "all", quality: "high" },
    };
    const selectedOption = optionMap[downloadOption] || optionMap.FILTERED;

    setDownloadLoading(true);
    setDownloadError("");
    try {
      const file = await api.downloadCatalogue(
        {
          mode: mode === "OFFERS" ? "offers" : "products",
          ...selectedOption,
          series,
          search,
          stock,
        },
        token
      );
      const url = window.URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(error.message || "Could not download the gallery");
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-8 sm:space-y-6">
      <PageHeader
        eyebrow="Digital catalogue"
        title="Product Gallery"
        description="Browse complete articles by series and compare every available color."
        icon="finishedGoods"
      />

      <SectionCard
        title="Catalogue galleries"
        subtitle={`${articleGroups.length} matching article${articleGroups.length === 1 ? "" : "s"}`}
        icon="finishedGoods"
      >
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button
              type="button"
              variant={mode === "PRODUCTS" ? "primary" : "secondary"}
              onClick={() => setMode("PRODUCTS")}
            >
              <Images size={16} />
              All Products Gallery
            </Button>
            {canBrowseOffers ? (
              <Button
                type="button"
                variant={mode === "OFFERS" ? "primary" : "secondary"}
                onClick={() => setMode("OFFERS")}
              >
                <Images size={16} />
                Offer Gallery ({offerProducts.length})
              </Button>
            ) : null}
          </div>

          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <select
              value={downloadOption}
              onChange={(event) => {
                setDownloadOption(event.target.value);
                setDownloadError("");
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:min-w-52 sm:w-auto"
              aria-label="Gallery download type"
            >
              <option value="FILTERED">Current filtered products</option>
              <option value="SERIES" disabled={!series}>
                Selected series{series ? ` - ${series}` : ""}
              </option>
              <option value="ALL_STANDARD">All products - Standard PDF</option>
              <option value="ALL_HIGH">All products - High-quality ZIP</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              disabled={!canDownload || loading || downloadLoading}
              onClick={downloadGallery}
            >
              <Download size={16} />
              {downloadLoading ? "Preparing..." : "Download"}
            </Button>
            {canOrder ? (
              <Button type="button" onClick={() => navigate("/order-customer")}>
                <ShoppingCart size={16} />
                Cart {totalCartItems > 0 ? `(${totalCartItems})` : ""}
              </Button>
            ) : null}
          </div>
        </div>

        {downloadError ? (
          <p className="-mt-2 mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {downloadError}
          </p>
        ) : null}

        <div className="mb-6 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:p-4 md:grid-cols-3">
          <select
            value={series}
            onChange={(event) => setSeries(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">All Series</option>
            {seriesOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search article, color or series..."
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
          <select
            value={stock}
            onChange={(event) => setStock(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="ALL">All stock</option>
            <option value="IN_STOCK">In-stock articles</option>
            <option value="OUT_OF_STOCK">Out-of-stock articles</option>
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm font-medium text-slate-500">
            Loading catalogue gallery...
          </div>
        ) : visibleGroups.length ? (
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
            {visibleGroups.map((variants) => (
              <ArticleCatalogCard
                key={getArticleGroupKey(variants[0])}
                variants={variants}
                offer={mode === "OFFERS"}
                onAddToCart={canOrder ? addToCart : undefined}
                cartProductIds={cartProductIds}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={mode === "OFFERS" ? "No offer articles found" : "No catalogue articles found"}
            description="Try another series, article search, or stock filter."
          />
        )}

        {articleGroups.length > ARTICLES_PER_PAGE ? (
          <nav className="mt-7 flex flex-wrap items-center justify-center gap-2 sm:gap-3" aria-label="Gallery pages">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <span className="text-sm font-bold text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={currentPage === totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
            >
              Next
            </Button>
          </nav>
        ) : null}
      </SectionCard>
    </div>
  );
}
