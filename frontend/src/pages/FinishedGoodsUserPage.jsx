// import { useCallback, useEffect, useMemo, useState } from "react";
// import { Filter } from "lucide-react";
// import EmptyState from "../components/EmptyState";
// import PageHeader from "../components/PageHeader";
// import SectionCard from "../components/SectionCard";
// import { useAuth } from "../context/AuthContext";
// import { useDataRefresh } from "../hooks/useDataRefresh";
// import { api, APP_BASE_URL } from "../services/api";
// import { formatNumber } from "../utils/format";

// function ProductCard({ item }) {
//   const isLowStock = item.quantity < 10;

//   return (
//     <div className="group rounded-2xl border border-slate-200 bg-white hover:shadow-xl transition-all duration-300 overflow-hidden">
      
//       {/* Image */}
//       <div className="h-52 bg-slate-100 overflow-hidden">
//         {item.image_url ? (
//           <img
//             src={`${APP_BASE_URL}${item.image_url}`}
//             alt={item.name}
//             className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
//           />
//         ) : (
//           <div className="flex h-full items-center justify-center text-slate-400 text-sm">
//             No Image
//           </div>
//         )}
//       </div>

//       {/* Content */}
//       <div className="p-4 space-y-3">
//         <div className="flex items-center justify-between gap-2">
//           <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
//             {item.name}
//           </h3>

//           <span
//             className={`text-xs px-2.5 py-1 rounded-full font-medium
//               ${isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}
//           >
//             {isLowStock ? "Low Stock" : "In Stock"}
//           </span>
//         </div>

//         <div className="flex items-center gap-2 flex-wrap">
//           {item.color && (
//             <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
//               {item.color}
//             </span>
//           )}
//           {item.size && (
//             <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
//               {item.size}
//             </span>
//           )}
//         </div>

//         <div className="pt-2">
//           <p className="text-xs text-slate-400">Stock</p>
//           <p className="text-sm font-semibold text-slate-900">
//             {formatNumber(item.quantity)} {item.unit}
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default function FinishedGoodsUserPage() {
//   const { token } = useAuth();

//   const [items, setItems] = useState([]);

//   // 🔥 Filter toggle
//   const [showFilters, setShowFilters] = useState(false);

//   // 🔥 Filter state
//   const [filters, setFilters] = useState({
//     search: "",
//     color: "",
//     size: "",
//     stock: "all",
//   });

//   const load = useCallback(async () => {
//     const result = await api.getFinishedGoods(token);
//     setItems(result.data || []);
//   }, [token]);

//   useEffect(() => {
//     load().catch(console.error);
//   }, [load]);

//   useDataRefresh(load, "finished-goods-user");

//   // Unique options
//   const colors = [...new Set(items.map((i) => i.color).filter(Boolean))];
//   const sizes = [...new Set(items.map((i) => i.size).filter(Boolean))];

//   // Filter logic
//   const filteredItems = useMemo(() => {
//     return items.filter((item) => {
//       const matchSearch =
//         !filters.search ||
//         item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
//         item.article_code?.toLowerCase().includes(filters.search.toLowerCase());

//       const matchColor = !filters.color || item.color === filters.color;
//       const matchSize = !filters.size || item.size === filters.size;

//       const matchStock =
//         filters.stock === "all"
//           ? true
//           : filters.stock === "low"
//           ? item.quantity < 10
//           : item.quantity >= 10;

//       return matchSearch && matchColor && matchSize && matchStock;
//     });
//   }, [items, filters]);

//   return (
//     <div className="space-y-6">
      
//       {/* HEADER + FILTER BUTTON */}
//       <div className="flex items-center justify-between">
//         <PageHeader
//           eyebrow="Catalog"
//           title="Available finished goods"
//           description="Browse products easily"
//           icon="finishedGoods"
//         />

       
//       </div>
//        <button
//           onClick={() => setShowFilters((prev) => !prev)}
//           className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white shadow-sm hover:shadow-md transition"
//         >
//           <Filter size={18} />
//           <span className="text-sm font-medium">Filters</span>
//         </button>

//       {/* FILTER PANEL */}
//       {showFilters && (
//         <SectionCard title="Filters">
//           <div className="grid gap-3 md:grid-cols-4">

//             {/* Search */}
//             <input
//               type="text"
//               placeholder="Search product..."
//               value={filters.search}
//               onChange={(e) =>
//                 setFilters((f) => ({ ...f, search: e.target.value }))
//               }
//               className="border rounded-xl px-3 py-2"
//             />

//             {/* Color */}
//             <select
//               value={filters.color}
//               onChange={(e) =>
//                 setFilters((f) => ({ ...f, color: e.target.value }))
//               }
//               className="border rounded-xl px-3 py-2"
//             >
//               <option value="">All Colors</option>
//               {colors.map((c) => (
//                 <option key={c}>{c}</option>
//               ))}
//             </select>

//             {/* Size */}
//             <select
//               value={filters.size}
//               onChange={(e) =>
//                 setFilters((f) => ({ ...f, size: e.target.value }))
//               }
//               className="border rounded-xl px-3 py-2"
//             >
//               <option value="">All Sizes</option>
//               {sizes.map((s) => (
//                 <option key={s}>{s}</option>
//               ))}
//             </select>

//             {/* Stock */}
//             <select
//               value={filters.stock}
//               onChange={(e) =>
//                 setFilters((f) => ({ ...f, stock: e.target.value }))
//               }
//               className="border rounded-xl px-3 py-2"
//             >
//               <option value="all">All Stock</option>
//               <option value="available">In Stock</option>
//               <option value="low">Low Stock</option>
//             </select>

//           </div>
//         </SectionCard>
//       )}

//       {/* PRODUCTS */}
//       {filteredItems.length ? (
//         <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
//           {filteredItems.map((item) => (
//             <ProductCard key={item.id} item={item} />
//           ))}
//         </div>
//       ) : (
//         <EmptyState
//           title="No products found"
//           description="Try changing filters or search keyword."
//         />
//       )}
//     </div>
//   );
// }

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

function ProductCard({ variants }) {
  // Select first variant by default
  const [selectedVariant, setSelectedVariant] = useState(variants[0]);
  
  const isLowStock = selectedVariant.quantity < 10;

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white hover:shadow-xl transition-all duration-300 overflow-hidden">
      
      {/* Image */}
      <div className="h-52 bg-slate-100 overflow-hidden relative">
        {selectedVariant.image_url ? (
          <img
            src={`${APP_BASE_URL}${selectedVariant.image_url}`}
            alt={selectedVariant.name}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            No Image
          </div>
        )}
        
        {/* Variant count badge */}
        {variants.length > 1 && (
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-medium text-slate-700">
            {variants.length} colors
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 line-clamp-1">
            {selectedVariant.article_code || selectedVariant.name.split('_').slice(0, -1).join('_')}
          </h3>

          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium
              ${isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}
          >
            {isLowStock ? "Low Stock" : "In Stock"}
          </span>
        </div>

        {/* Color Variants */}
        {variants.length > 1 ? (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 font-medium">Available Colors:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  onMouseEnter={() => setSelectedVariant(variant)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all
                    ${selectedVariant.id === variant.id 
                      ? "bg-indigo-500 text-white font-medium shadow-md scale-105" 
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-105"}`}
                  title={`${variant.color} - ${variant.quantity} ${variant.unit}`}
                >
                  {variant.color}
                </button>
              ))}
            </div>
          </div>
        ) : (
          selectedVariant.color && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
                {selectedVariant.color}
              </span>
            </div>
          )
        )}

        {/* Size */}
        {selectedVariant.size && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
              Size: {selectedVariant.size}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Current Stock</p>
              <p className="text-sm font-semibold text-slate-900">
                {formatNumber(selectedVariant.quantity)} {selectedVariant.unit}
              </p>
            </div>
            {/* {variants.length > 1 && (
              <div className="text-right">
                <p className="text-xs text-slate-400">Total Stock</p>
                <p className="text-sm font-semibold text-slate-600">
                  {formatNumber(variants.reduce((sum, v) => sum + v.quantity, 0))} pairs
                </p>
              </div>
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinishedGoodsUserPage() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);

  // 🔥 Filter toggle
  const [showFilters, setShowFilters] = useState(false);

  // 🔥 Filter state
  const [filters, setFilters] = useState({
    search: "",
    color: "",
    size: "",
    stock: "all",
  });

  const load = useCallback(async () => {
    const result = await api.getFinishedGoods(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "finished-goods-user");

  // Group items by base article code (without color)
  const groupedProducts = useMemo(() => {
    const groups = {};
    
    items.forEach((item) => {
      // Extract base code - assumes format like "OSW_08_Black" or "OSW_08"
      // This groups by article_code if available, otherwise by name without the last part
      const baseCode = item.article_code || item.name.split('_').slice(0, -1).join('_') || item.name;
      
      if (!groups[baseCode]) {
        groups[baseCode] = [];
      }
      groups[baseCode].push(item);
    });
    
    return Object.values(groups);
  }, [items]);

  // Unique options for filters
  const colors = [...new Set(items.map((i) => i.color).filter(Boolean))];
  const sizes = [...new Set(items.map((i) => i.size).filter(Boolean))];

  // Filter logic - now works on grouped products
  const filteredProducts = useMemo(() => {
    return groupedProducts.filter((variants) => {
      // Check if any variant in the group matches the filters
      return variants.some((item) => {
        const matchSearch =
          !filters.search ||
          item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.article_code?.toLowerCase().includes(filters.search.toLowerCase());

        const matchColor = !filters.color || item.color === filters.color;
        const matchSize = !filters.size || item.size === filters.size;

        const matchStock =
          filters.stock === "all"
            ? true
            : filters.stock === "low"
            ? item.quantity < 10
            : item.quantity >= 10;

        return matchSearch && matchColor && matchSize && matchStock;
      });
    }).map((variants) => {
      // If color filter is active, only include matching variants
      if (filters.color) {
        return variants.filter((v) => v.color === filters.color);
      }
      return variants;
    });
  }, [groupedProducts, filters]);

  return (
    <div className="space-y-6">
      
      {/* HEADER + FILTER BUTTON */}
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Catalog"
          title="Available finished goods"
          description="Browse products easily"
          icon="finishedGoods"
        />
      </div>
      <div className="flex items-center justify-end">
        <button
        onClick={() => setShowFilters((prev) => !prev)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white shadow-sm hover:shadow-md transition"
      >
        <Filter size={18} />
        <span className="text-sm font-medium">Filters</span>
        {(filters.search || filters.color || filters.size || filters.stock !== "all") && (
          <span className="ml-1 px-2 py-0.5 bg-indigo-500 text-white text-xs rounded-full">
            Active
          </span>
        )}
      </button>
      </div>
      

      {/* FILTER PANEL */}
      {showFilters && (
        <SectionCard title="Filters">
          <div className="grid gap-3 md:grid-cols-4">

            {/* Search */}
            <input
              type="text"
              placeholder="Search product..."
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            />

            {/* Color */}
            <select
              value={filters.color}
              onChange={(e) =>
                setFilters((f) => ({ ...f, color: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="">All Colors</option>
              {colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            {/* Size */}
            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((f) => ({ ...f, size: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="">All Sizes</option>
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            {/* Stock */}
            <select
              value={filters.stock}
              onChange={(e) =>
                setFilters((f) => ({ ...f, stock: e.target.value }))
              }
              className="border rounded-xl px-3 py-2"
            >
              <option value="all">All Stock</option>
              <option value="available">In Stock</option>
              <option value="low">Low Stock</option>
            </select>

          </div>
          
          {/* Clear filters button */}
          {(filters.search || filters.color || filters.size || filters.stock !== "all") && (
            <button
              onClick={() => setFilters({ search: "", color: "", size: "", stock: "all" })}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Clear all filters
            </button>
          )}
        </SectionCard>
      )}

      {/* PRODUCTS */}
      {filteredProducts.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((variants, index) => (
            <ProductCard key={variants[0].id || index} variants={variants} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No products found"
          description="Try changing filters or search keyword."
        />
      )}
    </div>
  );
}