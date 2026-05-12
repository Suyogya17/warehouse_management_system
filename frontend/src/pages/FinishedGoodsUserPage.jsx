import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Filter,
  ShoppingCart,
  Plus,
  Check,
  Package as PackageIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";

import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";

import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ variants = [], onAddToCart, isInCart }) {
  const [selectedVariant, setSelectedVariant] = useState(
    variants?.[0] || null
  );

  useEffect(() => {
    if (variants?.length) {
      setSelectedVariant(variants[0]);
    }
  }, [variants]);

  // preload images
  useEffect(() => {
    variants.slice(1).forEach((variant) => {
      if (variant?.image_url) {
        const image = new Image();
        image.src = `${APP_BASE_URL}${variant.image_url}`;
      }
    });
  }, [variants]);

  if (!selectedVariant) return null;

  const isLowStock = Number(selectedVariant.quantity || 0) < 10;

  const isOutOfStock = Number(selectedVariant.quantity || 0) <= 0;

  const isNew =
    selectedVariant.created_at &&
    new Date(selectedVariant.created_at) >
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const cartons = selectedVariant.inner_boxes_per_outer_box
    ? Math.floor(
        Number(selectedVariant.quantity || 0) /
          Number(selectedVariant.inner_boxes_per_outer_box)
      )
    : 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300">
      {/* IMAGE */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {selectedVariant.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon className="text-slate-400" size={42} />
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

        {/* OUT OF STOCK */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold text-sm">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex flex-col  flex-1 p-4 gap-3">
        {/* TITLE */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug min-h-[44px]">
            {selectedVariant.article_code || selectedVariant.name}
          </h3>

          <span
            className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap font-semibold
            ${
              isOutOfStock
                ? "bg-gray-100 text-gray-600"
                : isLowStock
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
            }`}
          >
            {isOutOfStock ? "Out" : isLowStock ? "Low" : "Stock"}
          </span>
        </div>

        {/* COLORS */}
        {variants.length > 1 && (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-500 font-medium">
              Colors
            </p>

            <div className="flex flex-wrap gap-1.5">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all
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

        {/* SIZE */}
        {selectedVariant.size && (
          <div className="text-xs text-slate-600">
            Size:{" "}
            <span className="font-semibold">
              {selectedVariant.size}
            </span>
          </div>
        )}
        

        {/* STOCK */}
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Available Stock
            </span>

            <span className="text-sm font-bold text-slate-900">
              {formatNumber(selectedVariant.quantity)}{" "}
              {selectedVariant.unit || "pcs"}
            </span>
          </div>

          {Number(selectedVariant.inner_boxes_per_outer_box) > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-xs text-slate-500">
                Cartons
              </span>

              <span className="text-sm font-bold text-indigo-600">
                {formatNumber(cartons)}
              </span>
            </div>
          )}
        </div>

        

        {/* BUTTON */}
        <div className="mt-auto pt-2">
          <button
            onClick={() => onAddToCart(selectedVariant)}
            disabled={isOutOfStock}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all
            ${
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
    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);

  const [cartLoaded, setCartLoaded] = useState(false);

  const [showFilters, setShowFilters] = useState(false);

  const [sort, setSort] = useState("newest");

  const [filters, setFilters] = useState({
    search: "",
    size: "",
    stock: "all",
  });

  const [currentPage, setCurrentPage] = useState(1);

  const productsPerPage = 12;

  // LOAD CART
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("userCart");

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);

        if (Array.isArray(parsedCart)) {
          setCart(parsedCart);
        }
      }
    } catch (err) {
      console.error("Failed to parse cart:", err);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  // SAVE CART
  useEffect(() => {
    if (!cartLoaded) return;

    localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  // LOAD PRODUCTS
  const load = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  // GROUP PRODUCTS
  const groupedProducts = useMemo(() => {
    const groups = {};

    items.forEach((item) => {
      const baseCode =
        item.article_code ||
        item.name?.split("_")?.slice(0, -1)?.join("_") ||
        item.name ||
        `product-${item.id}`;

      if (!groups[baseCode]) {
        groups[baseCode] = [];
      }

      groups[baseCode].push(item);
    });

    return Object.values(groups);
  }, [items]);

  // SIZES
  const sizes = [
    ...new Set(items.map((i) => i.size).filter(Boolean)),
  ];

  // FILTER PRODUCTS
  const filteredProducts = useMemo(() => {
    return groupedProducts
      .map((variants) =>
        variants.filter((item) => {
          const matchSearch =
            !filters.search ||
            item.name
              ?.toLowerCase()
              .includes(filters.search.toLowerCase()) ||
            item.article_code
              ?.toLowerCase()
              .includes(filters.search.toLowerCase());

          const matchSize =
            !filters.size || item.size === filters.size;

          const matchStock =
            filters.stock === "all"
              ? true
              : filters.stock === "low"
              ? Number(item.quantity) < 10
              : Number(item.quantity) >= 10;

          return matchSearch && matchSize && matchStock;
        })
      )
      .filter((variants) => variants.length > 0)
      .sort((a, b) => {
        const dateA = new Date(a[0]?.created_at || 0);
        const dateB = new Date(b[0]?.created_at || 0);

        return sort === "newest"
          ? dateB - dateA
          : dateA - dateB;
      });
  }, [groupedProducts, filters, sort]);

  // RESET PAGE
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sort]);

  // PAGINATION
  const totalPages = Math.ceil(
    filteredProducts.length / productsPerPage
  );

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  // CART IDS
  const cartProductIds = useMemo(() => {
    return new Set(
      cart.map((c) => Number(c.finished_good_id))
    );
  }, [cart]);

  const isProductInCart = (variants) => {
    return variants.some((v) =>
      cartProductIds.has(Number(v.id))
    );
  };

  // ADD TO CART
  const handleAddToCart = (product) => {
    if (!product || Number(product.quantity) <= 0) return;

    const productId = Number(product.id);

    if (cartProductIds.has(productId)) {
      navigate("/order-customer");
      return;
    }

    const cartItem = {
      finished_good_id: productId,
      qty_ordered: 1,
      orderBy:
        Number(product.inner_boxes_per_outer_box) > 0
          ? "cartons"
          : "pairs",

      product: {
        id: productId,
        name: product.name || "",
        article_code: product.article_code || "",
        color: product.color || "",
        size: product.size || "",
        image_url: product.image_url || "",
        quantity: Number(product.quantity || 0),
        unit: product.unit || "pcs",
        inner_boxes_per_outer_box: Number(
          product.inner_boxes_per_outer_box || 0
        ),
      },
    };

    setCart((prev) => [...prev, cartItem]);

    navigate("/order-customer");
  };

  // TOTAL CART ITEMS
  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );

  // PAGINATION BUTTONS
  const getPages = () => {
    const pages = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(
          1,
          "...",
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        );
      } else {
        pages.push(
          1,
          "...",
          currentPage - 1,
          currentPage,
          currentPage + 1,
          "...",
          totalPages
        );
      }
    }

    return pages;
  };

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
        {/* CART */}
        <button
          onClick={() => navigate("/order-customer")}
          className="relative px-5 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <ShoppingCart size={18} />

          <span>Cart</span>

          {totalCartItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
              {totalCartItems}
            </span>
          )}
        </button>

        {/* FILTER BUTTONS */}
        <div className="flex gap-2">
          <button
            onClick={() =>
              setShowFilters((prev) => !prev)
            }
            className={`flex-1 sm:flex-none px-4 py-2.5 border rounded-xl font-medium transition-all flex items-center justify-center gap-2
            ${
              showFilters
                ? "bg-indigo-500 text-white border-indigo-500"
                : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
            }`}
          >
            <Filter size={16} />

            <span>Filter</span>
          </button>

          <button
            onClick={() =>
              setSort((prev) =>
                prev === "newest" ? "oldest" : "newest"
              )
            }
            className={`flex-1 sm:flex-none px-4 py-2.5 border rounded-xl font-medium transition-all
            ${
              sort === "newest"
                ? "bg-indigo-500 text-white border-indigo-500"
                : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
            }`}
          >
            {sort === "newest" ? "Newest" : "Oldest"}
          </button>
        </div>
      </div>

      {/* FILTERS */}
      {showFilters && (
        <SectionCard title="Filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  search: e.target.value,
                }))
              }
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  size: e.target.value,
                }))
              }
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
              value={filters.stock}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  stock: e.target.value,
                }))
              }
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Stock</option>

              <option value="available">
                In Stock
              </option>

              <option value="low">
                Low Stock
              </option>
            </select>

            <button
              onClick={() =>
                setFilters({
                  search: "",
                  size: "",
                  stock: "all",
                })
              }
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all"
            >
              Clear
            </button>
          </div>
        </SectionCard>
      )}

      {/* COUNT */}
      <div className="text-sm text-slate-600">
        <span className="font-semibold">
          {filteredProducts.length}
        </span>{" "}
        products found
      </div>

      {/* PRODUCTS */}
      {paginatedProducts.length ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {paginatedProducts.map((variants, index) => (
              <ProductCard
                key={index}
                variants={variants}
                onAddToCart={handleAddToCart}
                isInCart={isProductInCart(variants)}
              />
            ))}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 flex-wrap pt-4">
              {/* PREVIOUS */}
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.max(p - 1, 1)
                  )
                }
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
              >
                Previous
              </button>

              {/* PAGE NUMBERS */}
              {getPages().map((page, index) =>
                page === "..." ? (
                  <span
                    key={index}
                    className="px-2 text-slate-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={index}
                    onClick={() =>
                      setCurrentPage(page)
                    }
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

              {/* NEXT */}
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(p + 1, totalPages)
                  )
                }
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