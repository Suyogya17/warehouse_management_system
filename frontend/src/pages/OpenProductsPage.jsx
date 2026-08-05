import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Package as PackageIcon,
  Users,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import VisibilitySummary from "../components/VisibilitySummary";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { getRoundedCartons } from "../utils/displayStock";
import { formatNumber, formatPrice } from "../utils/format";
import { canManageProductVisibility } from "../utils/pagePermissions";
import { getCommissionLabel, isCommissionProduct } from "../utils/commission";
import { buildVisibilitySummary } from "../utils/visibilitySummary";

const CUSTOMER_ROLES = new Set(["USER", "MEMBER", "ELDER"]);
const PRODUCTS_PER_PAGE = 12;
const COUNTRY_NAMES = { NP: "Nepal", IN: "India" };

const getCountryLabel = (countryCode = "NP") =>
  COUNTRY_NAMES[String(countryCode || "NP").toUpperCase()] ||
  String(countryCode || "NP").toUpperCase();

const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

const getProductGroupKey = (product = {}) =>
  product.article_code ||
  product.name?.split("_")?.slice(0, -1)?.join("_") ||
  product.name ||
  `product-${product.id}`;

const isActiveOffer = (product = {}) =>
  Number(product.offer_enabled || 0) === 1 &&
  (!product.offer_ends_at ||
    new Date(product.offer_ends_at).getTime() >= Date.now());

const sortProducts = (a, b) => {
  const orderDiff =
    Number(a.display_order || 999999) - Number(b.display_order || 999999);
  if (orderDiff !== 0) return orderDiff;
  return String(a.article_code || a.name || "").localeCompare(
    String(b.article_code || b.name || ""),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
};

function PaginationBar({ total, current, setPage }) {
  if (total <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => setPage((value) => Math.max(1, value - 1))}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="px-2 text-sm font-semibold text-slate-500">
        Page {current} of {total}
      </span>
      <button
        type="button"
        disabled={current >= total}
        onClick={() => setPage((value) => Math.min(total, value + 1))}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

function OpenProductCard({
  variants = [],
  countryCode,
  countryUserCount,
  selectedUser,
}) {
  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);
  const [usersExpanded, setUsersExpanded] = useState(false);

  useEffect(() => {
    setSelectedVariant((current) => {
      const refreshed = variants.find(
        (variant) => Number(variant.id) === Number(current?.id)
      );
      return refreshed || variants[0] || null;
    });
  }, [variants]);

  useEffect(() => {
    setUsersExpanded(false);
  }, [countryCode, selectedVariant?.id]);

  if (!selectedVariant) return null;

  const availableQty = Number(
    selectedVariant.available_qty ?? selectedVariant.quantity ?? 0
  );
  const cartons = getRoundedCartons(
    availableQty,
    selectedVariant.inner_boxes_per_outer_box
  );
  const openUsers = selectedVariant.open_users || [];
  const priceValue =
    countryCode === "IN" ? selectedVariant.india_price : selectedVariant.price;
  const priceCurrency = countryCode === "IN" ? "INR" : "NPR";
  const hasPrice =
    priceValue !== null && priceValue !== undefined && priceValue !== "";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selectedVariant.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="h-full w-full cursor-zoom-in object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
          </div>
        )}
        <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm sm:text-xs">
            <Eye size={12} /> In stock
          </span>
          {isActiveOffer(selectedVariant) ? (
            <span className="rounded-full bg-amber-400 px-2 py-1 text-[10px] font-bold text-amber-950 shadow-sm sm:text-xs">
              OFFER
            </span>
          ) : null}
        </div>
        <ProductImageGallery
          variants={variants}
          selectedVariant={selectedVariant}
          onSelect={setSelectedVariant}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-950">
              {selectedVariant.article_code || selectedVariant.name}
            </h3>
            <p className="truncate text-xs text-slate-500">
              {getSeriesName(selectedVariant.sole_code) || "No series"}
              {selectedVariant.size ? ` · ${selectedVariant.size}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {getCommissionLabel(selectedVariant)}
          </span>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedVariant(variant)}
              className={`whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium transition-all ${
                Number(selectedVariant.id) === Number(variant.id)
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {variant.color || `Variant ${variant.id}`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-50 p-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Available
            </p>
            <p className="text-sm font-bold text-slate-950">
              {formatNumber(availableQty)} {selectedVariant.unit || "pairs"}
            </p>
          </div>
          <div className="border-l border-emerald-200 pl-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              CTN
            </p>
            <p className="text-sm font-bold text-slate-950">
              {formatNumber(cartons)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">{priceCurrency} price</span>
          <span className="font-bold text-emerald-700">
            {hasPrice ? formatPrice(priceValue, priceCurrency) : "Not set"}
          </span>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-indigo-700">
              <Users size={14} className="shrink-0" />
              <span>
                {selectedUser
                  ? `Visible to ${selectedUser.name}`
                  : `Shown to ${formatNumber(openUsers.length)} of ${formatNumber(
                      countryUserCount
                    )} ${getCountryLabel(countryCode)} users`}
              </span>
            </div>
            {!selectedUser && openUsers.length ? (
              <button
                type="button"
                aria-expanded={usersExpanded}
                onClick={() => setUsersExpanded((value) => !value)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
              >
                {usersExpanded ? "Hide" : "View users"}
                {usersExpanded ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>
            ) : null}
          </div>

          {!selectedUser && usersExpanded ? (
            <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto border-t border-indigo-100 pt-2">
              {openUsers.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-indigo-100 bg-white px-2 py-1.5"
                >
                  <p className="truncate text-xs font-bold text-slate-800">
                    {item.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {item.email || "No email"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </article>
  );
}

export default function OpenProductsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAuthorized = canManageProductVisibility(user);

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("NP");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [usersRes, productsRes, permissionsRes, availabilityRes] =
        await Promise.all([
          api.getUsers(token),
          api.getFinishedGoods(token),
          api.getPermissions(token, { compact: 1 }),
          api.getAvailability(token, { include_hidden: 1 }),
        ]);

      setUsers(
        (usersRes.data || []).filter((item) =>
          CUSTOMER_ROLES.has(String(item.role || "").toUpperCase())
        )
      );
      setProducts(productsRes.data || []);
      setPermissions(permissionsRes.data || []);
      setAvailability(availabilityRes.data || []);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, token]);

  useDataRefresh(load, "open-products");

  useEffect(() => {
    if (!isAuthorized) return;
    load().catch((error) => {
      showToast({
        tone: "error",
        title: "Load failed",
        message: error.message || "Could not load open products.",
      });
    });
  }, [isAuthorized, load, showToast]);

  const availableByProductId = useMemo(
    () =>
      new Map(
        availability.map((item) => [
          Number(item.id),
          Number(item.available_qty ?? item.quantity ?? 0),
        ])
      ),
    [availability]
  );

  const productsWithAvailability = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        available_qty: availableByProductId.has(Number(product.id))
          ? availableByProductId.get(Number(product.id))
          : Number(product.quantity || 0),
      })),
    [availableByProductId, products]
  );

  const visibilitySummary = useMemo(
    () =>
      buildVisibilitySummary({
        products: productsWithAvailability,
        users,
        permissions,
      }),
    [permissions, productsWithAvailability, users]
  );

  const usersByCountry = useMemo(() => {
    const grouped = new Map();
    users.forEach((item) => {
      const countryCode = String(item.country_code || "NP").toUpperCase();
      if (!grouped.has(countryCode)) grouped.set(countryCode, []);
      grouped.get(countryCode).push(item);
    });
    grouped.forEach((items) =>
      items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    );
    return grouped;
  }, [users]);

  const countryOptions = useMemo(() => {
    const countryCodes = new Set(["NP", "IN"]);
    usersByCountry.forEach((_, countryCode) => countryCodes.add(countryCode));
    return [...countryCodes].sort((a, b) => {
      const priority = { NP: 0, IN: 1 };
      return (
        (priority[a] ?? 10) - (priority[b] ?? 10) ||
        getCountryLabel(a).localeCompare(getCountryLabel(b))
      );
    });
  }, [usersByCountry]);

  const deniedKeys = useMemo(
    () =>
      new Set(
        permissions
          .filter((permission) => Number(permission.can_view) === 0)
          .map(
            (permission) =>
              `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
          )
      ),
    [permissions]
  );

  const grantedKeys = useMemo(
    () =>
      new Set(
        permissions
          .filter((permission) => Number(permission.can_view) === 1)
          .map(
            (permission) =>
              `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
          )
      ),
    [permissions]
  );

  const countryOpenGroups = useMemo(
    () =>
      countryOptions.map((countryCode) => {
        const countryUsers = usersByCountry.get(countryCode) || [];
        const openItems = productsWithAvailability
          .filter(
            (product) =>
              Number(product.available_qty || 0) > 0 &&
              Number(product.is_visible) === 1
          )
          .map((product) => {
            const openUsers = countryUsers.filter((countryUser) => {
              const key = `${Number(countryUser.id)}:${Number(product.id)}`;
              return grantedKeys.has(key) && !deniedKeys.has(key);
            });
            return { ...product, open_users: openUsers };
          })
          .filter((product) => product.open_users.length > 0);

        const groupedProducts = new Map();
        openItems.sort(sortProducts).forEach((product) => {
          const key = getProductGroupKey(product);
          if (!groupedProducts.has(key)) groupedProducts.set(key, []);
          groupedProducts.get(key).push(product);
        });

        return {
          countryCode,
          users: countryUsers,
          products: [...groupedProducts.values()],
        };
      }),
    [
      countryOptions,
      deniedKeys,
      grantedKeys,
      productsWithAvailability,
      usersByCountry,
    ]
  );

  const selectedCountryGroup =
    countryOpenGroups.find((group) => group.countryCode === selectedCountry) ||
    countryOpenGroups[0] ||
    null;
  const selectedUser = (selectedCountryGroup?.users || []).find(
    (item) => Number(item.id) === Number(selectedUserId)
  );

  const userVisibleProducts = useMemo(() => {
    if (!selectedUserId) return selectedCountryGroup?.products || [];
    return (selectedCountryGroup?.products || [])
      .map((variants) =>
        variants.filter((product) =>
          (product.open_users || []).some(
            (item) => Number(item.id) === Number(selectedUserId)
          )
        )
      )
      .filter((variants) => variants.length > 0);
  }, [selectedCountryGroup, selectedUserId]);

  const seriesOptions = useMemo(() => {
    const series = new Set();
    userVisibleProducts.forEach((variants) =>
      variants.forEach((product) => {
        const value = getSeriesName(product.sole_code);
        if (value) series.add(value);
      })
    );
    return [...series].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [userVisibleProducts]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return userVisibleProducts
      .map((variants) =>
        variants.filter((product) => {
          const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
          const matchesSearch =
            !query ||
            [
              product.name,
              product.article_code,
              product.sole_code,
              product.color,
              product.size,
            ].some((value) =>
              String(value || "").toLowerCase().includes(query)
            );
          const matchesSeries =
            !seriesFilter || getSeriesName(product.sole_code) === seriesFilter;
          const matchesCommission =
            !commissionFilter ||
            (commissionFilter === "commission") === isCommissionProduct(product);
          const matchesType =
            !typeFilter ||
            (typeFilter === "offer") === isActiveOffer(product);
          const matchesStock =
            !stockFilter ||
            (stockFilter === "low" &&
              pairsPerCarton > 0 &&
              Number(product.available_qty || 0) <= pairsPerCarton);
          return (
            matchesSearch &&
            matchesSeries &&
            matchesCommission &&
            matchesType &&
            matchesStock
          );
        })
      )
      .filter((variants) => variants.length > 0);
  }, [
    commissionFilter,
    search,
    seriesFilter,
    stockFilter,
    typeFilter,
    userVisibleProducts,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  );
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE
  );
  const hasFilters =
    search ||
    selectedUserId ||
    seriesFilter ||
    commissionFilter ||
    typeFilter ||
    stockFilter;

  useEffect(() => {
    setSelectedUserId("");
    setSearch("");
    setSeriesFilter("");
    setCommissionFilter("");
    setTypeFilter("");
    setStockFilter("");
    setPage(1);
  }, [selectedCountry]);

  useEffect(() => {
    setPage(1);
  }, [
    commissionFilter,
    search,
    selectedUserId,
    seriesFilter,
    stockFilter,
    typeFilter,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setSelectedUserId("");
    setSearch("");
    setSeriesFilter("");
    setCommissionFilter("");
    setTypeFilter("");
    setStockFilter("");
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          You do not have permission to manage product show/hide.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visibility"
        title="Open Products"
        description="Browse every available product currently open to Nepal or India customers. Filter by an exact user to verify what they can see."
        icon="eye"
      />

      <VisibilitySummary summary={visibilitySummary} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {countryOpenGroups.map((group) => (
          <button
            key={group.countryCode}
            type="button"
            onClick={() => setSelectedCountry(group.countryCode)}
            className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${
              selectedCountry === group.countryCode
                ? "border-emerald-300 bg-emerald-50 ring-4 ring-emerald-100"
                : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {getCountryLabel(group.countryCode)}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {formatNumber(group.products.length)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              open articles · {formatNumber(group.users.length)} customer
              {group.users.length === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Eye size={18} className="text-emerald-500" />
            {getCountryLabel(selectedCountryGroup?.countryCode)} open products
          </h2>
          <p className="text-sm text-slate-500">
            Only products with available stock and active customer access are shown.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, article, color…"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 2xl:col-span-2"
          />
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">All {getCountryLabel(selectedCountry)} users</option>
            {(selectedCountryGroup?.users || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.email}
              </option>
            ))}
          </select>
          <select
            value={seriesFilter}
            onChange={(event) => setSeriesFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">All Series</option>
            {seriesOptions.map((series) => (
              <option key={series} value={series}>
                {series}
              </option>
            ))}
          </select>
          <select
            value={commissionFilter}
            onChange={(event) => setCommissionFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">All commission</option>
            <option value="commission">Commission</option>
            <option value="non-commission">Non commission</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">All product types</option>
            <option value="regular">Regular products</option>
            <option value="offer">Offer products</option>
          </select>
          <select
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">All available stock</option>
            <option value="low">Low stock (1 CTN or less)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {formatNumber(filteredProducts.length)} available article
            {filteredProducts.length === 1 ? "" : "s"}
            {selectedUser ? ` visible to ${selectedUser.name}` : ""}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-300"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl bg-white py-14 text-center text-sm text-slate-500">
            Loading open products…
          </div>
        ) : paginatedProducts.length ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {paginatedProducts.map((variants) => (
                <OpenProductCard
                  key={`${selectedCountry}-${variants
                    .map((variant) => variant.id)
                    .join("-")}`}
                  variants={variants}
                  countryCode={selectedCountry}
                  countryUserCount={selectedCountryGroup?.users.length || 0}
                  selectedUser={selectedUser}
                />
              ))}
            </div>
            <PaginationBar
              total={totalPages}
              current={page}
              setPage={setPage}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-400">
            {hasFilters
              ? "No available products match the selected user and filters."
              : `No available products are open for ${getCountryLabel(
                  selectedCountry
                )}.`}
          </div>
        )}
      </section>
    </div>
  );
}
