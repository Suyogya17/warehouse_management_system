import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ShoppingCart,
  Plus,
  Minus,
  Package,
  CheckCircle2,
  Eye,
  Trash2,
  AlertCircle,
  X,
  ArrowLeft,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";

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

  // FORM FIELDS
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [transportName, setTransportName] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState({});
  const [orders, setOrders] = useState([]);
const [loadingOrders, setLoadingOrders] = useState(false);

  // LOAD CART
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("userCart");

      console.log("Saved Cart:", savedCart);

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);

        const updatedCart = parsedCart.map((item) => {
          const cartonsPerBox = Number(
            item.product?.inner_boxes_per_outer_box || 0
          );

          return {
            ...item,
            orderBy:
              item.orderBy ||
              (cartonsPerBox > 0 ? "cartons" : "pairs"),
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

  // SAVE CART
  useEffect(() => {
    if (!cartLoaded) return;

    localStorage.setItem("userCart", JSON.stringify(cart));
  }, [cart, cartLoaded]);

  // TOGGLE ORDER TYPE
  const toggleOrderBy = (id) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.finished_good_id !== id) return item;

        const newOrderBy =
          item.orderBy === "cartons" ? "pairs" : "cartons";

        return {
          ...item,
          orderBy: newOrderBy,
          qty_ordered: 1,
        };
      })
    );
  };

  // UPDATE QUANTITY
  const updateQty = (id, qty) => {
    if (qty < 1) {
      removeFromCart(id);
      return;
    }

    const item = cart.find((c) => c.finished_good_id === id);

    if (!item) return;

    const cartonsPerBox = Number(
      item.product?.inner_boxes_per_outer_box || 0
    );

    const maxQty =
      item.orderBy === "cartons" && cartonsPerBox > 0
        ? Math.floor(item.product.quantity / cartonsPerBox)
        : Number(item.product.quantity || 0);

    if (qty > maxQty) {
      showToast({
        title: "Quantity unavailable",
        message: `Maximum available is ${formatNumber(maxQty)} ${item.orderBy}`,
        tone: "error",
      });
      return;
    }

    setCart((prev) =>
      prev.map((c) =>
        c.finished_good_id === id
          ? {
              ...c,
              qty_ordered: Number(qty),
            }
          : c
      )
    );
  };

  useEffect(() => {
  const fetchOrders = async () => {
    try {
      setLoadingOrders(true);

      const res = await api.getOrders(token); 
      // OR if your API name is different, adjust it

      setOrders(res.data || []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
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

  // REMOVE ITEM
  const removeFromCart = (id) => {
    const updatedCart = cart.filter(
      (item) => item.finished_good_id !== id
    );

    setCart(updatedCart);

    localStorage.setItem("userCart", JSON.stringify(updatedCart));
  };

  // CLEAR CART
  const clearCart = () => {
    if (window.confirm("Are you sure you want to clear the cart?")) {
      setCart([]);
      localStorage.removeItem("userCart");
    }
  };

  // VALIDATION
  const validateForm = () => {
    const newErrors = {};

    if (!customerName.trim()) {
      newErrors.customerName = "Customer name is required";
    }
    if (!customerPhone.trim()) {
      newErrors.customerPhone = "Customer phone is required";
    }
    if (!customerAddress.trim()) {
      newErrors.customerAddress = "Customer address is required"; 
    }
    if (!panNumber.trim()) {
      newErrors.panNumber = "PAN number is required";
    }
    if (!transportName.trim()) {
      newErrors.transportName = "Transport name is required";
    }

    if (!cart.length) {
      newErrors.cart = "Cart is empty";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // SUBMIT ORDER
  const submitOrder = async () => {
    if (!validateForm()) {
      showToast({
        title: "Please fix the errors",
        message: "Check the highlighted fields and try again.",
        tone: "error",
      });
      return;
    }

    try {
      setSubmitting(true);

      const items = cart.map((item) => {
        const cartonsPerBox = Number(
          item.product?.inner_boxes_per_outer_box || 0
        );

        let qtyOrdered = Number(item.qty_ordered || 1);

        // CONVERT CARTONS TO PAIRS
        if (item.orderBy === "cartons" && cartonsPerBox > 0) {
          qtyOrdered = qtyOrdered * cartonsPerBox;
        }

        return {
          finished_good_id: item.finished_good_id,
          qty_ordered: qtyOrdered,
        };
      });

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: customerAddress.trim(),
        pan_number: panNumber.trim(),
        transport_name: transportName.trim(),
        notes: notes.trim(),
        items,
      };

      console.log("ORDER PAYLOAD:", payload);

      const res = await api.createOrder(payload, token);

      showToast({
        title: "Order placed",
        message: res.message || "Order placed successfully!",
        tone: "success",
      });

      // RESET
      setCart([]);
      localStorage.removeItem("userCart");

      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setPanNumber("");
      setTransportName("");
      setNotes("");

      setErrors({});

      setTimeout(() => {
        navigate("/order-customer");
      }, 1500);
    } catch (err) {
      console.error(err);

      if (err.response?.data?.shortages) {
        const shortages = err.response.data.shortages;

        const shortageMsg = shortages
          .map(
            (s) =>
              `${s.product_name}: need ${s.requested}, only ${s.available} available`
          )
          .join("; ");

        showToast({
          title: "Insufficient stock",
          message: shortageMsg,
          tone: "error",
        });
      } else {
        showToast({
          title: "Order failed",
          message:
            err.data?.message ||
            err.response?.data?.message ||
            err.message ||
            "Failed to place order",
          tone: "error",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );
  // delete order function
  const deleteOrder = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) {
      return;
    }

    try {
      await api.deleteOrder(id, token);
      showToast({
        title: "Order deleted",
        message: "The order was removed successfully.",
        tone: "success",
      });
      setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(id)));
    } catch (err) {
      console.error("Failed to delete order:", err);

      if (err.status === 404) {
        showToast({
          title: "Order already removed",
          message: err.data?.message || "This order no longer exists on the server.",
          tone: "info",
        });
        setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(id)));
        return;
      }

      if (err.status === 403) {
        showToast({
          title: "Delete not allowed",
          message: "You don't have permission to delete this order.",
          tone: "error",
        });
        return;
      }

      if (err.status === 400) {
        showToast({
          title: "Order cannot be deleted",
          message: err.data?.message || "Cannot delete this order.",
          tone: "error",
        });
        return;
      }

      showToast({
        title: "Delete failed",
        message: err.data?.message || err.message || "Failed to delete order.",
        tone: "error",
      });
    }
  };
  // PAGINATION
const [currentPage, setCurrentPage] = useState(1);
const ordersPerPage = 10;

const totalPages = Math.ceil(orders.length / ordersPerPage);

const startIndex = (currentPage - 1) * ordersPerPage;
const endIndex = startIndex + ordersPerPage;

const paginatedOrders = orders.slice(startIndex, endIndex);

// PAGE CHANGE
const goToPage = (page) => {
  if (page < 1 || page > totalPages) return;
  setCurrentPage(page);
};

// PAGE NUMBERS
const renderPageNumbers = () => {
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
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Review & Place Order"
        subtitle="Complete your order details"
      />

      {/* BACK */}
      <button
        onClick={() => navigate("/finished-goods")}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
      >
        <ArrowLeft size={18} />
        Continue Shopping
      </button>

      {/* INFO */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
        <AlertCircle
          className="text-indigo-600 flex-shrink-0 mt-0.5"
          size={20}
        />

        <div className="text-sm text-indigo-900">
          <strong>Important:</strong> Your order will be marked
          as <strong>DELIVERED</strong> and stock will be
          deducted immediately after submission.
        </div>
      </div>

      {/* CART */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            Cart Summary ({totalItems}{" "}
            {totalItems === 1 ? "item" : "items"})
          </div>
        }
        actions={
          cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1"
            >
              <Trash2 size={16} />
              Clear Cart
            </button>
          )
        }
      >
        {errors.cart && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2">
            <AlertCircle
              className="text-red-500 flex-shrink-0"
              size={20}
            />

            <p className="text-red-700 text-sm">
              {errors.cart}
            </p>
          </div>
        )}

        {!cart.length ? (
          <div className="py-16 text-center text-slate-500">
            <ShoppingCart
              size={48}
              className="mx-auto mb-4 text-slate-300"
            />

            <p className="text-lg font-semibold">
              Your cart is empty
            </p>

            <p className="text-sm mt-1 mb-4">
              Add products to get started
            </p>

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
              const cartonsPerBox = Number(
                item.product?.inner_boxes_per_outer_box || 0
              );

              const hasCartons = cartonsPerBox > 0;

              const availableCartons = hasCartons
                ? Math.floor(
                    Number(item.product.quantity || 0) /
                      cartonsPerBox
                  )
                : 0;

              const maxQty =
                item.orderBy === "cartons"
                  ? availableCartons
                  : Number(item.product.quantity || 0);

              const actualPairs =
                item.orderBy === "cartons" && hasCartons
                  ? Number(item.qty_ordered) * cartonsPerBox
                  : Number(item.qty_ordered);

              return (
                <div
                  key={item.finished_good_id}
                  className="border border-slate-200 rounded-xl p-4 bg-white"
                >
                  <div className="flex gap-4">
                    {/* IMAGE */}
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product.image_url ? (
                        <img
                          src={`${APP_BASE_URL}${item.product.image_url}`}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Package size={28} />
                        </div>
                      )}
                    </div>

                    {/* DETAILS */}
                    <div className="flex-1 space-y-2">
                      <h3 className="font-bold text-slate-900">
                        {item.product.article_code ||
                          item.product.name}
                      </h3>

                      {/* META */}
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        {item.product.color && (
                          <span className="px-2 py-1 bg-slate-100 rounded">
                            Color: {item.product.color}
                          </span>
                        )}

                        {item.product.size && (
                          <span className="px-2 py-1 bg-slate-100 rounded">
                            Size: {item.product.size}
                          </span>
                        )}
                      </div>

                      {/* STOCK */}
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>
                          Available:{" "}
                          {formatNumber(
                            Number(item.product.quantity || 0)
                          )}{" "}
                          pairs
                        </span>

                        {hasCartons && (
                          <span>
                            Cartons:{" "}
                            {formatNumber(availableCartons)}
                          </span>
                        )}
                      </div>

                      {/* TOGGLE */}
                      {hasCartons && (
                        <button
                          onClick={() =>
                            toggleOrderBy(
                              item.finished_good_id
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${
                            item.orderBy === "cartons"
                              ? "bg-indigo-500 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {item.orderBy === "cartons"
                            ? "Ordering by Cartons"
                            : "Switch to Cartons"}
                        </button>
                      )}

                      {/* QTY */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-3">
                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() =>
                              updateQty(
                                item.finished_good_id,
                                Number(item.qty_ordered) - 1
                              )
                            }
                          >
                            <Minus size={16} />
                          </button>

                          <div className="text-center">
                            <div className="font-bold text-lg">
                              {item.qty_ordered}
                            </div>

                            <div className="text-[10px] text-slate-500">
                              {item.orderBy}
                            </div>
                          </div>

                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition disabled:opacity-50"
                            onClick={() =>
                              updateQty(
                                item.finished_good_id,
                                Number(item.qty_ordered) + 1
                              )
                            }
                            disabled={
                              Number(item.qty_ordered) >=
                              maxQty
                            }
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        {/* PAIRS */}
                        {item.orderBy === "cartons" &&
                          hasCartons && (
                            <div className="text-sm text-slate-600">
                              ={" "}
                              <span className="font-bold text-indigo-600">
                                {formatNumber(actualPairs)}
                              </span>{" "}
                              pairs
                            </div>
                          )}

                        {/* REMOVE */}
                        <button
                          className="w-9 h-9 rounded-lg border border-red-300 hover:bg-red-50 text-red-600 flex items-center justify-center transition"
                          onClick={() =>
                            removeFromCart(
                              item.finished_good_id
                            )
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* CUSTOMER DETAILS */}
      {cart.length > 0 && (
        <SectionCard title="Customer Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CUSTOMER NAME */}
            <div className="w-full md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Customer Name{" "}
                <span className="text-red-500">*</span>
              </label>

              <input
                className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                ${
                  errors.customerName
                    ? "border-red-500"
                    : "border-slate-300"
                }`}
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);

                  setErrors((prev) => ({
                    ...prev,
                    customerName: "",
                  }));
                }}
              />

              {errors.customerName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.customerName}
                </p>
              )}
            </div>

         
<div>
  <label className="block text-sm font-medium text-slate-700 mb-2">
    Phone Number
  </label>

  <input
    type="tel"
    maxLength={10}
    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
      errors.customerPhone ? "border-red-500" : "border-slate-300"
    }`}
    placeholder="Enter 10 digit phone number"
    value={customerPhone}
    onChange={(e) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 10);

      setCustomerPhone(value);

      setErrors((prev) => ({
        ...prev,
        customerPhone: "",
      }));
    }}
  />

  {errors.customerPhone && (
    <p className="text-red-500 text-sm mt-1">
      {errors.customerPhone}
    </p>
  )}
</div>


<div>
  <label className="block text-sm font-medium text-slate-700 mb-2">
    PAN Number
  </label>

  <input
    type="text"
    maxLength={9}
    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
      errors.panNumber ? "border-red-500" : "border-slate-300"
    }`}
    placeholder="Enter 9 digit PAN number"
    value={panNumber}
    onChange={(e) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 9);

      setPanNumber(value);

      setErrors((prev) => ({
        ...prev,
        panNumber: "",
      }));
    }}
  />

  {errors.panNumber && (
    <p className="text-red-500 text-sm mt-1">
      {errors.panNumber}
    </p>
  )}
</div>


<div className="md:col-span-2">
  <label className="block text-sm font-medium text-slate-700 mb-2">
    Delivery Address
  </label>

  <input
    type="text"
    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
      errors.customerAddress ? "border-red-500" : "border-slate-300"
    }`}
    placeholder="Enter delivery address"
    value={customerAddress}
    onChange={(e) => {
      const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");

      setCustomerAddress(value);

      setErrors((prev) => ({
        ...prev,
        customerAddress: "",
      }));
    }}
  />

  {errors.customerAddress && (
    <p className="text-red-500 text-sm mt-1">
      {errors.customerAddress}
    </p>
  )}
</div>
            {/* TRANSPORT */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Transport Name
              </label>

              <input
                className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  errors.transportName ? "border-red-500" : "border-slate-300"
                }`}
                placeholder="Enter transport company"
                value={transportName}
                onChange={(e) => {
                  setTransportName(e.target.value);
                  setErrors((prev) => ({ ...prev, transportName: "" }));
                }}
              />
              {errors.transportName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.transportName}
                </p>
              )}
            </div>

            {/* NOTES */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Order Notes
              </label>

              <textarea
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Any special instructions"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </SectionCard>
      )}

       <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-left">
                        <tr>
                          {/* <th className="p-3">Order ID</th> */}
                          <th className="p-3">S.No</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Contact</th>
                          <th className="p-3">Address</th>
                          <th className="p-3">Transport</th>
                          <th className="p-3">Notes</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Date</th>

                        </tr>
                      </thead>

                <tbody>
              {loadingOrders ? (
                <tr>
                  <td className="p-3 text-center" colSpan="8">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td className="p-3 text-center" colSpan="8">
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order, index) => (
                  <tr
                    key={order.id}
                    className="border-t hover:bg-slate-50 transition"
                  >
                    {/* SERIAL NUMBER */}
                    <td className="p-3 font-medium">
                      {index + 1}
                    </td>

                    {/* CUSTOMER */}
                    <td className="p-3">
                      {order.customer_name || "-"}
                    </td>

                    {/* PHONE */}
                    <td className="p-3">
                      {order.customer_phone || "-"}
                    </td>

                    {/* ADDRESS */}
                    <td className="p-3">
                      {order.customer_address || "-"}
                    </td>

                    {/* TRANSPORT */}
                    <td className="p-3">
                      {order.transport_name || "-"}
                    </td>

                    {/* NOTES */}
                    <td className="p-3">
                      {order.notes || "-"}
                    </td>

                    {/* STATUS */}
                    <td className="p-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order.status === "DELIVERED"
                            ? "bg-green-100 text-green-700"
                            : order.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>

                    {/* DATE */}
                    <td className="p-3 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
                    </table>
      </div>
      

      {/* BUTTONS */}
      {cart.length > 0 && (
        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate("/finished-goods")}
            className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
          >
            Add More Products
          </button>

          <button
            onClick={submitOrder}
            disabled={submitting}
            className="px-8 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[180px] justify-center"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 size={20} />
                Place Order
              </>
            )}
          </button>
        </div>
      )}
      
    </div>
  );
}
