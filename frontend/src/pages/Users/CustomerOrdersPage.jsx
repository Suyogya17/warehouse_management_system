import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import CreatableSelect from "react-select/creatable";

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
  UserRound,
  MapPin,
  Truck,
  ClipboardCheck,
  Boxes,
} from "lucide-react";

// import PageHeader from "../components/PageHeader";
import PageHeader from "../../components/PageHeader";
import SectionCard from "../../components/SectionCard";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";

import { api, APP_BASE_URL } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { getCustomerVisibleStock } from "../../utils/displayStock";
import { formatEnglishDate, formatNepaliDate, formatNumber, formatTime } from "../../utils/format";
import {
  findTransportByName,
  TRANSPORT_DIRECTORY,
  transportServesAddress,
} from "../../data/transportDirectory";
import { PARTY_DIRECTORY } from "../../data/partyDirectory";

const normalizeCustomerKey = (value) =>
  String(value || "").trim().toLowerCase().replace(/[\s._&()-]+/g, "");

const isUsefulTransport = (value) => {
  const transport = String(value || "").trim();
  return transport && !["N/A", "NA", "NONE", "-"].includes(transport.toUpperCase());
};

export default function UserOrderPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isAdminOrderEntry = ["ADMIN", "CO_ADMIN"].includes(
    String(user?.role || "").toUpperCase()
  );
  const catalogPath = isAdminOrderEntry ? "/take-order" : "/finished-goods";

  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [transportName, setTransportName] = useState("");
  const [suggestedTransportName, setSuggestedTransportName] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState({});
  const [orders, setOrders] = useState([]);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");

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

  const getTotalCartons = (cartData) =>
    cartData.reduce((sum, item) => {
      const pairsPerCarton = Number(item.product?.inner_boxes_per_outer_box || 0);
      const pairs =
        item.orderBy === "cartons" && pairsPerCarton > 0
          ? Number(item.qty_ordered || 0) * pairsPerCarton
          : Number(item.qty_ordered || 0);
      return sum + (pairsPerCarton > 0 ? pairs / pairsPerCarton : 0);
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

  const setOrderBy = (id, orderBy) => {
    const item = cart.find((cartItem) => cartItem.finished_good_id === id);
    const pairsPerCarton = Number(item?.product?.inner_boxes_per_outer_box || 0);

    if (
      orderBy === "pairs" &&
      item?.orderBy !== "pairs" &&
      pairsPerCarton > 0 &&
      !window.confirm(
        `This product is normally packed in cartons of ${pairsPerCarton} pairs. Do you want to order individual pairs instead?`
      )
    ) {
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.finished_good_id !== id
          ? item
          : { ...item, orderBy, qty_ordered: 1 }
      )
    );
  };

  // ─── UPDATE QTY ───────────────────────────────────
  //
  const updateQty = (id, qty) => {
    if (qty < 1) {
      removeFromCart(id);
      return;
    }
    

    const item = cart.find((c) => c.finished_good_id === id);
    if (!item) return;

    const cartonsPerBox = Number(item.product?.inner_boxes_per_outer_box || 0);
    const available = getCustomerVisibleStock(item.product);

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
        const [ordersResult, filtersResult] = await Promise.all([
          api.getOrders(token, { limit: 100 }),
          api.getOrderFilters(token),
        ]);
        setOrders(ordersResult.data || []);
        setCustomerHistory(filtersResult.data?.parties || []);
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
    if (!/^\d{10}$/.test(customerPhone)) {
      newErrors.customerPhone = "Enter a valid 10 digit phone number";
    }
    if (!customerAddress.trim()) newErrors.customerAddress = "Customer address is required";
    if (!/^\d{8,9}$/.test(panNumber)) {
      newErrors.panNumber = "Enter a valid 8 or 9 digit PAN number";
    }
    if (!transportName.trim()) newErrors.transportName = "Transport name is required";
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

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: customerAddress.trim(),
        pan_number: panNumber.trim(),
        transport_name: transportName.trim(),
        notes: notes.trim(),
        items,
      };

      try {
        await api.createOrder(payload, token);
      } catch (err) {
        if (
          err.status !== 409 ||
          err.data?.code !== "POTENTIAL_DUPLICATE_ORDER"
        ) {
          throw err;
        }
        const duplicate = err.data?.duplicates?.[0];
        const confirmed = window.confirm(
          [
            "Possible duplicate order detected.",
            duplicate
              ? `Order #${duplicate.id} for ${duplicate.customer_name} already contains the same products and quantities.`
              : "A recent order already contains the same customer, products and quantities.",
            "Place another order only if the repeat order is intentional.",
          ].join("\n\n")
        );
        if (!confirmed) return;
        await api.createOrder({ ...payload, confirm_duplicate: true }, token);
      }

      showToast({ title: "Order placed", message: "Your order was placed successfully!", tone: "success" });

      setCart([]);
      localStorage.removeItem("userCart");
      setCustomerName(""); setCustomerPhone(""); setCustomerAddress("");
      setPanNumber(""); setTransportName(""); setSuggestedTransportName(""); setNotes(""); setErrors({});

      const [ordersResult, filtersResult] = await Promise.all([
        api.getOrders(token, { limit: 100 }),
        api.getOrderFilters(token),
      ]);
      setOrders(ordersResult.data || []);
      setCustomerHistory(filtersResult.data?.parties || []);
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
  const totalPairsInCart = getTotalPairs(cart);
  const totalCartonsInCart = getTotalCartons(cart);

  const knownCustomers = useMemo(() => {
    const customers = new Map();

    PARTY_DIRECTORY.forEach((party) => {
      const key = normalizeCustomerKey(party.name);
      if (!key) return;
      customers.set(key, {
        id: `directory:${key}`,
        customer_name: party.name,
        customer_phone: party.phone,
        customer_address: party.address,
        pan_number: party.pan,
        contact_person: party.contact,
        source_labels: ["Party directory"],
      });
    });

    customerHistory.forEach((customer) => {
      const key = normalizeCustomerKey(customer.name);
      if (!key) return;
      const directoryCustomer = customers.get(key) || {};
      customers.set(key, {
        ...directoryCustomer,
        ...customer,
        id: `${customer.dealer_id}:${customer.key || key}`,
        customer_name: customer.name || directoryCustomer.customer_name,
        customer_phone:
          customer.customer_phone || directoryCustomer.customer_phone || "",
        customer_address:
          customer.customer_address || directoryCustomer.customer_address || "",
        pan_number: customer.pan_number || directoryCustomer.pan_number || "",
        contact_person: directoryCustomer.contact_person || "",
        created_at: customer.latest_order_at,
        source_labels: [
          ...(directoryCustomer.source_labels || []),
          "Previous order",
        ],
      });
    });

    [...orders]
      .sort((left, right) => {
        const dateDifference = new Date(right.created_at || 0) - new Date(left.created_at || 0);
        return dateDifference || Number(right.id || 0) - Number(left.id || 0);
      })
      .forEach((order) => {
        const key = normalizeCustomerKey(order.customer_name);
        if (!key || customers.has(key)) return;
        customers.set(key, {
          ...order,
          source_labels: ["Previous order"],
        });
      });
    return [...customers.values()];
  }, [customerHistory, orders]);

  const matchingCustomer = useMemo(
    () =>
      knownCustomers.find(
        (customer) =>
          normalizeCustomerKey(customer.customer_name) ===
          normalizeCustomerKey(customerName)
      ) || null,
    [customerName, knownCustomers]
  );

  const applyCustomerDetails = (customer, overwrite = false) => {
    if (!customer) return;
    const suggestedPhone = String(customer.customer_phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    const suggestedPan = String(customer.pan_number || "")
      .replace(/\D/g, "")
      .slice(0, 9);
    const suggestedAddress = String(customer.customer_address || "").trim();
    const previousTransport = isUsefulTransport(customer.transport_name)
      ? String(customer.transport_name).trim()
      : "";

    setCustomerName(customer.customer_name || customerName);
    setCustomerPhone((current) =>
      overwrite && suggestedPhone ? suggestedPhone : current || suggestedPhone
    );
    setCustomerAddress((current) =>
      overwrite && suggestedAddress ? suggestedAddress : current || suggestedAddress
    );
    setPanNumber((current) =>
      overwrite && suggestedPan ? suggestedPan : current || suggestedPan
    );
    setTransportName((current) =>
      overwrite && previousTransport ? previousTransport : current || previousTransport
    );
    setSuggestedTransportName(previousTransport);
  };

  const applyCustomerHistory = () => {
    applyCustomerDetails(matchingCustomer, false);
  };

  const handleCustomerNameChange = (value) => {
    setCustomerName(value);
    setErrors((current) => ({ ...current, customerName: "" }));

    const exactMatch = knownCustomers.find(
      (customer) =>
        normalizeCustomerKey(customer.customer_name) ===
        normalizeCustomerKey(value)
    );
    if (exactMatch) {
      applyCustomerDetails(exactMatch, true);
    }
  };

  const transportOptions = useMemo(() => {
    const previousName = String(suggestedTransportName || "").trim();
    const previousDirectoryEntry = findTransportByName(previousName);
    const options = TRANSPORT_DIRECTORY.map((transport) => ({
      value: transport.name,
      label: transport.name,
      phone: transport.phone,
      destinations: transport.destinations,
      recommendedForAddress: transportServesAddress(transport, customerAddress),
      previouslyUsed:
        Boolean(previousName) &&
        (transport.name.toLowerCase() === previousName.toLowerCase() ||
          previousDirectoryEntry?.name === transport.name),
    }));

    if (previousName && !previousDirectoryEntry) {
      options.unshift({
        value: previousName,
        label: previousName,
        phone: "",
        destinations: [],
        recommendedForAddress: false,
        previouslyUsed: true,
      });
    }

    return options.sort((left, right) => {
      if (left.previouslyUsed !== right.previouslyUsed) return left.previouslyUsed ? -1 : 1;
      if (left.recommendedForAddress !== right.recommendedForAddress) {
        return left.recommendedForAddress ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    });
  }, [customerAddress, suggestedTransportName]);

  const selectedTransportOption = useMemo(() => {
    const currentName = String(transportName || "").trim();
    if (!currentName) return null;
    return (
      transportOptions.find(
        (transport) => transport.value.toLowerCase() === currentName.toLowerCase()
      ) || { value: currentName, label: currentName, phone: "", destinations: [] }
    );
  }, [transportName, transportOptions]);
  const orderStatuses = useMemo(
    () => ["ALL", ...new Set(orders.map((order) => order.status).filter(Boolean))],
    [orders]
  );
  const filteredOrders = useMemo(
    () =>
      orderStatusFilter === "ALL"
        ? orders
        : orders.filter((order) => order.status === orderStatusFilter),
    [orderStatusFilter, orders]
  );

  const getOrderQuantityTotals = (order = {}) =>
    (order.items || []).reduce(
      (totals, item) => {
        const pairs = Number(item.qty_ordered || 0);
        const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);
        totals.pairs += pairs;
        if (pairsPerCarton > 0) totals.cartons += pairs / pairsPerCarton;
        return totals;
      },
      { cartons: 0, pairs: 0 }
    );

  const missingCustomerDetails = [
    !customerName.trim() ? "customer name" : null,
    !/^\d{10}$/.test(customerPhone) ? "10 digit phone" : null,
    !/^\d{8,9}$/.test(panNumber) ? "PAN number" : null,
    !customerAddress.trim() ? "delivery address" : null,
    !transportName.trim() ? "transport" : null,
  ].filter(Boolean);
  const customerDetailProgress = 5 - missingCustomerDetails.length;

  const renderOrderItems = (order) => (
    <div className="space-y-1 text-xs">
      {order.items?.length
        ? order.items.map((item) => (
            <p key={item.id}>
              {item.product_name} — {formatNumber(item.qty_ordered)} pairs
              {Number(item.inner_boxes_per_outer_box || 0) > 0
                ? ` / ${formatNumber(Number(item.qty_ordered || 0) / Number(item.inner_boxes_per_outer_box))} CTN`
                : ""}
            </p>
          ))
        : <span>—</span>}
    </div>
  );

  // ─── JSX ──────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow={isAdminOrderEntry ? "Field sales" : undefined}
        title={isAdminOrderEntry ? "Record Customer Order" : "Review & Place Order"}
        description={
          isAdminOrderEntry
            ? "Confirm the products and enter the customer's delivery details."
            : "Complete your order details"
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="rounded-xl bg-white/15 p-2"><Boxes size={20} /></span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-100">Step 1</span>
          </div>
          <p className="mt-4 text-sm font-medium text-indigo-100">Products in cart</p>
          <p className="mt-1 text-2xl font-black">{cart.length} {cart.length === 1 ? "item" : "items"}</p>
          <p className="mt-1 text-xs font-semibold text-indigo-100">{formatNumber(totalCartonsInCart)} CTN · {formatNumber(totalPairsInCart)} pairs</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm ${missingCustomerDetails.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          <div className="flex items-center justify-between">
            <span className={`rounded-xl p-2 ${missingCustomerDetails.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}><UserRound size={20} /></span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">Step 2</span>
          </div>
          <p className="mt-4 text-sm font-medium opacity-70">Customer details</p>
          <p className="mt-1 text-2xl font-black">{customerDetailProgress} / 5 complete</p>
          <p className="mt-1 text-xs font-semibold opacity-70">{missingCustomerDetails.length ? `Still need ${missingCustomerDetails.length} field${missingCustomerDetails.length === 1 ? "" : "s"}` : "Ready to submit"}</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm ${cart.length && !missingCustomerDetails.length ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700"}`}>
          <div className="flex items-center justify-between">
            <span className={`rounded-xl p-2 ${cart.length && !missingCustomerDetails.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><ClipboardCheck size={20} /></span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">Step 3</span>
          </div>
          <p className="mt-4 text-sm font-medium opacity-70">Place order</p>
          <p className="mt-1 text-2xl font-black">{cart.length && !missingCustomerDetails.length ? "Ready" : "Review"}</p>
          <p className="mt-1 text-xs font-semibold opacity-70">{cart.length ? "Confirm quantities and delivery details" : "Add products to begin"}</p>
        </div>
      </div>

      <button
        onClick={() => navigate(catalogPath)}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
      >
        <ArrowLeft size={18} />
        {isAdminOrderEntry ? "Back to Products" : "Continue Shopping"}
      </button>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="text-indigo-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-indigo-900">
          <strong>Important:</strong>{" "}
          {isAdminOrderEntry
            ? "This order will be saved under your admin account for the selected customer."
            : "Your order will be reviewed by an admin before stock is deducted."}
        </div>
      </div>

      {/* CART */}
      <SectionCard
        title={<span className="flex items-center gap-2"><ShoppingCart size={19} /> Cart Summary</span>}
        subtitle="Choose cartons for full-case orders, or pairs when a customer needs a smaller quantity."
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
              onClick={() => navigate(catalogPath)}
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
              const available = getCustomerVisibleStock(item.product);
              const maxQty = hasCartons && item.orderBy === "cartons"
                ? Math.floor(available / cartonsPerBox)
                : available;
              const actualPairs = hasCartons && item.orderBy === "cartons"
                ? Number(item.qty_ordered) * cartonsPerBox
                : Number(item.qty_ordered);

              return (
                <div key={item.finished_good_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Order item</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.product.article_code || item.product.name}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                      onClick={() => removeFromCart(item.finished_good_id)}
                    >
                      <X size={15} /> Remove
                    </button>
                  </div>

                  <div className="flex gap-4 p-4">

                    
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product.image_url ? (
                        <img
                          src={`${APP_BASE_URL}${item.product.image_url}`}
                          alt={item.product.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Package size={28} />
                        </div>
                      )}
                    </div>
                    

                    <div className="flex flex-1 flex-col justify-between gap-3">
                      
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
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">
                            Available: {formatNumber(available)} pairs
                          </span>
                          {hasCartons ? <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-bold text-indigo-800">{formatNumber(Math.floor(available / cartonsPerBox))} full CTN available</span> : null}
                        </div>
                      

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-3">
                          
                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition"
                            onClick={() => updateQty(item.finished_good_id, Number(item.qty_ordered) - 1)}
                          >
                            <Minus size={16} />
                          </button>

                          <div className="min-w-14 rounded-lg bg-slate-100 px-2 py-1 text-center">
                            <div className="text-lg font-black text-slate-900">{item.qty_ordered}</div>
                            <div className="text-[10px] font-bold uppercase text-slate-500">{item.orderBy}</div>
                          </div>

                          <button
                            className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center transition disabled:opacity-50"
                            onClick={() => updateQty(item.finished_good_id, Number(item.qty_ordered) + 1)}
                            disabled={Number(item.qty_ordered) >= maxQty}
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        {hasCartons && (
                          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => setOrderBy(item.finished_good_id, "pairs")}
                              className={`px-2.5 py-1.5 ${item.orderBy === "pairs" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                            >
                              Pairs (less than full carton)
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderBy(item.finished_good_id, "cartons")}
                              disabled={available < cartonsPerBox}
                              className={`border-l border-slate-300 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${item.orderBy === "cartons" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                            >
                              Cartons ({cartonsPerBox})
                            </button>
                          </div>
                        )}

                        {hasCartons && item.orderBy === "cartons" && (
                          <div className="text-sm text-slate-600">
                            = <span className="font-bold text-indigo-600">{formatNumber(actualPairs)}</span> pairs
                          </div>
                        )}
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                          <span className="text-indigo-500">This item</span><br />
                          <span className="text-sm font-black text-indigo-950">{formatNumber(hasCartons ? actualPairs / cartonsPerBox : 0)} CTN</span> / {formatNumber(actualPairs)} pairs
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
              <span className="font-semibold text-indigo-950">Order total</span>
              <div className="flex items-center gap-3 font-bold text-indigo-700">
                <span>{formatNumber(totalCartonsInCart)} CTN</span>
                <span className="text-indigo-300">/</span>
                <span>{formatNumber(totalPairsInCart)} pairs</span>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* CUSTOMER DETAILS */}
      {cart.length > 0 && (
        <SectionCard
          title={<span className="flex items-center gap-2"><UserRound size={19} /> Customer Details</span>}
          subtitle="Saved details are suggestions. Review and edit every field before placing the order."
        >
          {missingCustomerDetails.length ? (
            <div className="mb-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={20} />
              <div>
                <p className="font-bold">Complete the customer details</p>
                <p className="mt-1 text-sm">
                  Still needed: {missingCustomerDetails.join(", ")}. These fields can be edited even when they were filled from saved information.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              <CheckCircle2 size={18} /> Customer details are complete and ready for review.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><UserRound size={15} className="text-indigo-600" /> Customer Name <span className="text-red-500">*</span></span>
              </label>
              <input
                list="user-order-customers"
                className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.customerName ? "border-red-500" : "border-slate-300"}`}
                placeholder="Enter customer name"
                value={customerName}
                onChange={(event) => handleCustomerNameChange(event.target.value)}
                onBlur={applyCustomerHistory}
              />
              <datalist id="user-order-customers">
                {knownCustomers.map((customer) => (
                  <option key={customer.id} value={customer.customer_name} />
                ))}
              </datalist>
              {errors.customerName && <p className="text-red-500 text-sm mt-1">{errors.customerName}</p>}
              {matchingCustomer ? (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold">Suggested customer details</p>
                      <p className="mt-1 text-xs text-indigo-700">
                        {(matchingCustomer.source_labels || ["Saved details"]).join(" + ")}. Review these details before placing the order; every field remains editable.
                      </p>
                      <div className="mt-2 grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2">
                        <span><strong>Phone:</strong> {matchingCustomer.customer_phone || "Not available"}</span>
                        <span><strong>PAN:</strong> {matchingCustomer.pan_number || "Not available"}</span>
                        <span className="sm:col-span-2"><strong>Address:</strong> {matchingCustomer.customer_address || "Not available"}</span>
                        {matchingCustomer.contact_person ? (
                          <span className="sm:col-span-2"><strong>Contact person:</strong> {matchingCustomer.contact_person}</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyCustomerDetails(matchingCustomer, true)}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      Reload saved details
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number <span className="text-red-500">*</span></label>
              <input
                type="tel" maxLength={10}
                className={`w-full rounded-xl border px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors.customerPhone ? "border-red-500" : "border-slate-300"}`}
                placeholder="Enter 10 digit phone number"
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setErrors((current) => ({ ...current, customerPhone: "" })); }}
              />
              {errors.customerPhone ? <p className="mt-1 text-sm text-red-500">{errors.customerPhone}</p> : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">PAN Number <span className="text-red-500">*</span></label>
              <input
                type="text" maxLength={9}
                className={`w-full rounded-xl border px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors.panNumber ? "border-red-500" : "border-slate-300"}`}
                placeholder="Enter 8 or 9 digit PAN number"
                value={panNumber}
                onChange={(e) => { setPanNumber(e.target.value.replace(/\D/g, "").slice(0, 9)); setErrors((current) => ({ ...current, panNumber: "" })); }}
              />
              {errors.panNumber ? <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p> : null}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <span className="flex items-center gap-1.5"><MapPin size={15} className="text-indigo-600" /> Delivery Address <span className="text-red-500">*</span></span>
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
              <label className="block text-sm font-medium text-slate-700 mb-2"><span className="flex items-center gap-1.5"><Truck size={15} className="text-indigo-600" /> Transport Name <span className="text-red-500">*</span></span></label>
              <CreatableSelect
                isClearable
                options={transportOptions}
                value={selectedTransportOption}
                placeholder="Select or type a transport company..."
                formatCreateLabel={(value) => `Use new transport: ${value}`}
                noOptionsMessage={() => "Type a new transport name"}
                onChange={(option) => { setTransportName(option?.value || ""); setErrors((current) => ({ ...current, transportName: "" })); }}
                formatOptionLabel={(option, meta) =>
                  meta.context === "value" ? (
                    option.label
                  ) : (
                    <div className="py-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                        <span>{option.label}</span>
                        {option.previouslyUsed ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                            Previously used
                          </span>
                        ) : null}
                        {option.recommendedForAddress ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                            Serves destination
                          </span>
                        ) : null}
                      </div>
                      {option.phone || option.destinations?.length ? (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {option.phone ? `${option.phone} · ` : ""}
                          {(option.destinations || []).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                styles={{
                  control: (base, state) => ({
                    ...base,
                    minHeight: "50px",
                    borderRadius: "0.75rem",
                    borderColor: state.isFocused ? "#6366f1" : "#cbd5e1",
                    boxShadow: state.isFocused ? "0 0 0 2px #c7d2fe" : base.boxShadow,
                    ":hover": { borderColor: state.isFocused ? "#6366f1" : "#94a3b8" },
                  }),
                  menu: (base) => ({ ...base, zIndex: 50 }),
                }}
              />
              {errors.transportName ? <p className="mt-1.5 text-sm text-red-500">{errors.transportName}</p> : null}
              {suggestedTransportName ? (
                <p className="mt-1.5 text-xs text-indigo-700">
                  Previously used for this customer: {suggestedTransportName}
                </p>
              ) : null}
              {selectedTransportOption?.phone ? (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-800">Phone:</span>{" "}
                  {selectedTransportOption.phone}
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="font-semibold text-slate-800">Destinations:</span>{" "}
                  {selectedTransportOption.destinations.join(", ")}
                </div>
              ) : null}
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
               {/* SUBMIT */}
      {cart.length > 0 && (
        <div className="flex justify-around padding-y-5 gap-3">
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
        </SectionCard>
        

      )}

      {/* ORDERS TABLE */}
      <SectionCard title="My Orders" subtitle="Search any detail below, or filter quickly by order status.">
        {loadingOrders ? (
          <div className="py-10 text-center text-slate-500">Loading orders...</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {orderStatuses.map((status) => {
                const count =
                  status === "ALL"
                    ? orders.length
                    : orders.filter((order) => order.status === status).length;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setOrderStatusFilter(status)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      orderStatusFilter === status
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                    }`}
                  >
                    {status === "ALL" ? "All orders" : status.replaceAll("_", " ")} ({count})
                  </button>
                );
              })}
            </div>
            <DataTable
              columns={[
                { key: "id", label: "Order ID", render: (row) => `#${row.id}` },
                { key: "customer_name", label: "Customer" },
                {
                  key: "customer_details",
                  label: "Customer Details",
                  searchValue: (row) => [row.customer_phone, row.pan_number, row.customer_address].filter(Boolean).join(" "),
                  render: (row) => {
                    const missing = [
                      !/^\d{10}$/.test(String(row.customer_phone || "")) ? "Phone" : null,
                      !/^\d{8,9}$/.test(String(row.pan_number || "")) ? "PAN" : null,
                      !String(row.customer_address || "").trim() ? "Address" : null,
                    ].filter(Boolean);
                    return (
                      <div className="min-w-[190px] space-y-1 text-xs">
                        <p><strong>Phone:</strong> {row.customer_phone || "—"}</p>
                        <p><strong>PAN:</strong> {row.pan_number || "—"}</p>
                        <p className="whitespace-normal"><strong>Address:</strong> {row.customer_address || "—"}</p>
                        {missing.length ? (
                          <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">
                            Missing: {missing.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    );
                  },
                },
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
                {
                  key: "delivery_notes",
                  label: "DN Number",
                  render: (row) => {
                    const notes = [
                      ...(Array.isArray(row.warehouse_delivery_note_numbers)
                        ? row.warehouse_delivery_note_numbers
                        : []),
                      row.delivery_note_number,
                    ].filter(Boolean);
                    const uniqueNotes = [...new Set(notes)];
                    return uniqueNotes.length ? (
                      <div className="max-w-40 whitespace-normal text-xs font-semibold text-slate-700">
                        {uniqueNotes.join(", ")}
                      </div>
                    ) : (
                      <span className="text-slate-400">Not assigned</span>
                    );
                  },
                },
                { key: "items", label: "Items", render: renderOrderItems },
                {
                  key: "quantity_summary",
                  label: "Quantity",
                  searchable: false,
                  render: (row) => {
                    const totals = getOrderQuantityTotals(row);
                    return (
                      <div className="min-w-[110px] rounded-lg bg-indigo-50 px-2.5 py-2 text-xs">
                        <p className="font-bold text-indigo-900">{formatNumber(totals.cartons)} CTN</p>
                        <p className="text-indigo-700">{formatNumber(totals.pairs)} pairs</p>
                      </div>
                    );
                  },
                  exportValue: (row) => {
                    const totals = getOrderQuantityTotals(row);
                    return `${formatNumber(totals.cartons)} CTN / ${formatNumber(totals.pairs)} pairs`;
                  },
                },
                 {
              key: "created_at",
              label: "Created",
              render: (row) => {
  return (
    <div className="flex flex-col">
      <strong>
        {formatEnglishDate(row.created_at, { includeTime: false })}
      </strong>

      <span className="text-xs text-slate-500">
        BS {formatNepaliDate(row.created_at)}
      </span>
      <span className="text-xs text-slate-500">
        {formatTime(row.created_at)}
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
    const deliveryNoteNumber = row.delivery_note_number || "-";

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
              rows={filteredOrders}
              exportFilename="my-orders"
              wrapCells
              responsiveScroll
              minTableWidth={1200}
            />
          </>
        )}
      </SectionCard>

      {/* SUBMIT */}
      {/* {cart.length > 0 && (
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
      )} */}
    </div>
  );
}
