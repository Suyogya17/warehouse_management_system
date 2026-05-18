import { useEffect, useState, useMemo } from "react";
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

// import PageHeader from "../components/PageHeader";
import PageHeader from "../../components/PageHeader";
import SectionCard from "../../components/SectionCard";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";

import { api, APP_BASE_URL } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatNumber } from "../../utils/format";

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

  // ____DELIVERY NOTE NUMBER _________________________
  
  const deliveryNoteNumbersByOrderId = useMemo(() => {
  const sorted = [...orders].sort((a, b) => {
    const aDate = new Date(a.confirmed_at || a.created_at).getTime();
    const bDate = new Date(b.confirmed_at || b.created_at).getTime();

    if (aDate !== bDate) return aDate - bDate;
    return Number(a.id) - Number(b.id);
  });

  return new Map(
    sorted.map((order, index) => {
      const orderId = Number(order.id);
      // For order ID 25 and above, use new system: DN-1965, DN-1966, etc.
      if (orderId >= 25) {
        return [orderId, `DN-${1940 + orderId}`];
      }
      // For orders before ID 25, keep old sequential system
      return [orderId, `DN-${1001 + index}`];
    })
  );
}, [orders]);

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
  <div className="flex items-center justify-between w-full">
    
    {/* LEFT */}
    <div className="flex gap-2">
      <ShoppingCart size={20} />
      <span className="text-sm sm:text-base font-medium">
        Cart Summary
      </span>
    </div>
  </div>
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
                <div key={item.finished_good_id} className="border rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition-all">
                   <div className="flex justify-end">
                          <button
                          className="w-9 h-9 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 flex items-center justify-center transition"
                          onClick={() => removeFromCart(item.finished_good_id)}
                        >
                          <X size={16} />
                        </button>
                          </div>

                  <div className="flex gap-4 ">

                    
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product.image_url ? (
                        <img src={`${APP_BASE_URL}${item.product.image_url}`} alt={item.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Package size={28} />
                        </div>
                      )}
                    </div>
                    

                    <div className="flex-1 flex-col justify-between">
                      
                      <h3 className="font-bold text-slate-900">
                        {item.product.article_code || item.product.name}
                      </h3>
                       {item.product.color && (
                          <span className="px-2 py-1 text-xs">Color: {item.product.color}</span>
                        )}
                        {item.product.size && (
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                            Size: {item.product.size}
                          </span>
                        )}
                        <div className="flex gap-4 text-xs text-slate-500">
                          
                          <span className="rounded px-2 py-1 bg-slate-100 bg-green-100 text-green-800">
                            Available: {formatNumber(available)} pairs
                          </span>
                          </div>
                      

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
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end text-sm text-slate-600 pt-1 px-5">
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
                {
  key: "notes",
  label: "Notes",
  render: (row) => (
    <div className=" whitespace-normal  text-sm">
      {row.notes || "-"}
    </div>
  ),
},
                
                { key: "status", label: "Status", render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge> },
                { key: "items", label: "Items", render: renderOrderItems },
                 {
              key: "created_at",
              label: "Created",
              render: (row) => {
  const createdDate = new Date(row.created_at);

  return (
    <div className="flex flex-col">
      <strong>
        {createdDate.toLocaleDateString("en-GB")}
      </strong>

      <span className="text-xs text-slate-500">
        {createdDate.toLocaleTimeString()}
      </span>
    </div>
  );
}
                // new Date(row.created_at).toLocaleString(),
            },
                {
  key: "confirmed_by_name",
  label: "Confirmed By / DN",
  render: (row) => {
    const deliveryNoteNumber =
      deliveryNoteNumbersByOrderId.get(Number(row.id)) ||
      `DN-${1000 + Number(row.id)}`;

    return (
      <>
        <div>{row.confirmed_by_name || "-"}</div>
        <small style={{ color: "#666" }}>
          {deliveryNoteNumber}
        </small>
      </>
    );
  },
}

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