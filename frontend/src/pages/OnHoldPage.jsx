import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Package as PackageIcon } from "lucide-react";
import PageHeader from "../components/PageHeader";
import ProductImageGallery from "../components/ProductImageGallery";
import VisibilitySummary from "../components/VisibilitySummary";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { getRoundedCartons } from "../utils/displayStock";
import { formatNumber } from "../utils/format";
import { canManageProductVisibility } from "../utils/pagePermissions";
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
        onClick={() => setPage((page) => Math.max(1, page - 1))}
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
        onClick={() => setPage((page) => Math.min(total, page + 1))}
        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

function OnHoldProductCard({ variants = [], onShowForCountry, disabled }) {
  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);

  useEffect(() => {
    setSelectedVariant((current) => {
      const refreshed = variants.find(
        (variant) => Number(variant.id) === Number(current?.id)
      );
      return refreshed || variants[0] || null;
    });
  }, [variants]);

  if (!selectedVariant) return null;

  const availableQty = Number(
    selectedVariant.available_qty ?? selectedVariant.quantity ?? 0
  );
  const cartons = getRoundedCartons(
    availableQty,
    selectedVariant.inner_boxes_per_outer_box
  );
  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) >
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white transition-all duration-300 hover:shadow-xl">
      <div className="relative aspect-[5/3] overflow-hidden bg-slate-100">
        {selectedVariant.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="h-full w-full cursor-zoom-in object-cover opacity-60 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PackageIcon className="text-slate-400" size={34} />
          </div>
        )}
        <div className="absolute left-2 right-2 top-2 flex items-start justify-between">
          {isNew ? (
            <span className="rounded-full bg-indigo-500 px-2 py-1 text-[10px] font-semibold text-white opacity-80 sm:text-xs">
              NEW
            </span>
          ) : (
            <div />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">
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

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm font-bold leading-snug text-slate-900">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>
          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
            On Hold
          </span>
        </div>

        {selectedVariant.size ? (
          <p className="text-xs text-slate-600">
            Size: <span className="font-semibold">{selectedVariant.size}</span>
          </p>
        ) : null}

        <div className="flex gap-1 overflow-x-auto pb-1">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedVariant(variant)}
              className={`whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium transition-all ${
                Number(selectedVariant.id) === Number(variant.id)
                  ? "bg-amber-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {variant.color || `Variant ${variant.id}`}
            </button>
          ))}
        </div>

        {selectedVariant.sole_code ? (
          <p className="text-xs text-slate-600">
            Sole: <span className="font-semibold">{selectedVariant.sole_code}</span>
          </p>
        ) : null}

        <div className="space-y-1.5 rounded-xl bg-amber-50 p-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-amber-700">Stock</span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(availableQty)} {selectedVariant.unit || "pairs"}
            </span>
          </div>
          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 ? (
            <div className="flex items-center justify-between border-t border-amber-200 pt-1.5">
              <span className="text-xs text-amber-700">Cartons</span>
              <span className="text-sm font-bold text-amber-700">
                {formatNumber(cartons)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-auto rounded-xl border border-amber-100 bg-white p-2">
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
                disabled={disabled}
                onClick={() => onShowForCountry(selectedVariant, scope)}
                className="h-8 rounded-lg bg-indigo-500 px-2 text-[11px] font-bold text-white transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function OnHoldPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAuthorized = canManageProductVisibility(user);

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("NP");
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingProductId, setSavingProductId] = useState(null);

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

  useDataRefresh(load, "on-hold");

  useEffect(() => {
    if (!isAuthorized) return;
    load().catch((error) => {
      showToast({
        tone: "error",
        title: "Load failed",
        message: error.message || "Could not load on-hold products.",
      });
    });
  }, [isAuthorized, load, showToast]);

  const availableByProductId = useMemo(
    () =>
      new Map(
        availability.map((product) => [
          Number(product.id),
          Number(product.available_qty ?? product.quantity ?? 0),
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
              `${Number(permission.user_id)}:${Number(
                permission.finished_good_id
              )}`
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
              `${Number(permission.user_id)}:${Number(
                permission.finished_good_id
              )}`
          )
      ),
    [permissions]
  );

  const countryHoldGroups = useMemo(
    () =>
      countryOptions.map((countryCode) => {
        const countryUsers = usersByCountry.get(countryCode) || [];
        const holdItems = countryUsers.length
          ? productsWithAvailability.filter((product) => {
              if (Number(product.available_qty || 0) <= 0) return false;
              return !countryUsers.some((countryUser) => {
                const key = `${Number(countryUser.id)}:${Number(product.id)}`;
                return grantedKeys.has(key) && !deniedKeys.has(key);
              });
            })
          : [];
        const groupedProducts = new Map();
        holdItems.sort(sortProducts).forEach((product) => {
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
    countryHoldGroups.find((group) => group.countryCode === selectedCountry) ||
    countryHoldGroups[0] ||
    null;

  const seriesOptions = useMemo(() => {
    const series = new Set();
    (selectedCountryGroup?.products || []).forEach((variants) =>
      variants.forEach((product) => {
        const name = getSeriesName(product.sole_code);
        if (name) series.add(name);
      })
    );
    return [...series].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [selectedCountryGroup]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (selectedCountryGroup?.products || [])
      .map((variants) =>
        variants.filter((product) => {
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
          return matchesSearch && matchesSeries;
        })
      )
      .filter((variants) => variants.length > 0);
  }, [search, selectedCountryGroup, seriesFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  );
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    setSearch("");
    setSeriesFilter("");
    setPage(1);
  }, [selectedCountry]);

  useEffect(() => {
    setPage(1);
  }, [search, seriesFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const showProductForCountry = async (product, countryScope = "both") => {
    const scopeCodes =
      countryScope === "both"
        ? ["NP", "IN"]
        : [String(countryScope || "NP").toUpperCase()];
    const targetUsers = users.filter((item) =>
      scopeCodes.includes(String(item.country_code || "NP").toUpperCase())
    );
    const scopeLabel =
      countryScope === "both"
        ? "Nepal and India"
        : getCountryLabel(scopeCodes[0]);

    if (!targetUsers.length) {
      showToast({
        tone: "error",
        title: "No users found",
        message: `No ${scopeLabel} customers were found.`,
      });
      return;
    }

    try {
      setSavingProductId(Number(product.id));
      await Promise.all(
        targetUsers.map((targetUser) =>
          api.grantPermission(
            {
              user_id: Number(targetUser.id),
              finished_good_ids: [Number(product.id)],
            },
            token
          )
        )
      );
      await load();
      announceDataRefresh("finished-goods");
      announceDataRefresh("permissions");
      announceDataRefresh("on-hold");
      showToast({
        tone: "success",
        title: "Product shown",
        message: `${product.article_code || product.name} is now visible to ${scopeLabel} customers.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Show product failed",
        message: error.message || "Could not update product access.",
      });
    } finally {
      setSavingProductId(null);
    }
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
        title="On Hold Products"
        description="Review every in-stock product that is hidden from all customers in Nepal or India."
        icon="hidden"
      />

      <VisibilitySummary summary={visibilitySummary} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {countryHoldGroups.map((group) => (
          <button
            key={group.countryCode}
            type="button"
            onClick={() => setSelectedCountry(group.countryCode)}
            className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${
              selectedCountry === group.countryCode
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
              on hold for {formatNumber(group.users.length)} customer
              {group.users.length === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <EyeOff size={18} className="text-amber-500" />
              {getCountryLabel(selectedCountryGroup?.countryCode)} on hold
            </h2>
            <p className="text-sm text-slate-500">
              All in-stock articles hidden from every customer in {getCountryLabel(selectedCountryGroup?.countryCode)}.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, article or color…"
              className="h-10 min-w-64 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <select
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            >
              <option value="">All Series</option>
              {seriesOptions.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
            {search || seriesFilter ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSeriesFilter("");
                }}
                className="h-10 rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-300"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filteredProducts.length
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {filteredProducts.length
              ? `${formatNumber(filteredProducts.length)} articles need review`
              : "All products shown"}
          </span>
          <span className="text-xs text-slate-400">
            Out-of-stock products are kept on the Out of Stock page.
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white py-14 text-center text-sm text-slate-500">
            Loading on-hold products…
          </div>
        ) : paginatedProducts.length ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {paginatedProducts.map((variants) => (
                <OnHoldProductCard
                  key={`${selectedCountry}-${variants
                    .map((variant) => variant.id)
                    .join("-")}`}
                  variants={variants}
                  onShowForCountry={showProductForCountry}
                  disabled={variants.some(
                    (variant) => Number(variant.id) === savingProductId
                  )}
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
            {search || seriesFilter
              ? "No on-hold products match the selected filters."
              : `No products are on hold for ${getCountryLabel(
                  selectedCountryGroup?.countryCode
                )}.`}
          </div>
        )}
      </section>
    </div>
  );
}
