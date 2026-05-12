// // import { useEffect, useState } from "react";
// // import { useNavigate } from "react-router-dom";

// // import {
// //   ShoppingCart,
// //   Plus,
// //   Minus,
// //   Package,
// //   CheckCircle2,
// //   Eye,
// //   Trash2,
// //   AlertCircle,
// //   X,
// //   ArrowLeft,
// // } from "lucide-react";

// // import PageHeader from "../components/PageHeader";
// // import SectionCard from "../components/SectionCard";
// // import DataTable from "../components/DataTable";
// // import StatusBadge from "../components/StatusBadge";

// // import { api, APP_BASE_URL } from "../services/api";
// // import { useAuth } from "../context/AuthContext";
// // import { useToast } from "../context/ToastContext";
// // import { formatNumber } from "../utils/format";

// // export default function UserOrderPage() {
// //   const { token } = useAuth();
// //   const { showToast } = useToast();
// //   const navigate = useNavigate();

// //   const [cart, setCart] = useState([]);
// //   const [cartLoaded, setCartLoaded] = useState(false);
// //   const [submitting, setSubmitting] = useState(false);

// //   // FORM FIELDS
// //   const [customerName, setCustomerName] = useState("");
// //   const [customerPhone, setCustomerPhone] = useState("");
// //   const [customerAddress, setCustomerAddress] = useState("");
// //   const [panNumber, setPanNumber] = useState("");
// //   const [transportName, setTransportName] = useState("");
// //   const [notes, setNotes] = useState("");

// //   const [errors, setErrors] = useState({});
// //   const [orders, setOrders] = useState([]);
// //   const [loadingOrders, setLoadingOrders] = useState(false);
// //   const statusTone = {
// //   PENDING: "warning",
// //   CONFIRMED: "info",
// //   PACKED: "neutral",
// //   DELIVERED: "success",
// //   CANCELLED: "danger",
// // };
// // const renderOrderItems = (order) => (
// //     <div className="space-y-1">
// //       {order.items.map((item) => (
// //         <p key={item.id}>
// //           {item.product_name} - {formatNumber(item.qty_ordered)} {item.unit}
// //         </p>
// //       ))}
// //     </div>
// //   );
// // // format items
// // const renderItems = (order) => {
// //   return (
// //     <div className="space-y-1 text-xs">
// //       {order.product_names?.length ? (
// //         order.product_names.map((name, i) => (
// //           <p key={i}>• {name}</p>
// //         ))
// //       ) : (
// //         <span>-</span>
// //       )}
// //     </div>
// //   );
// // };
// //   // LOAD CART
// //   useEffect(() => {
// //     try {
// //       const savedCart = localStorage.getItem("userCart");

// //       console.log("Saved Cart:", savedCart);

// //       if (savedCart) {
// //         const parsedCart = JSON.parse(savedCart);

// //         const updatedCart = parsedCart.map((item) => {
// //           const cartonsPerBox = Number(
// //             item.product?.inner_boxes_per_outer_box || 0
// //           );

// //           return {
// //             ...item,
// //             orderBy:
// //               item.orderBy ||
// //               (cartonsPerBox > 0 ? "cartons" : "pairs"),
// //             qty_ordered: Number(item.qty_ordered || 1),
// //           };
// //         });

// //         setCart(updatedCart);
// //       }
// //     } catch (err) {
// //       console.error("Failed to parse cart:", err);
// //     } finally {
// //       setCartLoaded(true);
// //     }
// //   }, []);

// //   // SAVE CART
// //   useEffect(() => {
// //     if (!cartLoaded) return;

// //     localStorage.setItem("userCart", JSON.stringify(cart));
// //   }, [cart, cartLoaded]);

// //   // TOGGLE ORDER TYPE
// //   const toggleOrderBy = (id) => {
// //     setCart((prev) =>
// //       prev.map((item) => {
// //         if (item.finished_good_id !== id) return item;

// //         const newOrderBy =
// //           item.orderBy === "cartons" ? "pairs" : "cartons";

// //         return {
// //           ...item,
// //           orderBy: newOrderBy,
// //           qty_ordered: 1,
// //         };
// //       })
// //     );
// //   };

// //   const MAX_PAIRS_LIMIT = 450;

// // const updateQty = (id, qty) => {
// //   if (qty < 1) {
// //     removeFromCart(id);
// //     return;
// //   }
// // };
// //   const getTotalPairs = (cart) => {
// //   return cart.reduce((sum, item) => {
// //     const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);

// //     const pairs =
// //       item.orderBy === "cartons" && cartonsPerBox > 0
// //         ? item.qty_ordered * cartonsPerBox
// //         : item.qty_ordered;

// //     return sum + Number(pairs || 0);
// //   }, 0);
// // };

// //   // convert current qty → pairs
// //   const qtyInPairs =
// //     item.orderBy === "cartons" && cartonsPerBox > 0
// //       ? qty * cartonsPerBox
// //       : qty;

// //   // STOCK LIMIT (from product)
// //   const stockLimit =
// //     item.orderBy === "cartons" && cartonsPerBox > 0
// //       ? Math.floor(Number(item.product.quantity || 0) / cartonsPerBox)
// //       : Number(item.product.quantity || 0);

// //   // GLOBAL LIMIT (450 pairs)
// //   const maxPairsAllowed = Math.min(stockLimit, MAX_PAIRS_LIMIT);

// //   if (qtyInPairs > MAX_PAIRS_LIMIT) {
// //     showToast({
// //       title: "Limit exceeded",
// //       message: `You cannot order more than ${MAX_PAIRS_LIMIT} pairs.`,
// //       tone: "error",
// //     });
// //     return;
// //   }

// //   if (qty > stockLimit) {
// //     showToast({
// //       title: "Quantity unavailable",
// //       message: `Maximum available is ${formatNumber(stockLimit)} ${item.orderBy}`,
// //       tone: "error",
// //     });
// //     return;
// //   }

// //   setCart((prev) =>
// //     prev.map((c) =>
// //       c.finished_good_id === id
// //         ? {
// //             ...c,
// //             qty_ordered: Number(qty),
// //           }
// //         : c
// //     )
// //   );
// // };

// //   useEffect(() => {
// //   const fetchOrders = async () => {
// //     try {
// //       setLoadingOrders(true);

// //       const res = await api.getOrders(token); 
// //       // OR if your API name is different, adjust it

// //       setOrders(res.data || []);
// //     } catch (err) {
// //       console.error("Failed to fetch orders:", err);
// //       showToast({
// //         title: "Orders failed to load",
// //         message: err.message || "Failed to load orders",
// //         tone: "error",
// //       });
// //     } finally {
// //       setLoadingOrders(false);
// //     }
// //   };

// //   if (token) fetchOrders();
// // }, [token]);

// //   // REMOVE ITEM
// //   const removeFromCart = (id) => {
// //     const updatedCart = cart.filter(
// //       (item) => item.finished_good_id !== id
// //     );

// //     setCart(updatedCart);

// //     localStorage.setItem("userCart", JSON.stringify(updatedCart));
// //   };

// //   // CLEAR CART
// //   const clearCart = () => {
// //     if (window.confirm("Are you sure you want to clear the cart?")) {
// //       setCart([]);
// //       localStorage.removeItem("userCart");
// //     }
// //   };

// //   // VALIDATION
// //   const validateForm = () => {
// //     const newErrors = {};

// //     if (!customerName.trim()) {
// //       newErrors.customerName = "Customer name is required";
// //     }
// //     if (!customerPhone.trim()) {
// //       newErrors.customerPhone = "Customer phone is required";
// //     }
// //     if (!customerAddress.trim()) {
// //       newErrors.customerAddress = "Customer address is required"; 
// //     }
// //     if (!panNumber.trim()) {
// //       newErrors.panNumber = "PAN number is required";
// //     }
// //     if (!transportName.trim()) {
// //       newErrors.transportName = "Transport name is required";
// //     }

// //     if (!cart.length) {
// //       newErrors.cart = "Cart is empty";
// //     }

// //     setErrors(newErrors);

// //     return Object.keys(newErrors).length === 0;
// //   };

// //   // SUBMIT ORDER
// //   const submitOrder = async () => {
// //     if (!validateForm()) {
// //       showToast({
// //         title: "Please fix the errors",
// //         message: "Check the highlighted fields and try again.",
// //         tone: "error",
// //       });
// //       return;
// //     }

// //     try {
// //       setSubmitting(true);

// //       const items = cart.map((item) => {
// //         const cartonsPerBox = Number(
// //           item.product?.inner_boxes_per_outer_box || 0
// //         );

// //         let qtyOrdered = Number(item.qty_ordered || 1);

// //         // CONVERT CARTONS TO PAIRS
// //         if (item.orderBy === "cartons" && cartonsPerBox > 0) {
// //           qtyOrdered = qtyOrdered * cartonsPerBox;
// //         }

// //         return {
// //           finished_good_id: item.finished_good_id,
// //           qty_ordered: qtyOrdered,
// //         };
// //       });

// //       const payload = {
// //         customer_name: customerName.trim(),
// //         customer_phone: customerPhone.trim(),
// //         customer_address: customerAddress.trim(),
// //         pan_number: panNumber.trim(),
// //         transport_name: transportName.trim(),
// //         notes: notes.trim(),
// //         items,
// //       };

// //       console.log("ORDER PAYLOAD:", payload);

// //       const res = await api.createOrder(payload, token);

// //       showToast({
// //         title: "Order placed",
// //         message: res.message || "Order placed successfully!",
// //         tone: "success",
// //       });

// //       // RESET
// //       setCart([]);
// //       localStorage.removeItem("userCart");

// //       setCustomerName("");
// //       setCustomerPhone("");
// //       setCustomerAddress("");
// //       setPanNumber("");
// //       setTransportName("");
// //       setNotes("");

// //       setErrors({});

// //       setTimeout(() => {
// //         navigate("/order-customer");
// //       }, 1500);
// //     } catch (err) {
// //       console.error(err);

// //       if (err.response?.data?.shortages) {
// //         const shortages = err.response.data.shortages;

// //         const shortageMsg = shortages
// //           .map(
// //             (s) =>
// //               `${s.product_name}: need ${s.requested}, only ${s.available} available`
// //           )
// //           .join("; ");

// //         showToast({
// //           title: "Insufficient stock",
// //           message: shortageMsg,
// //           tone: "error",
// //         });
// //       } else {
// //         showToast({
// //           title: "Order failed",
// //           message:
// //             err.data?.message ||
// //             err.response?.data?.message ||
// //             err.message ||
// //             "Failed to place order",
// //           tone: "error",
// //         });
// //       }
// //     } finally {
// //       setSubmitting(false);
// //     }
// //   };

// //   const totalItems = cart.reduce(
// //     (sum, item) => sum + Number(item.qty_ordered || 0),
// //     0
// //   );
// //   // delete order function
// //   const deleteOrder = async (id) => {
// //     if (!window.confirm("Are you sure you want to delete this order?")) {
// //       return;
// //     }

// //     try {
// //       await api.deleteOrder(id, token);
// //       showToast({
// //         title: "Order deleted",
// //         message: "The order was removed successfully.",
// //         tone: "success",
// //       });
// //       setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(id)));
// //     } catch (err) {
// //       console.error("Failed to delete order:", err);

// //       if (err.status === 404) {
// //         showToast({
// //           title: "Order already removed",
// //           message: err.data?.message || "This order no longer exists on the server.",
// //           tone: "info",
// //         });
// //         setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(id)));
// //         return;
// //       }

// //       if (err.status === 403) {
// //         showToast({
// //           title: "Delete not allowed",
// //           message: "You don't have permission to delete this order.",
// //           tone: "error",
// //         });
// //         return;
// //       }

// //       if (err.status === 400) {
// //         showToast({
// //           title: "Order cannot be deleted",
// //           message: err.data?.message || "Cannot delete this order.",
// //           tone: "error",
// //         });
// //         return;
// //       }

// //       showToast({
// //         title: "Delete failed",
// //         message: err.data?.message || err.message || "Failed to delete order.",
// //         tone: "error",
// //       });
// //     }
// //   };
// //   // PAGINATION
// // const [currentPage, setCurrentPage] = useState(1);
// // const ordersPerPage = 10;

// // const totalPages = Math.ceil(orders.length / ordersPerPage);

// // const startIndex = (currentPage - 1) * ordersPerPage;
// // const endIndex = startIndex + ordersPerPage;

// // const paginatedOrders = orders.slice(startIndex, endIndex);

// // // PAGE CHANGE
// // const goToPage = (page) => {
// //   if (page < 1 || page > totalPages) return;
// //   setCurrentPage(page);
// // };

// // // PAGE NUMBERS
// // const renderPageNumbers = () => {
// //   const pages = [];

// //   if (totalPages <= 7) {
// //     for (let i = 1; i <= totalPages; i++) {
// //       pages.push(i);
// //     }
// //   } else {
// //     if (currentPage <= 4) {
// //       pages.push(1, 2, 3, 4, 5, "...", totalPages);
// //     } else if (currentPage >= totalPages - 3) {
// //       pages.push(
// //         1,
// //         "...",
// //         totalPages - 4,
// //         totalPages - 3,
// //         totalPages - 2,
// //         totalPages - 1,
// //         totalPages
// //       );
// //     } else {
// //       pages.push(
// //         1,
// //         "...",
// //         currentPage - 1,
// //         currentPage,
// //         currentPage + 1,
// //         "...",
// //         totalPages
// //       );
// //     }
// //   }

// //   return pages;
// // };
// // const MAX_PAIRS_LIMIT = 450;
// //   return (
// //     <div className="space-y-6 pb-8">
// //       <PageHeader
// //         title="Review & Place Order"
// //         subtitle="Complete your order details"
// //       />

// //       {/* BACK */}
// //       <button
// //         onClick={() => navigate("/finished-goods")}
// //         className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
// //       >
// //         <ArrowLeft size={18} />
// //         Continue Shopping
// //       </button>

// //       {/* INFO */}
// //       <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
// //         <AlertCircle
// //           className="text-indigo-600 flex-shrink-0 mt-0.5"
// //           size={20}
// //         />

// //         <div className="text-sm text-indigo-900">
// //           <strong>Important:</strong> Your order will be marked
// //           as <strong>DELIVERED</strong> and stock will be
// //           deducted immediately after submission.
// //         </div>
// //       </div>

// //       {/* CART */}
// //       <SectionCard
// //         title={
// //           <div className="flex items-center gap-2">
// //             <ShoppingCart size={20} />
// //             Cart Summary ({totalItems}{" "}
// //             {totalItems === 1 ? "item" : "items"})
// //           </div>
// //         }
// //         actions={
// //           cart.length > 0 && (
// //             <button
// //               onClick={clearCart}
// //               className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1"
// //             >
// //               <Trash2 size={16} />
// //               Clear Cart
// //             </button>
// //           )
// //         }
// //       >
// //         {errors.cart && (
// //           <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
// //             <AlertCircle
// //               className="text-red-500 flex-shrink-0"
// //               size={20}
// //             />

// //             <p className="text-red-700 text-sm">
// //               {errors.cart}
// //             </p>
// //           </div>
// //         )}

// //         {!cart.length ? (
// //           <div className="py-16 text-center text-slate-500">
// //             <ShoppingCart
// //               size={48}
// //               className="mx-auto mb-4 text-slate-300"
// //             />

// //             <p className="text-lg font-semibold">
// //               Your cart is empty
// //             </p>

// //             <p className="text-sm mt-1 mb-4">
// //               Add products to get started
// //             </p>

// //             <button
// //               onClick={() => navigate("/finished-goods")}
// //               className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
// //             >
// //               Browse Products
// //             </button>
// //           </div>
// //         ) : (
// //           <div className="space-y-3">
// //             {cart.map((item) => {
// //               const cartonsPerBox = Number(
// //                 item.product?.inner_boxes_per_outer_box || 0
// //               );

// //               const hasCartons = cartonsPerBox > 0;

// //               const availableCartons = hasCartons
// //                 ? Math.floor(
// //                     Number(item.product.quantity || 0) /
// //                       cartonsPerBox
// //                   )
// //                 : 0;

// //               const maxQty =
// //                 item.orderBy === "cartons"
// //                   ? availableCartons
// //                   : Number(item.product.quantity || 0);

// //               const actualPairs =
// //                 item.orderBy === "cartons" && hasCartons
// //                   ? Number(item.qty_ordered) * cartonsPerBox
// //                   : Number(item.qty_ordered);

// //               return (
// //                 <div
// //                   key={item.finished_good_id}
// //                   className="border border-slate-200 rounded-xl p-4 bg-white"
// //                 >
// //                   <div className="flex gap-4">
// //                     {/* IMAGE */}
// //                     <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
// //                       {item.product.image_url ? (
// //                         <img
// //                           src={`${APP_BASE_URL}${item.product.image_url}`}
// //                           alt={item.product.name}
// //                           className="w-full h-full object-cover"
// //                         />
// //                       ) : (
// //                         <div className="w-full h-full flex items-center justify-center text-slate-400">
// //                           <Package size={28} />
// //                         </div>
// //                       )}
// //                     </div>

// //                     {/* DETAILS */}
// //                     <div className="flex-1 space-y-2">
// //                       <h3 className="font-bold text-slate-900">
// //                         {item.product.article_code ||
// //                           item.product.name}
// //                       </h3>

// //                       {/* META */}
// //                       <div className="flex flex-wrap gap-2 text-xs text-slate-600">
// //                         {item.product.color && (
// //                           <span className="px-2 py-1 bg-slate-100 rounded">
// //                             Color: {item.product.color}
// //                           </span>
// //                         )}

// //                         {item.product.size && (
// //                           <span className="px-2 py-1 bg-slate-100 rounded">
// //                             Size: {item.product.size}
// //                           </span>
// //                         )}
// //                       </div>

// //                       {/* STOCK */}
// //                       {/* <div className="flex gap-4 text-xs text-slate-500">
// //                         <span>
// //                           Available:{" "}
// //                           {formatNumber(
// //                             Number(item.product.quantity || 0)
// //                           )}{" "}
// //                           pairs
// //                         </span>

// //                         {hasCartons && (
// //                           <span>
// //                             Cartons:{" "}
// //                             {formatNumber(availableCartons)}
// //                           </span>
// //                         )}
// //                       </div> */}

// //                       {/* TOGGLE */}
// //                       {hasCartons && (
// //                         <button
// //                           onClick={() =>
// //                             toggleOrderBy(
// //                               item.finished_good_id
// //                             )
// //                           }
// //                           className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
// //                           ${
// //                             item.orderBy === "cartons"
// //                               ? "bg-indigo-500 text-white"
// //                               : "bg-slate-100 text-slate-700 hover:bg-slate-200"
// //                           }`}
// //                         >
// //                           {item.orderBy === "cartons"
// //                             ? "Ordering by Cartons"
// //                             : "Switch to Cartons"}
// //                         </button>
// //                       )}

// //                       {/* QTY */}
// //                       <div className="flex items-center justify-between pt-2">
// //                         <div className="flex items-center gap-3">
// //                           <button
// //                             className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition"
// //                             onClick={() =>
// //                               updateQty(
// //                                 item.finished_good_id,
// //                                 Number(item.qty_ordered) - 1
// //                               )
// //                             }
// //                           >
// //                             <Minus size={16} />
// //                           </button>

// //                           <div className="text-center">
// //                             <div className="font-bold text-lg">
// //                               {item.qty_ordered}
// //                             </div>

// //                             <div className="text-[10px] text-slate-500">
// //                               {item.orderBy}
// //                             </div>
// //                           </div>

// //                           <button
// //                             className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition disabled:opacity-50"
// //                             onClick={() =>
// //                               updateQty(
// //                                 item.finished_good_id,
// //                                 Number(item.qty_ordered) + 1
// //                               )
// //                             }
// //                             disabled={
// //   getTotalPairs(cart) >= MAX_PAIRS_LIMIT ||
// //   Number(item.qty_ordered) >= maxQty
// // }
// //                           >
// //                             <Plus size={16} />
// //                           </button>
// //                         </div>

// //                         {/* PAIRS */}
// //                         {item.orderBy === "cartons" &&
// //                           hasCartons && (
// //                             <div className="text-sm text-slate-600">
// //                               ={" "}
// //                               <span className="font-bold text-indigo-600">
// //                                 {formatNumber(actualPairs)}
// //                               </span>{" "}
// //                               pairs
// //                             </div>
// //                           )}

// //                         {/* REMOVE */}
// //                         <button
// //                           className="w-9 h-9 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 flex items-center justify-center transition"
// //                           onClick={() =>
// //                             removeFromCart(
// //                               item.finished_good_id
// //                             )
// //                           }
// //                         >
// //                           <X size={16} />
// //                         </button>
// //                       </div>
// //                     </div>
// //                   </div>
// //                 </div>
// //               );
// //             })}
// //           </div>
// //         )}
// //       </SectionCard>

// //       {/* CUSTOMER DETAILS */}
// //       {cart.length > 0 && (
// //         <SectionCard title="Customer Details">
// //           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
// //             {/* CUSTOMER NAME */}
// //             <div className="w-full md:col-span-2">
// //               <label className="block text-sm font-medium text-slate-700 mb-2">
// //                 Customer Name{" "}
// //                 <span className="text-red-500">*</span>
// //               </label>

// //               <input
// //                 className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent
// //                 ${
// //                   errors.customerName
// //                     ? "border-red-500"
// //                     : "border-slate-300"
// //                 }`}
// //                 placeholder="Enter customer name"
// //                 value={customerName}
// //                 onChange={(e) => {
// //                   setCustomerName(e.target.value);

// //                   setErrors((prev) => ({
// //                     ...prev,
// //                     customerName: "",
// //                   }));
// //                 }}
// //               />

// //               {errors.customerName && (
// //                 <p className="text-red-500 text-sm mt-1">
// //                   {errors.customerName}
// //                 </p>
// //               )}
// //             </div>

         
// // <div>
// //   <label className="block text-sm font-medium text-slate-700 mb-2">
// //     Phone Number
// //   </label>

// //   <input
// //     type="tel"
// //     maxLength={10}
// //     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
// //       errors.customerPhone ? "border-red-500" : "border-slate-300"
// //     }`}
// //     placeholder="Enter 10 digit phone number"
// //     value={customerPhone}
// //     onChange={(e) => {
// //       const value = e.target.value.replace(/\D/g, "").slice(0, 10);

// //       setCustomerPhone(value);

// //       setErrors((prev) => ({
// //         ...prev,
// //         customerPhone: "",
// //       }));
// //     }}
// //   />

// //   {errors.customerPhone && (
// //     <p className="text-red-500 text-sm mt-1">
// //       {errors.customerPhone}
// //     </p>
// //   )}
// // </div>


// // <div>
// //   <label className="block text-sm font-medium text-slate-700 mb-2">
// //     PAN Number
// //   </label>

// //   <input
// //     type="text"
// //     maxLength={9}
// //     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
// //       errors.panNumber ? "border-red-500" : "border-slate-300"
// //     }`}
// //     placeholder="Enter 9 digit PAN number"
// //     value={panNumber}
// //     onChange={(e) => {
// //       const value = e.target.value.replace(/\D/g, "").slice(0, 9);

// //       setPanNumber(value);

// //       setErrors((prev) => ({
// //         ...prev,
// //         panNumber: "",
// //       }));
// //     }}
// //   />

// //   {errors.panNumber && (
// //     <p className="text-red-500 text-sm mt-1">
// //       {errors.panNumber}
// //     </p>
// //   )}
// // </div>


// // <div className="md:col-span-2">
// //   <label className="block text-sm font-medium text-slate-700 mb-2">
// //     Delivery Address
// //   </label>

// //   <input
// //     type="text"
// //     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
// //       errors.customerAddress ? "border-red-500" : "border-slate-300"
// //     }`}
// //     placeholder="Enter delivery address"
// //     value={customerAddress}
// //     onChange={(e) => {
// //       const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");

// //       setCustomerAddress(value);

// //       setErrors((prev) => ({
// //         ...prev,
// //         customerAddress: "",
// //       }));
// //     }}
// //   />

// //   {errors.customerAddress && (
// //     <p className="text-red-500 text-sm mt-1">
// //       {errors.customerAddress}
// //     </p>
// //   )}
// // </div>
// //             {/* TRANSPORT */}
// //             <div>
// //               <label className="block text-sm font-medium text-slate-700 mb-2">
// //                 Transport Name
// //               </label>

// //               <input
// //                 className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
// //                   errors.transportName ? "border-red-500" : "border-slate-300"
// //                 }`}
// //                 placeholder="Enter transport company"
// //                 value={transportName}
// //                 onChange={(e) => {
// //                   setTransportName(e.target.value);
// //                   setErrors((prev) => ({ ...prev, transportName: "" }));
// //                 }}
// //               />
// //               {errors.transportName && (
// //                 <p className="text-red-500 text-sm mt-1">
// //                   {errors.transportName}
// //                 </p>
// //               )}
// //             </div>

// //             {/* NOTES */}
// //             <div className="md:col-span-2">
// //               <label className="block text-sm font-medium text-slate-700 mb-2">
// //                 Order Notes
// //               </label>

// //               <textarea
// //                 className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
// //                 placeholder="Any special instructions"
// //                 rows={3}
// //                 value={notes}
// //                 onChange={(e) => setNotes(e.target.value)}
// //               />
// //             </div>
// //           </div>
// //         </SectionCard>
// //       )}

// //       {/* table */}
// //       <DataTable
// //   columns={[
// //    {
// //       key: "id",
// //       label: "S.No",
      

// //    },
// //     {
// //       key: "customer_name",
// //       label: "Customer",
// //     },
// //     {
// //       key: "customer_phone",
// //       label: "Contact",
// //     },
// //     {
// //       key: "customer_address",
// //       label: "Address",
// //     },
// //     {
// //       key: "transport_name",
// //       label: "Transport",
// //     },
// //     {
// //       key: "notes",
// //       label: "Notes",
// //       render: (row) => row.notes || "-",
// //     },
// //     {
// //       key: "status",
// //       label: "Status",
// //       render: (row) => (
// //         <StatusBadge tone={statusTone[row.status]}>
// //           {row.status}
// //         </StatusBadge>
// //       ),
// //     },
// //     {
// //       key: "items",
// //       label: "Items",
// //       render: renderOrderItems,
// //     },
// //     {
// //       key: "created_at",
// //       label: "Date",
// //       render: (row) =>
// //         new Date(row.created_at).toLocaleString(),
// //     },
    
// //   ]}
// //   rows={paginatedOrders}
// // />

      

// //       {/* BUTTONS */}
// //       {cart.length > 0 && (
// //         <div className="flex justify-end gap-3">
// //           <button
// //             onClick={() => navigate("/finished-goods")}
// //             className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
// //           >
// //             Add More Products
// //           </button>

// //           <button
// //             onClick={submitOrder}
// //             disabled={submitting}
// //             className="px-8 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[180px] justify-center"
// //           >
// //             {submitting ? (
// //               <>
// //                 <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
// //                 Submitting...
// //               </>
// //             ) : (
// //               <>
// //                 <CheckCircle2 size={20} />
// //                 Place Order
// //               </>
// //             )}
// //           </button>
// //         </div>
// //       )}
      
// //     </div>
// //   );
// // }
// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import {
//   ShoppingCart,
//   Plus,
//   Minus,
//   Package,
//   CheckCircle2,
//   Eye,
//   Trash2,
//   AlertCircle,
//   X,
//   ArrowLeft,
// } from "lucide-react";

// import PageHeader from "../components/PageHeader";
// import SectionCard from "../components/SectionCard";
// import DataTable from "../components/DataTable";
// import StatusBadge from "../components/StatusBadge";

// import { api, APP_BASE_URL } from "../services/api";
// import { useAuth } from "../context/AuthContext";
// import { useToast } from "../context/ToastContext";
// import { formatNumber } from "../utils/format";

// export default function UserOrderPage() {
//   const { token } = useAuth();
//   const { showToast } = useToast();
//   const navigate = useNavigate();

//   const [cart, setCart] = useState([]);
//   const [cartLoaded, setCartLoaded] = useState(false);
//   const [submitting, setSubmitting] = useState(false);

//   // FORM FIELDS
//   const [customerName, setCustomerName] = useState("");
//   const [customerPhone, setCustomerPhone] = useState("");
//   const [customerAddress, setCustomerAddress] = useState("");
//   const [panNumber, setPanNumber] = useState("");
//   const [transportName, setTransportName] = useState("");
//   const [notes, setNotes] = useState("");

//   const [errors, setErrors] = useState({});
//   const [orders, setOrders] = useState([]);
//   const [loadingOrders, setLoadingOrders] = useState(false);

//   const MAX_PAIRS_LIMIT = 450;

//   const statusTone = {
//     PENDING: "warning",
//     CONFIRMED: "info",
//     PACKED: "neutral",
//     DELIVERED: "success",
//     CANCELLED: "danger",
//   };

//   // ---------------- CART HELPERS ----------------
//   const getTotalPairs = (cartData) => {
//     return cartData.reduce((sum, item) => {
//       const cartonsPerBox = Number(
//         item.product?.inner_boxes_per_outer_box || 0
//       );

//       const pairs =
//         item.orderBy === "cartons" && cartonsPerBox > 0
//           ? item.qty_ordered * cartonsPerBox
//           : item.qty_ordered;

//       return sum + Number(pairs || 0);
//     }, 0);
//   };

//   // ---------------- LOAD CART ----------------
//   useEffect(() => {
//     try {
//       const savedCart = localStorage.getItem("userCart");

//       if (savedCart) {
//         const parsedCart = JSON.parse(savedCart);

//         const updatedCart = parsedCart.map((item) => {
//           const cartonsPerBox = Number(
//             item.product?.inner_boxes_per_outer_box || 0
//           );

//           return {
//             ...item,
//             orderBy:
//               item.orderBy ||
//               (cartonsPerBox > 0 ? "cartons" : "pairs"),
//             qty_ordered: Number(item.qty_ordered || 1),
//           };
//         });

//         setCart(updatedCart);
//       }
//     } catch (err) {
//       console.error("Failed to parse cart:", err);
//     } finally {
//       setCartLoaded(true);
//     }
//   }, []);

//   // SAVE CART
//   useEffect(() => {
//     if (!cartLoaded) return;
//     localStorage.setItem("userCart", JSON.stringify(cart));
//   }, [cart, cartLoaded]);

//   // ---------------- TOGGLE ORDER TYPE ----------------
//   const toggleOrderBy = (id) => {
//     setCart((prev) =>
//       prev.map((item) => {
//         if (item.finished_good_id !== id) return item;

//         return {
//           ...item,
//           orderBy: item.orderBy === "cartons" ? "pairs" : "cartons",
//           qty_ordered: 1,
//         };
//       })
//     );
//   };

//   // ---------------- UPDATE QTY (FIXED) ----------------
//   const updateQty = (id, qty) => {
//     if (qty < 1) {
//       removeFromCart(id);
//       return;
//     }

//     const item = cart.find((c) => c.finished_good_id === id);
//     if (!item) return;

//     const cartonsPerBox = Number(
//       item.product?.inner_boxes_per_outer_box || 0
//     );

//     const newCart = cart.map((c) =>
//       c.finished_good_id === id
//         ? { ...c, qty_ordered: qty }
//         : c
//     );

//     const totalPairs = getTotalPairs(newCart);

//     if (totalPairs > MAX_PAIRS_LIMIT) {
//       showToast({
//         title: "Limit exceeded",
//         message: `Total order cannot exceed ${MAX_PAIRS_LIMIT} pairs`,
//         tone: "error",
//       });
//       return;
//     }

//     const stockLimit =
//       item.orderBy === "cartons" && cartonsPerBox > 0
//         ? Math.floor(Number(item.product.quantity || 0) / cartonsPerBox)
//         : Number(item.product.quantity || 0);

//     if (qty > stockLimit) {
//       showToast({
//         title: "Stock limit",
//         message: `Max available is ${stockLimit} ${item.orderBy}`,
//         tone: "error",
//       });
//       return;
//     }

//     setCart(newCart);
//   };

//   // ---------------- REMOVE CART ITEM ----------------
//   const removeFromCart = (id) => {
//     const updatedCart = cart.filter(
//       (item) => item.finished_good_id !== id
//     );

//     setCart(updatedCart);
//     localStorage.setItem("userCart", JSON.stringify(updatedCart));
//   };

//   // ---------------- CLEAR CART ----------------
//   const clearCart = () => {
//     if (window.confirm("Are you sure you want to clear the cart?")) {
//       setCart([]);
//       localStorage.removeItem("userCart");
//     }
//   };

//   // ---------------- FETCH ORDERS ----------------
//   useEffect(() => {
//     const fetchOrders = async () => {
//       try {
//         setLoadingOrders(true);
//         const res = await api.getOrders(token);
//         setOrders(res.data || []);
//       } catch (err) {
//         showToast({
//           title: "Orders failed to load",
//           message: err.message || "Failed to load orders",
//           tone: "error",
//         });
//       } finally {
//         setLoadingOrders(false);
//       }
//     };

//     if (token) fetchOrders();
//   }, [token]);

//   // ---------------- VALIDATION ----------------
//   const validateForm = () => {
//     const newErrors = {};

//     if (!customerName.trim())
//       newErrors.customerName = "Customer name is required";
//     // if (!customerPhone.trim())
//     //   newErrors.customerPhone = "Customer phone is required";
//     if (!customerAddress.trim())
//       newErrors.customerAddress = "Customer address is required";
//     // if (!panNumber.trim())
//     //   newErrors.panNumber = "PAN number is required";
//     // if (!transportName.trim())
//     //   newErrors.transportName = "Transport name is required";
//     // if (!cart.length)
//     //   newErrors.cart = "Cart is empty";

//     setErrors(newErrors);
//     return Object.keys(newErrors).length === 0;
//   };

//   // ---------------- SUBMIT ORDER ----------------
//   const submitOrder = async () => {
//     if (!validateForm()) {
//       showToast({
//         title: "Please fix errors",
//         message: "Check form fields",
//         tone: "error",
//       });
//       return;
//     }

//     try {
//       setSubmitting(true);

//       const items = cart.map((item) => {
//         const cartonsPerBox = Number(
//           item.product?.inner_boxes_per_outer_box || 0
//         );

//         let qtyOrdered = Number(item.qty_ordered || 1);

//         if (item.orderBy === "cartons" && cartonsPerBox > 0) {
//           qtyOrdered = qtyOrdered * cartonsPerBox;
//         }

//         return {
//           finished_good_id: item.finished_good_id,
//           qty_ordered: qtyOrdered,
//         };
//       });

//       const payload = {
//         customer_name: customerName.trim(),
//         customer_phone: customerPhone.trim() || "0000000000",
//         customer_address: customerAddress.trim() ,
//         pan_number: panNumber.trim() || "000000000",
//         transport_name: transportName.trim() || "N/A",
//         notes: notes.trim(),
//         items,
//       };

//       await api.createOrder(payload, token);

//       showToast({
//         title: "Order placed",
//         message: "Success",
//         tone: "success",
//       });

//       setCart([]);
//       localStorage.removeItem("userCart");
//     } catch (err) {
//       showToast({
//         title: "Order failed",
//         message: err.message || "Error",
//         tone: "error",
//       });
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const totalItems = cart.reduce(
//     (sum, item) => sum + Number(item.qty_ordered || 0),
//     0
//   );

//   const renderOrderItems = (order) => (
//   <div className="space-y-1 text-xs">
//     {order.items?.length ? (
//       order.items.map((item) => (
//         <p key={item.id}>
//           {item.product_name} - {formatNumber(item.qty_ordered)}
//         </p>
//       ))
//     ) : (
//       <span>-</span>
//     )}
//   </div>
// );

// const currentPage = 1;
// const ordersPerPage = 10;

// const paginatedOrders = orders.slice(
//   (currentPage - 1) * ordersPerPage,
//   currentPage * ordersPerPage
// );
//   // ---------------- JSX (UNCHANGED) ----------------
//   return (
//     <div className="space-y-6 pb-8">
//       <PageHeader
//         title="Review & Place Order"
//         subtitle="Complete your order details"
//       />

//     {/* BACK */}
//       <button
//         onClick={() => navigate("/finished-goods")}
//         className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
//       >
//         <ArrowLeft size={18} />
//         Continue Shopping
//       </button>

//    {/* INFO */}
//        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
//       <AlertCircle
//           className="text-indigo-600 flex-shrink-0 mt-0.5"
//           size={20}
//         />

//         <div className="text-sm text-indigo-900">
//            <strong>Important:</strong> Your order will be marked
//            as <strong>DELIVERED</strong> and stock will be
//            deducted immediately after submission.
//          </div>
//        </div>

//        {/* CART */}
//        <SectionCard
//          title={
//           <div className="flex items-center gap-2">
//             <ShoppingCart size={20} />
//             Cart Summary
//           </div>
//         }
//         actions={
//           cart.length > 0 && (
//             <button
//               onClick={clearCart}
//               className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1"
//             >
//               <Trash2 size={16} />
//               Clear Cart
//             </button>
//           )
//         }
//       >
//         {errors.cart && (
//           <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
//             <AlertCircle
//               className="text-red-500 flex-shrink-0"
//               size={20}
//             />

//             <p className="text-red-700 text-sm">
//               {errors.cart}
//             </p>
//           </div>
//         )}

//         {!cart.length ? (
//           <div className="py-16 text-center text-slate-500">
//             <ShoppingCart
//               size={48}
//               className="mx-auto mb-4 text-slate-300"
//             />

//             <p className="text-lg font-semibold">
//               Your cart is empty
//             </p>

//             <p className="text-sm mt-1 mb-4">
//               Add products to get started
//             </p>

//             <button
//               onClick={() => navigate("/finished-goods")}
//               className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
//             >
//               Browse Products
//             </button>
//           </div>
//         ) : (
//           <div className="space-y-3">
//             {cart.map((item) => {
//               const cartonsPerBox = Number(
//                 item.product?.inner_boxes_per_outer_box || 0
//               );

//               const hasCartons = cartonsPerBox > 0;

//               const availableCartons = hasCartons
//                 ? Math.floor(
//                     Number(item.product.quantity || 0) /
//                       cartonsPerBox
//                   )
//                 : 0;

//               const maxQty =
//                 item.orderBy === "cartons"
//                   ? availableCartons
//                   : Number(item.product.quantity || 0);

//               const actualPairs =
//                 item.orderBy === "cartons" && hasCartons
//                   ? Number(item.qty_ordered) * cartonsPerBox
//                   : Number(item.qty_ordered);

//               return (
//                 <div
//                   key={item.finished_good_id}
//                   className="border border-slate-200 rounded-xl p-4 bg-white"
//                 >
//                   <div className="flex gap-4">
//                     {/* IMAGE */}
//                     <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
//                       {item.product.image_url ? (
//                         <img
//                           src={`${APP_BASE_URL}${item.product.image_url}`}
//                           alt={item.product.name}
//                           className="w-full h-full object-cover"
//                         />
//                       ) : (
//                         <div className="w-full h-full flex items-center justify-center text-slate-400">
//                           <Package size={28} />
//                         </div>
//                       )}
//                     </div>

//                     {/* DETAILS */}
//                     <div className="flex-1 space-y-2">
//                       <h3 className="font-bold text-slate-900">
//                         {item.product.article_code ||
//                           item.product.name}
//                       </h3>

//                       {/* META */}
//                       <div className="flex flex-wrap gap-2 text-xs text-slate-600">
//                         {item.product.color && (
//                           <span className="px-2 py-1 bg-slate-100 rounded">
//                             Color: {item.product.color}
//                           </span>
//                         )}

//                         {item.product.size && (
//                           <span className="px-2 py-1 bg-slate-100 rounded">
//                             Size: {item.product.size}
//                           </span>
//                         )}
//                       </div>

//                       {/* STOCK */}
//                       {/* <div className="flex gap-4 text-xs text-slate-500">
//                         <span>
//                           Available:{" "}
//                           {formatNumber(
//                             Number(item.product.quantity || 0)
//                           )}{" "}
//                           pairs
//                         </span>

//                         {hasCartons && (
//                           <span>
//                             Cartons:{" "}
//                             {formatNumber(availableCartons)}
//                           </span>
//                         )}
//                       </div> */}

//                       {/* TOGGLE */}
//                       {hasCartons && (
//                         <button
//                           onClick={() =>
//                             toggleOrderBy(
//                               item.finished_good_id
//                             )
//                           }
//                           className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
//                           ${
//                             item.orderBy === "cartons"
//                               ? "bg-indigo-500 text-white"
//                               : "bg-slate-100 text-slate-700 hover:bg-slate-200"
//                           }`}
//                         >
//                           {item.orderBy === "cartons"
//                             ? "Ordering by Cartons"
//                             : "Switch to Cartons"}
//                         </button>
//                       )}

//                       {/* QTY */}
//                       <div className="flex items-center justify-between pt-2">
//                         <div className="flex items-center gap-3">
//                           <button
//                             className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition"
//                             onClick={() =>
//                               updateQty(
//                                 item.finished_good_id,
//                                 Number(item.qty_ordered) - 1
//                               )
//                             }
//                           >
//                             <Minus size={16} />
//                           </button>

//                           <div className="text-center">
//                             <div className="font-bold text-lg">
//                               {item.qty_ordered}
//                             </div>

//                             <div className="text-[10px] text-slate-500">
//                               {item.orderBy}
//                             </div>
//                           </div>

//                           <button
//                             className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition disabled:opacity-50"
//                             onClick={() =>
//                               updateQty(
//                                 item.finished_good_id,
//                                 Number(item.qty_ordered) + 1
//                               )
//                             }
//                             disabled={
//                               getTotalPairs(cart) >= MAX_PAIRS_LIMIT ||
//                               Number(item.qty_ordered) >= maxQty
//                             }
//                           >
//                             <Plus size={16} />
//                           </button>
//                         </div>

//                         {/* PAIRS */}
//                         {item.orderBy === "cartons" &&
//                           hasCartons && (
//                             <div className="text-sm text-slate-600">
//                               ={" "}
//                               <span className="font-bold text-indigo-600">
//                                 {formatNumber(actualPairs)}
//                               </span>{" "}
//                               pairs
//                             </div>
//                           )}

//                         {/* REMOVE */}
//                         <button
//                           className="w-9 h-9 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 flex items-center justify-center transition"
//                           onClick={() =>
//                             removeFromCart(
//                               item.finished_good_id
//                             )
//                           }
//                         >
//                           <X size={16} />
//                         </button>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         )}
//       </SectionCard>

//       {/* CUSTOMER DETAILS */}
//       {cart.length > 0 && (
//         <SectionCard title="Customer Details">
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             {/* CUSTOMER NAME */}
//             <div className="w-full md:col-span-2">
//               <label className="block text-sm font-medium text-slate-700 mb-2">
//                 Customer Name{" "}
//                 <span className="text-red-500">*</span>
//               </label>

//               <input
//                 className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent
//                 ${
//                   errors.customerName
//                     ? "border-red-500"
//                     : "border-slate-300"
//                 }`}
//                 placeholder="Enter customer name"
//                 value={customerName}
//                 onChange={(e) => {
//                   setCustomerName(e.target.value);

//                   setErrors((prev) => ({
//                     ...prev,
//                     customerName: "",
//                   }));
//                 }}
//               />

//               {errors.customerName && (
//                 <p className="text-red-500 text-sm mt-1">
//                   {errors.customerName}
//                 </p>
//               )}
//             </div>

         
// <div>
//   <label className="block text-sm font-medium text-slate-700 mb-2">
//     Phone Number
//   </label>

//   <input
//     type="tel"
//     maxLength={10}
//     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
//       errors.customerPhone ? "border-red-500" : "border-slate-300"
//     }`}
//     placeholder="Enter 10 digit phone number"
//     value={customerPhone}
//     onChange={(e) => {
//       const value = e.target.value.replace(/\D/g, "").slice(0, 10);

//       setCustomerPhone(value);

//       setErrors((prev) => ({
//         ...prev,
//         customerPhone: "-",
//       }));
//     }}
//   />

//   {errors.customerPhone && (
//     <p className="text-red-500 text-sm mt-1">
//       {errors.customerPhone}
//     </p>
//   )}
// </div>


// <div>
//   <label className="block text-sm font-medium text-slate-700 mb-2">
//     PAN Number
//   </label>

//   <input
//     type="text"
//     maxLength={9}
//     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
//       errors.panNumber ? "border-red-500" : "border-slate-300"
//     }`}
//     placeholder="Enter 9 digit PAN number"
//     value={panNumber}
//     onChange={(e) => {
//       const value = e.target.value.replace(/\D/g, "").slice(0, 9);

//       setPanNumber("");

//       setErrors((prev) => ({
//         ...prev,
//         panNumber: "",
//       }));
//     }}
//   />

//   {errors.panNumber && (
//     <p className="text-red-500 text-sm mt-1">
//       {errors.panNumber}
//     </p>
//   )}
// </div>


// <div className="md:col-span-2">
//   <label className="block text-sm font-medium text-slate-700 mb-2">
//     Delivery Address
//   </label>

//   <input
//     type="text"
//     className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
//       errors.customerAddress ? "border-red-500" : "border-slate-300"
//     }`}
//     placeholder="Enter delivery address"
//     value={customerAddress}
//     onChange={(e) => {
//       const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");

//       setCustomerAddress(value);

//       setErrors((prev) => ({
//         ...prev,
//         customerAddress: "",
//       }));
//     }}
//   />

//   {errors.customerAddress && (
//     <p className="text-red-500 text-sm mt-1">
//       {errors.customerAddress}
//     </p>
//   )}
// </div>
//             {/* TRANSPORT */}
//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-2">
//                 Transport Name
//               </label>

//               <input
//                 className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
//                   errors.transportName ? "border-red-500" : "border-slate-300"
//                 }`}
//                 placeholder="Enter transport company"
//                 value={transportName}
//                 onChange={(e) => {
//                   setTransportName(e.target.value);
//                   setErrors((prev) => ({ ...prev, transportName: "" }));
//                 }}
//               />
//               {errors.transportName && (
//                 <p className="text-red-500 text-sm mt-1">
//                   {errors.transportName}
//                 </p>
//               )}
//             </div>

//             {/* NOTES */}
//             <div className="md:col-span-2">
//               <label className="block text-sm font-medium text-slate-700 mb-2">
//                 Order Notes
//               </label>

//               <textarea
//                 className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
//                 placeholder="Any special instructions"
//                 rows={3}
//                 value={notes}
//                 onChange={(e) => setNotes(e.target.value)}
//               />
//             </div>
//           </div>
//         </SectionCard>
//       )}

//       {/* table */}
//       <DataTable
//   columns={[
//    {
//       key: "id",
//       label: "S.No",
      

//    },
//     {
//       key: "customer_name",
//       label: "Customer",
//     },
//     {
//       key: "customer_phone",
//       label: "Contact",
//     },
//     {
//       key: "customer_address",
//       label: "Address",
//     },
//     {
//       key: "transport_name",
//       label: "Transport",
//     },
//     {
//       key: "notes",
//       label: "Notes",
//       render: (row) => row.notes || "-",
//     },
//     {
//       key: "status",
//       label: "Status",
//       render: (row) => (
//         <StatusBadge tone={statusTone[row.status]}>
//           {row.status}
//         </StatusBadge>
//       ),
//     },
//     {
//       key: "items",
//       label: "Items",
//       render: renderOrderItems,
//     },
//     {
//       key: "created_at",
//       label: "Date",
//       render: (row) =>
//         new Date(row.created_at).toLocaleString(),
//     },
    
//   ]}
//   rows={paginatedOrders}
// />

      

//       {/* BUTTONS */}
//       {cart.length > 0 && (
//         <div className="flex justify-end gap-3">
//           <button
//             onClick={() => navigate("/finished-goods")}
//             className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
//           >
//             Add More Products
//           </button>

//           <button
//             onClick={submitOrder}
//             disabled={submitting}
//             className="px-8 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[180px] justify-center"
//           >
//             {submitting ? (
//               <>
//                 <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
//                 Submitting...
//               </>
//             ) : (
//               <>
//                 <CheckCircle2 size={20} />
//                 Place Order
//               </>
//             )}
//           </button>
//         </div>
//       )}
      
//     </div>
//   );
// }
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ShoppingCart,
  Plus,
  Minus,
  Package,
  CheckCircle2,
  Trash2,
  AlertCircle,
  X,
  ArrowLeft,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import DataTable from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";

import { api, APP_BASE_URL } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatNumber } from "../utils/format";

export default function UserOrderPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [transportName, setTransportName] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState({});
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  const statusTone = {
    PENDING: "warning",
    CONFIRMED: "info",
    PACKED: "neutral",
    DELIVERED: "success",
    CANCELLED: "danger",
  };

  // ─── HELPERS ──────────────────────────────────────

  const getTotalPairs = (cartData) =>
    cartData.reduce((sum, item) => {
      const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
      const pairs =
        item.orderBy === "cartons" && cartonsPerBox > 0
          ? item.qty_ordered * cartonsPerBox
          : item.qty_ordered;
      return sum + Number(pairs || 0);
    }, 0);

  // ─── LOAD CART ────────────────────────────────────

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("userCart");
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        const updatedCart = parsedCart.map((item) => {
          const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
          return {
            ...item,
            orderBy: item.orderBy || (cartonsPerBox > 0 ? "cartons" : "pairs"),
            qty_ordered: Number(item.qty_ordered || 1),
          };
        });
        setCart(updatedCart);
      }
    } catch (err) {
      console.error("Failed to parse cart:", err);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  // ─── TOGGLE ORDER TYPE ────────────────────────────

  const toggleOrderBy = (id) => {
    setCart((prev) =>
      prev.map((item) =>
        item.finished_good_id !== id
          ? item
          : { ...item, orderBy: item.orderBy === "cartons" ? "pairs" : "cartons", qty_ordered: 1 }
      )
    );
  };

  // ─── UPDATE QTY ───────────────────────────────────
  //
  // NO hardcoded 450 cap here. The ceiling is always available_qty,
  // which the backend already computes as:
  //   available_qty = MIN(display_quantity, physical_stock) - reserved_qty
  //
  // Examples:
  //   display_qty=450, reserved=30  → available_qty=420  → user can order max 420
  //   display_qty=110, reserved=30  → available_qty=80   → user can order max 80
  //   display_qty=450, reserved=0   → available_qty=450  → user can order max 450
  //
  const updateQty = (id, qty) => {
    if (qty < 1) {
      removeFromCart(id);
      return;
    }

    const item = cart.find((c) => c.finished_good_id === id);
    if (!item) return;

    const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
    const available = Number(item.product?.available_qty ?? item.product?.quantity ?? 0);

    const stockLimit =
      item.orderBy === "cartons" && cartonsPerBox > 0
        ? Math.floor(available / cartonsPerBox)
        : available;

    if (qty > stockLimit) {
      showToast({
        title: "Stock limit reached",
        message: `Max available is ${formatNumber(stockLimit)} ${item.orderBy}`,
        tone: "error",
      });
      return;
    }

    setCart((prev) =>
      prev.map((c) => (c.finished_good_id === id ? { ...c, qty_ordered: qty } : c))
    );
  };

  // ─── REMOVE / CLEAR CART ──────────────────────────

  const removeFromCart = (id) => {
    const updatedCart = cart.filter((item) => item.finished_good_id !== id);
    setCart(updatedCart);
    localStorage.setItem("userCart", JSON.stringify(updatedCart));
  };

  const clearCart = () => {
    if (window.confirm("Are you sure you want to clear the cart?")) {
      setCart([]);
      localStorage.removeItem("userCart");
    }
  };

  // ─── FETCH ORDERS ─────────────────────────────────

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoadingOrders(true);
        const res = await api.getOrders(token);
        setOrders(res.data || []);
      } catch (err) {
        showToast({
          title: "Orders failed to load",
          message: err.message || "Failed to load orders",
          tone: "error",
        });
      } finally {
        setLoadingOrders(false);
      }
    };

    if (token) fetchOrders();
  }, [token]);

  // ─── VALIDATION ───────────────────────────────────

  const validateForm = () => {
    const newErrors = {};
    if (!customerName.trim()) newErrors.customerName = "Customer name is required";
    if (!customerAddress.trim()) newErrors.customerAddress = "Customer address is required";
    if (!cart.length) newErrors.cart = "Cart is empty";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── SUBMIT ORDER ─────────────────────────────────

  const submitOrder = async () => {
    if (!validateForm()) {
      showToast({ title: "Please fix errors", message: "Check highlighted fields", tone: "error" });
      return;
    }

    try {
      setSubmitting(true);

      const items = cart.map((item) => {
        const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
        let qtyOrdered = Number(item.qty_ordered || 1);
        if (item.orderBy === "cartons" && cartonsPerBox > 0) {
          qtyOrdered = qtyOrdered * cartonsPerBox;
        }
        return { finished_good_id: item.finished_good_id, qty_ordered: qtyOrdered };
      });

      await api.createOrder(
        {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || "0000000000",
          customer_address: customerAddress.trim(),
          pan_number: panNumber.trim() || "000000000",
          transport_name: transportName.trim() || "N/A",
          notes: notes.trim(),
          items,
        },
        token
      );

      showToast({ title: "Order placed", message: "Your order was placed successfully!", tone: "success" });

      setCart([]);
      localStorage.removeItem("userCart");
      setCustomerName(""); setCustomerPhone(""); setCustomerAddress("");
      setPanNumber(""); setTransportName(""); setNotes(""); setErrors({});

      const res = await api.getOrders(token);
      setOrders(res.data || []);
    } catch (err) {
      const shortages = err.data?.shortages;
      if (shortages?.length) {
        showToast({
          title: "Insufficient stock",
          message: shortages
            .map((s) => `${s.product_name}: need ${formatNumber(s.requested)}, only ${formatNumber(s.available)} available`)
            .join("\n"),
          tone: "error",
        });
      } else {
        showToast({
          title: "Order failed",
          message: err.data?.message || err.message || "Failed to place order",
          tone: "error",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── DERIVED ──────────────────────────────────────

  const totalItems = cart.reduce((sum, item) => sum + Number(item.qty_ordered || 0), 0);
  const totalPages = Math.ceil(orders.length / ordersPerPage);
  const paginatedOrders = orders.slice((currentPage - 1) * ordersPerPage, currentPage * ordersPerPage);

  const renderOrderItems = (order) => (
    <div className="space-y-1 text-xs">
      {order.items?.length
        ? order.items.map((item) => (
            <p key={item.id}>{item.product_name} — {formatNumber(item.qty_ordered)} {item.unit || ""}</p>
          ))
        : <span>—</span>}
    </div>
  );

  // ─── JSX ──────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Review & Place Order" subtitle="Complete your order details" />

      <button
        onClick={() => navigate("/finished-goods")}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
      >
        <ArrowLeft size={18} />
        Continue Shopping
      </button>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="text-indigo-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-indigo-900">
          <strong>Important:</strong> Your order will be reviewed by an admin before stock is deducted.
        </div>
      </div>

      {/* CART */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            Cart Summary ({totalItems} {totalItems === 1 ? "item" : "items"})
          </div>
        }
        actions={
          cart.length > 0 && (
            <button onClick={clearCart} className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1">
              <Trash2 size={16} /> Clear Cart
            </button>
          )
        }
      >
        {errors.cart && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
            <p className="text-red-700 text-sm">{errors.cart}</p>
          </div>
        )}

        {!cart.length ? (
          <div className="py-16 text-center text-slate-500">
            <ShoppingCart size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-semibold">Your cart is empty</p>
            <p className="text-sm mt-1 mb-4">Add products to get started</p>
            <button
              onClick={() => navigate("/finished-goods")}
              className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
            >
              Browse Products
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => {
              const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
              const hasCartons = cartonsPerBox > 0;
              const available = Number(item.product?.available_qty ?? item.product?.quantity ?? 0);
              const maxQty = hasCartons && item.orderBy === "cartons"
                ? Math.floor(available / cartonsPerBox)
                : available;
              const actualPairs = hasCartons && item.orderBy === "cartons"
                ? Number(item.qty_ordered) * cartonsPerBox
                : Number(item.qty_ordered);

              return (
                <div key={item.finished_good_id} className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex gap-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product.image_url ? (
                        <img src={`${APP_BASE_URL}${item.product.image_url}`} alt={item.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Package size={28} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <h3 className="font-bold text-slate-900">
                        {item.product.article_code || item.product.name}
                      </h3>

                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        {item.product.color && (
                          <span className="px-2 py-1 bg-slate-100 rounded">Color: {item.product.color}</span>
                        )}
                        {item.product.size && (
                          <span className="px-2 py-1 bg-slate-100 rounded">Size: {item.product.size}</span>
                        )}
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
                          Available: {formatNumber(available)} pairs
                        </span>
                      </div>

                      {hasCartons && (
                        <button
                          onClick={() => toggleOrderBy(item.finished_good_id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            item.orderBy === "cartons"
                              ? "bg-indigo-500 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {item.orderBy === "cartons" ? "Ordering by Cartons" : "Switch to Cartons"}
                        </button>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-3">
                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() => updateQty(item.finished_good_id, Number(item.qty_ordered) - 1)}
                          >
                            <Minus size={16} />
                          </button>

                          <div className="text-center">
                            <div className="font-bold text-lg">{item.qty_ordered}</div>
                            <div className="text-[10px] text-slate-500">{item.orderBy}</div>
                          </div>

                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition disabled:opacity-50"
                            onClick={() => updateQty(item.finished_good_id, Number(item.qty_ordered) + 1)}
                            disabled={Number(item.qty_ordered) >= maxQty}
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        {hasCartons && item.orderBy === "cartons" && (
                          <div className="text-sm text-slate-600">
                            = <span className="font-bold text-indigo-600">{formatNumber(actualPairs)}</span> pairs
                          </div>
                        )}

                        <button
                          className="w-9 h-9 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 flex items-center justify-center transition"
                          onClick={() => removeFromCart(item.finished_good_id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end text-sm text-slate-600 pt-1">
              Total pairs in cart:{" "}
              <span className="ml-1 font-bold text-indigo-600">
                {formatNumber(getTotalPairs(cart))}
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* CUSTOMER DETAILS */}
      {cart.length > 0 && (
        <SectionCard title="Customer Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.customerName ? "border-red-500" : "border-slate-300"}`}
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setErrors((p) => ({ ...p, customerName: "" })); }}
              />
              {errors.customerName && <p className="text-red-500 text-sm mt-1">{errors.customerName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
              <input
                type="tel" maxLength={10}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter 10 digit phone number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">PAN Number</label>
              <input
                type="text" maxLength={9}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter 9 digit PAN number"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Delivery Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.customerAddress ? "border-red-500" : "border-slate-300"}`}
                placeholder="Enter delivery address"
                value={customerAddress}
                onChange={(e) => { setCustomerAddress(e.target.value); setErrors((p) => ({ ...p, customerAddress: "" })); }}
              />
              {errors.customerAddress && <p className="text-red-500 text-sm mt-1">{errors.customerAddress}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Transport Name</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter transport company"
                value={transportName}
                onChange={(e) => setTransportName(e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Order Notes</label>
              <textarea
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Any special instructions" rows={3}
                value={notes} onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ORDERS TABLE */}
      <SectionCard title="My Orders">
        {loadingOrders ? (
          <div className="py-10 text-center text-slate-500">Loading orders...</div>
        ) : (
          <>
            <DataTable
              columns={[
                { key: "id", label: "S.No" },
                { key: "customer_name", label: "Customer" },
                { key: "customer_phone", label: "Contact" },
                { key: "customer_address", label: "Address" },
                { key: "transport_name", label: "Transport" },
                { key: "notes", label: "Notes", render: (row) => row.notes || "—" },
                { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge> },
                { key: "items", label: "Items", render: renderOrderItems },
                { key: "created_at", label: "Date", render: (row) => new Date(row.created_at).toLocaleString() },
              ]}
              rows={paginatedOrders}
            />

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50">
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page} onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${page === currentPage ? "bg-indigo-500 text-white border-indigo-500" : "border-slate-300 hover:bg-slate-50"}`}
                  >
                    {page}
                  </button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* SUBMIT */}
      {cart.length > 0 && (
        <div className="flex justify-end gap-3">
          <button onClick={() => navigate("/finished-goods")} className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all">
            Add More Products
          </button>
          <button
            onClick={submitOrder} disabled={submitting}
            className="px-8 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[180px] justify-center"
          >
            {submitting ? (
              <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> Submitting...</>
            ) : (
              <><CheckCircle2 size={20} /> Place Order</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}