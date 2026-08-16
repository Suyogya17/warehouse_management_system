import { useCallback, useEffect, useMemo, useState } from "react";  
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { formatEnglishDate, formatNepaliDate, formatNumber, formatTime } from "../utils/format";
import { hasRole } from "../utils/roles";
import Select from "react-select";
import { Search } from "lucide-react";

const initialForm = {
  customer_name: "",
  customer_phone: "",
  customer_address: "",
  pan_number: "",
  transport_name: "",
  notes: "",
  items: [{ finished_good_id: "", carton_qty: 1, qty_ordered: 0 }],
};

const emptyOrderDateFilters = {
  date_from: "",
  date_to: "",
  bs_date_from: "",
  bs_date_to: "",
  fiscal_year: "",
};

const statusTone = {
  PENDING: "warning",
  CONFIRMED: "info",
  PACKED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
  "PARTIALLY DELIVERED": "warning",
};

const PRINTABLE_DELIVERY_STATUSES = ["CONFIRMED", "PACKED", "DELIVERED"];
const CANCELLATION_OPTIONS = [
  { value: "DUPLICATE_ORDER", label: "Duplicate order" },
  { value: "CUSTOMER_CHANGED_MIND", label: "Customer changed mind" },
  {
    value: "INCORRECT_PRODUCT_OR_QUANTITY",
    label: "Incorrect product or quantity",
  },
  { value: "INSUFFICIENT_STOCK", label: "Insufficient stock" },
  { value: "PRICING_ISSUE", label: "Pricing issue" },
  { value: "DELIVERY_ISSUE", label: "Delivery issue" },
  { value: "OTHER", label: "Other" },
];
const cancellationLabel = (value) =>
  CANCELLATION_OPTIONS.find((option) => option.value === value)?.label ||
  "Other";
const normalizePartyKey = (value) =>
  String(value || "").trim().toLowerCase().replace(/[\s._-]+/g, "");
const ORDER_CORRECTION_CO_ADMINS = new Set([
  "suyogya shrestha",
  "suyogya shresth",
  "hirdaya shrestha",
]);
const ORDER_CORRECTION_CO_ADMIN_EMAILS = new Set([
  "kingarna@nepcha.com",
]);

const canUseOrderCorrection = (user = {}) =>
  String(user.role || "").toUpperCase() === "CO_ADMIN" &&
  (ORDER_CORRECTION_CO_ADMINS.has(
    String(user.name || "").trim().replace(/\s+/g, " ").toLowerCase()
  ) ||
    ORDER_CORRECTION_CO_ADMIN_EMAILS.has(
      String(user.email || "").trim().toLowerCase()
    ));

export default function OrdersPage() {
  const [orderSearch, setOrderSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManageOrders = hasRole(user?.role, ["ADMIN", "CO_ADMIN"]);
  const canCorrectOrders = canUseOrderCorrection(user);
  const canCorrectWarehouseSource =
    String(user?.role || "").toUpperCase() === "ADMIN" || canCorrectOrders;
  const [orders, setOrders] = useState([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPagination, setOrderPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    total_pages: 1,
  });
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
  const [availability, setAvailability] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dealerFilter, setDealerFilter] = useState(null);
  const [partyFilter, setPartyFilter] = useState(null);
  const [orderFilterOptions, setOrderFilterOptions] = useState({
    dealers: [],
    parties: [],
  });
  const [orderDateFilters, setOrderDateFilters] = useState(emptyOrderDateFilters);
  const [appliedOrderDateFilters, setAppliedOrderDateFilters] = useState(
    emptyOrderDateFilters
  );
  const [correctionOrder, setCorrectionOrder] = useState(null);
  const [correctionItems, setCorrectionItems] = useState([]);
  const [correctionReason, setCorrectionReason] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancellationCode, setCancellationCode] = useState("DUPLICATE_ORDER");
  const [cancellationReason, setCancellationReason] = useState("");
  const [duplicateOfOrderId, setDuplicateOfOrderId] = useState("");
  const [savingCancellation, setSavingCancellation] = useState(false);
  const [expandedWarehouseOrders, setExpandedWarehouseOrders] = useState(
    () => new Set()
  );
  const [deliveringWarehouseKey, setDeliveringWarehouseKey] = useState("");
  const [verifyingWarehouseKey, setVerifyingWarehouseKey] = useState("");
  const [reversingWarehouseKey, setReversingWarehouseKey] = useState("");
  const [correctingDnOrderId, setCorrectingDnOrderId] = useState(null);
  const [verificationWarehouse, setVerificationWarehouse] = useState(null);
  const [verificationItems, setVerificationItems] = useState([]);
  const [suggestedTransportName, setSuggestedTransportName] = useState("");
  const [lockedOrderDetails, setLockedOrderDetails] = useState(null);
  const [lockedOrderHistory, setLockedOrderHistory] = useState([]);
  const [loadingLockedOrderHistory, setLoadingLockedOrderHistory] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedOrderSearch(orderSearch.trim());
      setOrderPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [orderSearch]);

  const loadOrders = useCallback(async () => {
    const result = await api.getOrders(token, {
      page: orderPage,
      per_page: 50,
      search: debouncedOrderSearch,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      created_by: dealerFilter?.value,
      customer_key: partyFilter?.value,
      ...appliedOrderDateFilters,
    });
    setOrders(result.data || []);
    setOrderPagination(
      result.pagination || {
        page: orderPage,
        per_page: 50,
        total: (result.data || []).length,
        total_pages: 1,
      }
    );
  }, [appliedOrderDateFilters, dealerFilter?.value, debouncedOrderSearch, orderPage, partyFilter?.value, statusFilter, token]);

  const applyOrderDateFilters = () => {
    const normalized = {
      ...orderDateFilters,
      fiscal_year: orderDateFilters.fiscal_year.trim().replace("-", "/"),
    };
    const bsDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (
      (normalized.bs_date_from && !bsDatePattern.test(normalized.bs_date_from)) ||
      (normalized.bs_date_to && !bsDatePattern.test(normalized.bs_date_to))
    ) {
      showToast({
        tone: "error",
        title: "Invalid Nepali date",
        message: "Enter Nepali dates as YYYY-MM-DD, for example 2083-04-27.",
      });
      return;
    }
    if (
      normalized.fiscal_year &&
      !/^\d{4}\/\d{2}$/.test(normalized.fiscal_year)
    ) {
      showToast({
        tone: "error",
        title: "Invalid fiscal year",
        message: "Enter the fiscal year as 2083/84.",
      });
      return;
    }
    if (normalized.date_from && normalized.date_to && normalized.date_from > normalized.date_to) {
      showToast({
        tone: "error",
        title: "Invalid English date range",
        message: "The From date cannot be after the To date.",
      });
      return;
    }
    if (
      normalized.bs_date_from &&
      normalized.bs_date_to &&
      normalized.bs_date_from > normalized.bs_date_to
    ) {
      showToast({
        tone: "error",
        title: "Invalid Nepali date range",
        message: "The BS From date cannot be after the BS To date.",
      });
      return;
    }
    setOrderDateFilters(normalized);
    setAppliedOrderDateFilters(normalized);
    setOrderPage(1);
  };

  const clearOrderDateFilters = () => {
    setOrderDateFilters(emptyOrderDateFilters);
    setAppliedOrderDateFilters(emptyOrderDateFilters);
    setOrderPage(1);
  };

  const clearAllOrderFilters = () => {
    setOrderSearch("");
    setDebouncedOrderSearch("");
    setDealerFilter(null);
    setPartyFilter(null);
    setStatusFilter("ALL");
    setOrderDateFilters(emptyOrderDateFilters);
    setAppliedOrderDateFilters(emptyOrderDateFilters);
    setOrderPage(1);
  };

  const loadReferenceData = useCallback(async () => {
    const [availabilityResult, warehouseResult, orderFiltersResult] = await Promise.all([
      api.getAvailability(token, {
        include_hidden: canManageOrders ? 1 : undefined,
      }),
      api.getWarehouses(token),
      api.getOrderFilters(token),
    ]);
    setAvailability(availabilityResult.data || []);
    setWarehouses(warehouseResult.data || []);
    setOrderFilterOptions(orderFiltersResult.data || { dealers: [], parties: [] });
  }, [canManageOrders, token]);

  const load = useCallback(
    () => Promise.all([loadOrders(), loadReferenceData()]),
    [loadOrders, loadReferenceData]
  );

  useEffect(() => {
    loadOrders().catch(console.error);
  }, [loadOrders]);

  useEffect(() => {
    loadReferenceData().catch(console.error);
  }, [loadReferenceData]);

  useEffect(() => {
    if (orderPage > Number(orderPagination.total_pages || 1)) {
      setOrderPage(Number(orderPagination.total_pages || 1));
    }
  }, [orderPage, orderPagination.total_pages]);

  useDataRefresh(load, "orders");

  const availabilityById = useMemo(
    () => new Map(availability.map((item) => [String(item.id), item])),
    [availability]
  );

  const createOrderTotals = useMemo(
    () =>
      form.items.reduce(
        (totals, item) =>
          item.finished_good_id
            ? {
                cartons: totals.cartons + Number(item.carton_qty || 0),
                pairs: totals.pairs + Number(item.qty_ordered || 0),
              }
            : totals,
        { cartons: 0, pairs: 0 }
      ),
    [form.items]
  );

  const knownPartiesForCurrentUser = useMemo(() => {
    return (orderFilterOptions.parties || []).filter(
      (party) => String(party.dealer_id) === String(user?.id)
    );
  }, [orderFilterOptions.parties, user?.id]);

  const applyKnownPartySuggestion = useCallback(() => {
    const enteredKey = normalizePartyKey(form.customer_name);
    const knownParty = knownPartiesForCurrentUser.find(
      (party) => party.key === enteredKey
    );
    const transportSuggestion = String(knownParty?.transport_name || "").trim();

    setSuggestedTransportName(transportSuggestion);
    if (!knownParty) return;

    setForm((current) => ({
      ...current,
      customer_name: knownParty.name || current.customer_name,
      transport_name:
        !String(current.transport_name || "").trim() && transportSuggestion
          ? transportSuggestion
          : current.transport_name,
    }));
  }, [form.customer_name, knownPartiesForCurrentUser]);

  const totals = useMemo(
    () =>
      availability.reduce(
        (acc, item) => {
          acc.physical += Number(item.physical_stock || 0);
          acc.reserved += Number(item.reserved_qty || 0);
          acc.available += Number(item.available_qty || 0);
          return acc;
        },
        { physical: 0, reserved: 0, available: 0 }
      ),
    [availability]
  );

  const updateOrderItemProduct = (index, productId) => {
    const selected = availabilityById.get(String(productId));
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const cartons = Math.max(1, Number(item.carton_qty || 1));
        const pairsPerCarton = Number(selected?.inner_boxes_per_outer_box || 0);
        return {
          ...item,
          finished_good_id: productId,
          carton_qty: cartons,
          qty_ordered: pairsPerCarton > 0 ? cartons * pairsPerCarton : 0,
        };
      }),
    }));
  };

  const updateOrderItemCartons = (index, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const selected = availabilityById.get(String(item.finished_good_id));
        const pairsPerCarton = Number(selected?.inner_boxes_per_outer_box || 0);
        const cartons = value === "" ? "" : Math.max(1, Math.floor(Number(value) || 1));
        return {
          ...item,
          carton_qty: cartons,
          qty_ordered:
            cartons !== "" && pairsPerCarton > 0
              ? Number(cartons) * pairsPerCarton
              : 0,
        };
      }),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const invalidItem = form.items.find((item) => {
        const product = availabilityById.get(String(item.finished_good_id));
        return (
          !product ||
          Number(product.inner_boxes_per_outer_box || 0) <= 0 ||
          !Number.isInteger(Number(item.carton_qty)) ||
          Number(item.carton_qty) < 1
        );
      });
      if (invalidItem) {
        showToast({
          tone: "error",
          title: "Complete the product quantity",
          message: "Select a product with a valid pairs-per-CTN setting and enter at least 1 whole CTN.",
        });
        return;
      }
      const payload = {
        ...form,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        customer_address: form.customer_address.trim(),
        pan_number: form.pan_number.trim(),
        transport_name: form.transport_name.trim(),
        notes: form.notes.trim(),
        items: form.items.map((item) => ({
          finished_good_id: Number(item.finished_good_id),
          qty_ordered:
            Number(item.carton_qty) *
            Number(
              availabilityById.get(String(item.finished_good_id))
                ?.inner_boxes_per_outer_box || 0
            ),
        })),
      };
      try {
        await api.createOrder(payload, token);
      } catch (error) {
        if (
          error.status !== 409 ||
          error.data?.code !== "POTENTIAL_DUPLICATE_ORDER"
        ) {
          throw error;
        }
        const duplicate = error.data?.duplicates?.[0];
        const confirmed = window.confirm(
          [
            "Possible duplicate order detected.",
            duplicate
              ? `Order #${duplicate.id} for ${duplicate.customer_name} already has the same products and quantities.`
              : "A recent order already has the same customer, products and quantities.",
            duplicate?.created_by_name
              ? `Created by: ${duplicate.created_by_name}`
              : null,
            "Create another order anyway?",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        if (!confirmed) return;
        await api.createOrder({ ...payload, confirm_duplicate: true }, token);
      }
      setForm(initialForm);
      setSuggestedTransportName("");
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order reserved", message: "Available stock was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Order failed", message: error.message });
    }
  };

  const changeStatus = async (orderId, status, cancellation = {}) => {
    try {
      await api.updateOrderStatus(
        orderId,
        {
          status,
          ...(status === "CANCELLED" ? cancellation : {}),
        },
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order updated", message: `Order marked ${status.toLowerCase()}.` });
      return true;
    } catch (error) {
      showToast({ tone: "error", title: "Order update failed", message: error.message });
      return false;
    }
  };

  const checkWarehouseProducts = (order, fulfillment) => {
    const pendingItems = (fulfillment.items || []).filter(
      (item) => item.allocation_status === "PLANNED"
    );
    if (!pendingItems.length) {
      showToast({
        tone: "error",
        title: "Nothing pending",
        message: "This warehouse slip has no products waiting for delivery.",
      });
      return;
    }
    setVerificationWarehouse({ order, fulfillment });
    setVerificationItems(
      pendingItems.map((item) => {
        const planned = Number(item.quantity || 0);
        const savedStatus = ["DELIVER_LATER", "NOT_FOUND", "OUT_OF_STOCK"].includes(
          item.verification_status
        )
          ? item.verification_status
          : "DELIVER_LATER";
        let foundQuantity =
          item.verified_quantity === null || item.verified_quantity === undefined
            ? planned
            : Number(item.verified_quantity);
        // Repair an older inconsistent check where NOT_FOUND was saved while
        // the verified quantity still equalled the complete planned quantity.
        if (savedStatus === "NOT_FOUND" && foundQuantity >= planned) {
          foundQuantity = 0;
        }
        return {
          ...item,
          deliver_quantity: foundQuantity,
          remainder_action: savedStatus,
          target_warehouse_id: "",
          note: item.verification_note || "",
        };
      })
    );
  };

  const updateVerificationItem = (allocationId, key, value) => {
    setVerificationItems((current) =>
      current.map((item) =>
        Number(item.allocation_id) === Number(allocationId)
          ? {
              ...item,
              [key]: value,
              ...(key === "deliver_quantity" &&
              Number(value) >= Number(item.quantity || 0)
                ? {
                    remainder_action: "DELIVER_LATER",
                    target_warehouse_id: "",
                  }
                : {}),
            }
          : item
      )
    );
  };

  const setVerificationItemAction = (allocationId, action) => {
    setVerificationItems((current) =>
      current.map((item) => {
        if (Number(item.allocation_id) !== Number(allocationId)) return item;
        if (action === "ALL_FOUND") {
          return {
            ...item,
            deliver_quantity: Number(item.quantity || 0),
            remainder_action: "DELIVER_LATER",
            target_warehouse_id: "",
          };
        }
        return {
          ...item,
          deliver_quantity: 0,
          remainder_action: action,
          target_warehouse_id:
            action === "FOUND_OTHER_WAREHOUSE"
              ? item.target_warehouse_id || ""
              : "",
        };
      })
    );
  };

  const submitWarehouseVerification = async (event) => {
    event.preventDefault();
    if (!verificationWarehouse) return;
    const { order, fulfillment } = verificationWarehouse;
    const invalidItem = verificationItems.find((item) => {
      const quantity = Number(item.deliver_quantity);
      return !Number.isFinite(quantity) || quantity < 0 || quantity > Number(item.quantity);
    });
    if (invalidItem) {
      showToast({
        tone: "error",
        title: "Invalid quantity",
        message: `Check the deliver-now quantity for ${invalidItem.product_name}.`,
      });
      return;
    }
    const invalidWarehouseMove = verificationItems.find(
      (item) =>
        item.remainder_action === "FOUND_OTHER_WAREHOUSE" &&
        Number(item.quantity || 0) - Number(item.deliver_quantity || 0) > 0.001 &&
        (!Number(item.target_warehouse_id) ||
          Number(item.target_warehouse_id) ===
            Number(verificationWarehouse.fulfillment.warehouse_id))
    );
    if (invalidWarehouseMove) {
      showToast({
        tone: "error",
        title: "Destination warehouse required",
        message: `Select where ${invalidWarehouseMove.product_name} was found.`,
      });
      return;
    }

    const warehouseKey = `${order.id}:${fulfillment.warehouse_id}`;
    setVerifyingWarehouseKey(warehouseKey);
    try {
      const result = await api.verifyOrderWarehouse(
        order.id,
        fulfillment.warehouse_id,
        verificationItems.map((item) => ({
          allocation_id: Number(item.allocation_id),
          deliver_quantity: Number(item.deliver_quantity),
          remainder_action: item.remainder_action,
          target_warehouse_id: Number(item.target_warehouse_id) || null,
          note: item.note.trim(),
        })),
        token
      );
      setVerificationWarehouse(null);
      setVerificationItems([]);
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Product check saved",
        message: result.message,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Product check failed",
        message: error.message,
      });
    } finally {
      setVerifyingWarehouseKey("");
    }
  };

  const deliverWarehouse = async (order, fulfillment) => {
    const pendingItems = (fulfillment.items || []).filter(
      (item) => item.allocation_status === "PLANNED"
    );
    if (!pendingItems.length) return;
    if (pendingItems.some((item) => !item.verified_at || item.verified_quantity === null)) {
      showToast({
        tone: "error",
        title: "Check products first",
        message: "Save the physical product check before delivery.",
      });
      return;
    }
    const readyPairs = pendingItems.reduce(
      (sum, item) => sum + Number(item.verified_quantity || 0),
      0
    );
    const outOfStockPairs = pendingItems.reduce(
      (sum, item) =>
        item.verification_status === "OUT_OF_STOCK"
          ? sum + Math.max(0, Number(item.quantity || 0) - Number(item.verified_quantity || 0))
          : sum,
      0
    );
    if (readyPairs <= 0 && outOfStockPairs <= 0) {
      showToast({
        tone: "error",
        title: "Nothing ready",
        message: "No product is ready to deliver or close as out of stock.",
      });
      return;
    }
    const confirmed = window.confirm(
      [
        readyPairs > 0
          ? `Deliver verified products from ${fulfillment.warehouse_slip_number}?`
          : `Close ${fulfillment.warehouse_slip_number} as out of stock?`,
        `${formatNumber(readyPairs)} pairs will be deducted from stock.`,
        outOfStockPairs > 0
          ? `${formatNumber(outOfStockPairs)} missing pairs will be closed as out of stock without stock deduction.`
          : null,
        "Products marked Deliver later or Not found will remain pending.",
      ].filter(Boolean).join("\n\n")
    );
    if (!confirmed) return;

    const warehouseKey = `${order.id}:${fulfillment.warehouse_id}`;
    setDeliveringWarehouseKey(warehouseKey);
    try {
      const result = await api.deliverOrderWarehouse(
        order.id,
        fulfillment.warehouse_id,
        pendingItems.map((item) => ({
          allocation_id: Number(item.allocation_id),
          deliver_quantity: Number(item.verified_quantity || 0),
          remainder_action: ["DELIVER_LATER", "NOT_FOUND", "OUT_OF_STOCK"].includes(item.verification_status)
            ? item.verification_status
            : "DELIVER_LATER",
          note: item.verification_note || "",
        })),
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Warehouse products delivered",
        message: result.message,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Warehouse delivery failed",
        message: error.message,
      });
    } finally {
      setDeliveringWarehouseKey("");
    }
  };

  const undoWarehouseDelivery = async (order, fulfillment) => {
    const reason = window.prompt(
      [
        `Undo delivery of ${fulfillment.warehouse_slip_number}?`,
        `${fulfillment.name}: ${formatNumber(fulfillment.cartons)} CTN / ${formatNumber(fulfillment.pairs)} pairs`,
        "Stock will be restored and the original delivery movement will remain in history with a reversal entry.",
        "Enter the correction reason:",
      ].join("\n\n")
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why this warehouse delivery must be reversed.",
      });
      return;
    }

    const warehouseKey = `${order.id}:${fulfillment.warehouse_id}`;
    setReversingWarehouseKey(warehouseKey);
    try {
      const result = await api.undoOrderWarehouseDelivery(
        order.id,
        fulfillment.warehouse_id,
        reason.trim(),
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Warehouse delivery reversed",
        message: result.message,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not reverse delivery",
        message: error.message,
      });
    } finally {
      setReversingWarehouseKey("");
    }
  };

  const toggleWarehouseSlips = (orderId) => {
    setExpandedWarehouseOrders((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const openCancellation = (order) => {
    setCancelOrder(order);
    setCancellationCode("DUPLICATE_ORDER");
    setCancellationReason("");
    setDuplicateOfOrderId("");
  };

  const submitCancellation = async (event) => {
    event.preventDefault();
    if (!cancelOrder) return;

    const reason =
      cancellationReason.trim() || cancellationLabel(cancellationCode);
    setSavingCancellation(true);
    try {
      const saved = await changeStatus(cancelOrder.id, "CANCELLED", {
        cancellation_code: cancellationCode,
        cancellation_reason: reason,
        ...(cancellationCode === "DUPLICATE_ORDER" &&
        Number(duplicateOfOrderId) > 0
          ? { duplicate_of_order_id: Number(duplicateOfOrderId) }
          : {}),
      });
      if (saved) setCancelOrder(null);
    } finally {
      setSavingCancellation(false);
    }
  };

  const assignDeliveryNote = async (order) => {
    try {
      const result = await api.assignOrderDeliveryNote(order.id, token);
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Delivery note assigned",
        message: result.message || `A delivery-note number was assigned to Order #${order.id}.`,
      });
    } catch (error) {
      showToast({ tone: "error", title: "Could not assign DN", message: error.message });
    }
  };

  const correctWarehouseDeliveryNotes = async (order) => {
    const reason = window.prompt(
      `Why are you correcting the warehouse DNs for Order #${order.id}?\n\nThis is allowed only before packing, printing, or delivery.`
    );
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why these DN numbers need correction.",
      });
      return;
    }
    const existingNumbers = (order.warehouse_delivery_note_numbers || []).join(
      ", "
    );
    if (
      !window.confirm(
        `Correct ${existingNumbers || "these warehouse DNs"}?\n\nAny previously printed copies will become INVALID and must be destroyed or clearly marked invalid. This is allowed only before packing or delivery.`
      )
    ) {
      return;
    }

    setCorrectingDnOrderId(Number(order.id));
    try {
      const result = await api.correctOrderWarehouseDeliveryNotes(
        order.id,
        trimmedReason,
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Warehouse DNs corrected",
        message: result.message,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not correct DNs",
        message: error.message,
      });
    } finally {
      setCorrectingDnOrderId(null);
    }
  };

  const reopenPacking = async (order) => {
    const reason = window.prompt(
      `Why are you reopening packing for Order #${order.id}?\n\nThe existing delivery note number will remain unchanged.`
    );
    if (reason === null) return false;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why this packed order needs to be corrected.",
      });
      return false;
    }

    try {
      const result = await api.reopenOrderPacking(order.id, trimmedReason, token);
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Packing reopened",
        message: result.message || `${order.delivery_note_number || "Delivery note"} was preserved. You can now correct CTN.`,
      });
      return true;
    } catch (error) {
      showToast({ tone: "error", title: "Could not reopen packing", message: error.message });
      return false;
    }
  };

  const reopenFromVerification = async () => {
    if (!verificationWarehouse) return;
    const order = verificationWarehouse.order;
    setVerificationWarehouse(null);
    setVerificationItems([]);
    const reopened = await reopenPacking(order);
    if (reopened) openCorrection({ ...order, status: "CONFIRMED" });
  };

  const undoConfirmation = async (order) => {
    const reason = window.prompt(
      `Why are you returning Order #${order.id} to pending?\n\nReserved stock will remain. ${order.delivery_note_number || "The assigned delivery note"} will be reclaimed only if it is the latest DN and has never been prepared, printed, packed, or delivered.`
    );
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why this confirmed order must return to pending.",
      });
      return;
    }

    try {
      const result = await api.undoOrderConfirmation(
        order.id,
        trimmedReason,
        token
      );
      await load();
      announceDataRefresh("orders");
      showToast({
        tone: "success",
        title: "Confirmation undone",
        message:
          result.message ||
          `Order #${order.id} is pending and its reserved stock was preserved.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not undo confirmation",
        message: error.message,
      });
    }
  };

  const openLockedOrderDetails = async (order) => {
    setLockedOrderDetails(order);
    setLockedOrderHistory([]);
    setLoadingLockedOrderHistory(true);
    try {
      const result = await api.getActivityLogs(token, {
        module: "orders",
        entity_id: order.id,
        page: 1,
        limit: 100,
      });
      setLockedOrderHistory(result.data || []);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Order history unavailable",
        message: error.message || "Could not load this order's activity history.",
      });
    } finally {
      setLoadingLockedOrderHistory(false);
    }
  };

  const openCorrection = (order) => {
    setCorrectionOrder(order);
    setCorrectionReason("");
    setCorrectionItems((order.items || []).map((item) => ({
      finished_good_id: String(item.finished_good_id),
      carton_qty: Number(item.inner_boxes_per_outer_box) > 0
        ? Number(item.qty_ordered || 0) / Number(item.inner_boxes_per_outer_box)
        : "",
    })));
  };

  const saveCorrection = async (event) => {
    event.preventDefault();
    if (!correctionOrder) return;
    setSavingCorrection(true);
    try {
      await api.correctOrderItems(correctionOrder.id, {
        reason: correctionReason.trim(),
        items: correctionItems.map((item) => ({
          finished_good_id: Number(item.finished_good_id),
          carton_qty: Number(item.carton_qty),
        })),
      }, token);
      setCorrectionOrder(null);
      setCorrectionItems([]);
      setCorrectionReason("");
      await load();
      announceDataRefresh("orders");
      showToast({ tone: "success", title: "Order corrected", message: "Reserved stock was recalculated automatically." });
    } catch (error) {
      showToast({ tone: "error", title: "Correction failed", message: error.message });
    } finally {
      setSavingCorrection(false);
    }
  };

  const renderOrderItems = (order) => {
    const items = order.items || [];
    const warehouseFulfillments = order.warehouse_fulfillments || [];
    const totalPairs = items.reduce(
      (sum, item) => sum + Number(item.qty_ordered || 0),
      0
    );
    const totalCartons = items.reduce((sum, item) => {
      const pairs = Number(item.qty_ordered || 0);
      const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);
      return pairsPerCarton > 0 ? sum + pairs / pairsPerCarton : sum;
    }, 0);
    const cartonLabel = Number.isInteger(totalCartons)
      ? formatNumber(totalCartons)
      : totalCartons.toLocaleString(undefined, { maximumFractionDigits: 2 });

    if (warehouseFulfillments.length) {
      return (
        <div className="min-w-[420px] space-y-2.5">
          <div className="space-y-2">
            {warehouseFulfillments.map((fulfillment) => {
              const dnNumber =
                fulfillment.delivery_note_number ||
                fulfillment.warehouse_slip_number ||
                "DN pending";
              const fulfillmentCartons = Number(fulfillment.cartons || 0);
              const fulfillmentCartonLabel = Number.isInteger(fulfillmentCartons)
                ? formatNumber(fulfillmentCartons)
                : fulfillmentCartons.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  });

              return (
                <div
                  key={`${order.id}:${fulfillment.warehouse_id}:${dnNumber}`}
                  className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white"
                >
                  <div className="border-b-2 border-slate-400 bg-slate-200 px-3 py-2">
                    <p className="font-black text-slate-950">{dnNumber}</p>
                    <p className="text-[11px] font-bold text-slate-700">
                      {fulfillment.name || "Warehouse"}
                    </p>
                  </div>
                  <div className="space-y-1.5 px-3 py-2.5">
                    {(fulfillment.items || []).length ? (
                      fulfillment.items.map((item) => (
                        <div
                          key={item.allocation_id || `${item.finished_good_id}:${item.quantity}`}
                          className="text-xs font-semibold leading-5 text-slate-950"
                        >
                          {item.finished_good_id} - {item.article_code || item.product_name} - {formatNumber(item.quantity)} {item.unit || "pairs"}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs font-semibold italic text-slate-600">
                        {fulfillment.status === "REASSIGNED"
                          ? "Items reassigned to another DN"
                          : "No active items"}
                      </p>
                    )}
                  </div>
                  <div className="border-t-2 border-slate-400 bg-slate-100 px-3 py-2 text-xs font-black text-slate-950">
                    {fulfillmentCartonLabel} CTN / {formatNumber(fulfillment.pairs || 0)} pairs
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-800">
            Overall order: {cartonLabel} CTN
            <span className="ml-1 font-medium text-indigo-600">
              / {formatNumber(totalPairs)} pairs
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-x-1.5 leading-5">
            <span>{item.finished_good_id}</span>
            <span>- {item.product_name}</span>
            <span>- {formatNumber(item.qty_ordered)} {item.unit}</span>
          </div>
        ))}
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-800">
          Total ordered: {cartonLabel} CTN
          <span className="ml-1 font-medium text-indigo-600">
            / {formatNumber(totalPairs)} pairs
          </span>
        </div>
      </div>
    );
  };

  const filteredOrders = orders;

  const filteredAvailability = useMemo(() => {
    return availability.filter((item) => {
      const query = stockSearch.toLowerCase();
      return (
        item.name?.toLowerCase().includes(query) ||
        item.article_code?.toLowerCase().includes(query) ||
        item.color?.toLowerCase().includes(query)
      );
    });
  }, [availability, stockSearch]);

  const deliveryNoteNumbersByOrderId = useMemo(() => {
  return new Map(
    orders
      .filter((order) => order.delivery_note_number)
      .map((order) => [Number(order.id), order.delivery_note_number])
  );
}, [orders]);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formatPrintNumber = (value) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const printDeliveryNote = async (order = {}) => {
    const printWindow = window.open("", "_blank", "width=1000,height=760");

    if (!printWindow) {
      showToast({
        tone: "error",
        title: "Print blocked",
        message: "Allow popups for this site and try printing again.",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><body style="font-family:Arial;padding:40px;text-align:center"><h2>Preparing warehouse delivery note…</h2><p>Please wait while the warehouse quantities are fixed.</p></body></html>`);
    printWindow.document.close();

    let preparedOrder;
    try {
      const prepared = await api.prepareOrderDeliveryNote(order.id, token);
      preparedOrder = prepared.data;
    } catch (error) {
      printWindow.close();
      const shortages = Array.isArray(error.data?.shortages)
        ? error.data.shortages
        : [];
      const shortageDetails = shortages
        .map((shortage) => {
          const required = Number(
            shortage.ordered_qty ?? shortage.requested ?? 0
          );
          const available = Number(
            shortage.warehouse_stock ?? shortage.available ?? 0
          );
          return `${shortage.product_name || "Product"}: requires ${formatNumber(required)} pairs, ${formatNumber(available)} pairs can currently be allocated`;
        })
        .join(" · ");
      showToast({
        tone: "error",
        title: "Could not prepare DN",
        message: shortageDetails
          ? `${error.message} ${shortageDetails}`
          : error.message,
      });
      return;
    }

    const now = new Date();
    const englishDate = formatEnglishDate(now, { includeTime: false });
    const nepaliDate = formatNepaliDate(now);
    const currentTime = now.toLocaleTimeString();
    const deliveryNoteNumber =
      preparedOrder.delivery_note_number ||
      (preparedOrder.warehouse_delivery_note_numbers || []).join(", ") ||
      deliveryNoteNumbersByOrderId.get(Number(preparedOrder.id)) ||
      "-";
    const preparedFulfillments = new Map(
      (preparedOrder.warehouse_fulfillments || []).map((fulfillment) => [
        Number(fulfillment.warehouse_id),
        fulfillment,
      ])
    );

    const groupedRows = new Map();
    (preparedOrder.items || []).forEach((item) => {
      const pairsPerCarton = Number(
        item.inner_boxes_per_outer_box || 0
      );
      const allocations = (item.warehouse_allocations || []).filter(
        (allocation) => Number(allocation.quantity || 0) > 0
      );
      const printableAllocations = allocations.length
        ? allocations
        : [
            {
              warehouse_id: null,
              warehouse_name: "Source not recorded",
              quantity: Number(item.qty_ordered || 0),
              print_group_code_snapshot: "LEGACY_UNALLOCATED",
              print_group_name_snapshot: "Legacy / Unallocated",
              print_group_display_order: 999,
            },
          ];

      printableAllocations.forEach((allocation) => {
        const groupCode =
          allocation.print_group_code_snapshot || "LEGACY_UNALLOCATED";
        const groupKey = `warehouse:${allocation.warehouse_id || "UNASSIGNED"}`;
        if (!groupedRows.has(groupKey)) {
          const fulfillment = preparedFulfillments.get(
            Number(allocation.warehouse_id)
          );
          const warehouseNumber = groupCode.match(/^WAREHOUSE_(\d+)$/)?.[1];
          groupedRows.set(groupKey, {
            code: groupCode,
            name:
              fulfillment?.name ||
              allocation.print_group_name_snapshot ||
              "Legacy / Unallocated",
            warehouseSlipNumber:
              fulfillment?.warehouse_slip_number ||
              `${deliveryNoteNumber}-W${warehouseNumber || allocation.warehouse_id || "UNASSIGNED"}`,
            status: fulfillment?.status || "PLANNED",
            displayOrder: Number(
              allocation.print_group_display_order || 999
            ),
            rows: [],
          });
        }
        const pairs = Number(allocation.quantity || 0);
        groupedRows.get(groupKey).rows.push({
          finishedGoodId: item.finished_good_id || "-",
          articleCode: item.article_code || "-",
          productName: item.product_name || "-",
          color: item.color || "-",
          size: item.size || "-",
          warehouseName: allocation.warehouse_name || "-",
          pairs,
          cartons: pairsPerCarton > 0 ? pairs / pairsPerCarton : 0,
        });
      });
    });

    const groups = [...groupedRows.values()].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.name.localeCompare(right.name)
    );
    const overallCartons = groups.reduce(
      (total, group) =>
        total + group.rows.reduce((sum, row) => sum + row.cartons, 0),
      0
    );
    // Each actual warehouse starts on its own paper. A warehouse only continues
    // onto another paper when its own item count cannot fit safely on one A4 page.
    const rowsPerPage = 25;
    const pages = groups.flatMap((group) => {
      const chunks = [];
      for (let index = 0; index < group.rows.length; index += rowsPerPage) {
        chunks.push(group.rows.slice(index, index + rowsPerPage));
      }
      return (chunks.length ? chunks : [[]]).map((rows, index) => ({
        ...group,
        rows,
        groupPage: index + 1,
        groupPages: Math.max(1, chunks.length),
        groupPairs: group.rows.reduce((sum, row) => sum + row.pairs, 0),
        groupCartons: group.rows.reduce((sum, row) => sum + row.cartons, 0),
      }));
    });

    const pageHtml = pages
      .map((page, pageIndex) => {
        const pagePairs = page.rows.reduce((sum, row) => sum + row.pairs, 0);
        const pageCartons = page.rows.reduce(
          (sum, row) => sum + row.cartons,
          0
        );
        const itemsHtml = page.rows
          .map(
            (item, index) => `
              <tr>
                <td>${page.groupPage === 1 ? index + 1 : page.groupPage * rowsPerPage - rowsPerPage + index + 1}</td>
                <td>${escapeHtml(item.finishedGoodId)}</td>
                <td class="nowrap">${escapeHtml(item.size)}</td>
                <td>${escapeHtml(item.productName)}</td>
                <td>${escapeHtml(item.warehouseName)}</td>
                <td class="number">${formatPrintNumber(item.cartons)}</td>
                <td class="number">${formatPrintNumber(item.pairs)}</td>
              </tr>`
          )
          .join("");

        return `
          <section class="print-page${pageIndex === pages.length - 1 ? " last" : ""}">
            <div class="page-indicator">Page ${pageIndex + 1} of ${pages.length}</div>
            <div class="header">DELIVERY NOTE</div>
            <div class="warehouse-title">
              ${escapeHtml(page.warehouseSlipNumber)} · ${escapeHtml(page.name)} · Overall Total: ${formatPrintNumber(overallCartons)} CTN
            </div>
            <table class="top-grid">
              <tr>
                <td width="52%">
                  <strong>Order ID:</strong> #${escapeHtml(preparedOrder.id)}<br/>
                  ${preparedOrder.delivery_note_number ? `<strong>Master DN:</strong> ${escapeHtml(deliveryNoteNumber)}<br/>` : ""}
                  <strong>Delivery Note:</strong> ${escapeHtml(page.warehouseSlipNumber)}<br/>
                  <strong>Warehouse:</strong> ${escapeHtml(page.name)}<br/>
                  <strong>Warehouse Status:</strong> ${escapeHtml(page.status)}<br/>
                  <strong>Created By:</strong> ${escapeHtml(preparedOrder.created_by_name || "-")}<br/>
                  <strong>Printed:</strong> ${escapeHtml(englishDate)} · ${escapeHtml(nepaliDate)} · ${escapeHtml(currentTime)}<br/>
                  <strong>Printed By:</strong> ${escapeHtml(user?.name || "User")}
                </td>
                <td width="48%">
                  <strong>Customer:</strong> ${escapeHtml(preparedOrder.customer_name || "-")}<br/>
                  <strong>Phone:</strong> ${escapeHtml(preparedOrder.customer_phone || "-")}<br/>
                  <strong>Address:</strong> ${escapeHtml(preparedOrder.customer_address || "-")}<br/>
                  <strong>PAN:</strong> ${escapeHtml(preparedOrder.pan_number || "-")}<br/>
                  <strong>Transport:</strong> ${escapeHtml(preparedOrder.transport_name || "-")}
                </td>
              </tr>
            </table>
            <table class="items">
              <thead>
                <tr>
                  <th>S.No</th><th>F.G. ID</th><th>Size</th><th>Description of Goods</th>
                  <th>Warehouse</th><th>Carton</th><th>Pairs</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <table class="totals">
              <tr><td class="label">This page</td><td>${formatPrintNumber(pageCartons)} CTN</td><td>${formatPrintNumber(pagePairs)} pairs</td></tr>
              <tr><td class="label">${escapeHtml(page.name)} total</td><td>${formatPrintNumber(page.groupCartons)} CTN</td><td>${formatPrintNumber(page.groupPairs)} pairs</td></tr>
            </table>
            <div class="signature">
              <div>___________________<br/>Packed / Delivered By</div>
              <div>___________________<br/>Checked By</div>
              <div>___________________<br/>Received By</div>
            </div>
          </section>`;
      })
      .join("");

    try {
      await api.logOrderPrint(preparedOrder.id, token, {
        print_type: "warehouse_delivery_slips",
        warehouse_groups: groups.map((group) => group.name),
        warehouse_slips: groups.map((group) => ({
          warehouse: group.name,
          slip_number: group.warehouseSlipNumber,
          status: group.status,
          cartons: group.rows.reduce((sum, row) => sum + row.cartons, 0),
          pairs: group.rows.reduce((sum, row) => sum + row.pairs, 0),
        })),
      });
    } catch (error) {
      printWindow.close();
      showToast({
        tone: "error",
        title: "Could not record DN print",
        message: error.message,
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(deliveryNoteNumber)} · Warehouse Delivery Note</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; color: #000; font-family: Arial, sans-serif; font-size: 16px; }
            @page { size: A4 portrait; margin: 8mm; }
            .print-page { position: relative; width: 194mm; height: 279mm; overflow: hidden; padding-bottom: 4mm; page-break-after: always; break-after: page; }
            .print-page.last { page-break-after: auto; break-after: auto; }
            .page-indicator { position: absolute; top: 3px; right: 0; font-size: 14px; font-weight: 700; }
            .header { text-align: center; font-size: 26px; font-weight: 800; letter-spacing: .08em; }
            .warehouse-title { margin: 5px 0 7px; border: 2px solid #111; padding: 6px 10px; text-align: center; font-size: 18px; font-weight: 800; }
            table { width: 100%; border-collapse: collapse; }
            .top-grid { margin-bottom: 6px; }
            .top-grid td { border: 1px solid #111; padding: 6px 8px; font-size: 16px; line-height: 1.25; vertical-align: top; }
            .items th, .items td { border: 1px solid #111; padding: 5px 7px; vertical-align: top; line-height: 1.2; }
            .items th { background: #eee; text-align: left; font-size: 16px; }
            .items td { font-size: 16px; }
            .items th:nth-child(1) { width: 6%; }
            .items th:nth-child(2) { width: 8%; }
            .items th:nth-child(3) { width: 10%; }
            .items th:nth-child(4) { width: 38%; }
            .items th:nth-child(5) { width: 20%; }
            .items th:nth-child(6), .items th:nth-child(7) { width: 9%; }
            .items td:first-child, .items td:nth-child(2), .items td:nth-child(3), .number { text-align: center; }
            .items tbody td { vertical-align: middle; }
            .nowrap { white-space: nowrap; }
            .totals { margin-top: 4px; }
            .totals td { border: 1px solid #111; padding: 6px; font-size: 15px; font-weight: 700; text-align: center; }
            .totals .label { text-align: right; }
            .signature { margin-top: 22px; display: flex; justify-content: space-between; }
            .signature div { width: 30%; text-align: center; font-size: 15px; line-height: 1.5; }
            tr, .totals, .signature { break-inside: avoid; page-break-inside: avoid; }
            @media print {
              html, body { width: 210mm; }
              .print-page { min-height: 0; }
            }
            @media screen { body { background: #e5e7eb; padding: 20px; } .print-page { margin: 0 auto 20px; background: white; } }
          </style>
        </head>
        <body>${pageHtml}</body>
      </html>
    `);

    printWindow.document.close();

    let didPrint = false;
    const fitDeliveryNoteRows = () => {
      const printablePages = printWindow.document.querySelectorAll(".print-page");

      printablePages.forEach((pageElement) => {
        const rows = [...pageElement.querySelectorAll(".items tbody tr")];
        const tbody = pageElement.querySelector(".items tbody");
        const totalsTable = pageElement.querySelector(".totals");
        const signature = pageElement.querySelector(".signature");
        if (!rows.length || !tbody || !totalsTable || !signature) return;

        rows.forEach((row) => {
          row.style.height = "auto";
        });

        const pageRect = pageElement.getBoundingClientRect();
        const tbodyRect = tbody.getBoundingClientRect();
        const totalsStyle = printWindow.getComputedStyle(totalsTable);
        const signatureStyle = printWindow.getComputedStyle(signature);
        const totalsMarginTop = Number.parseFloat(totalsStyle.marginTop) || 0;
        const signatureMarginTop = Number.parseFloat(signatureStyle.marginTop) || 0;
        const naturalRowHeight = Math.max(
          ...rows.map((row) => row.getBoundingClientRect().height)
        );
        const reservedAfterRows =
          totalsTable.getBoundingClientRect().height +
          totalsMarginTop +
          signature.getBoundingClientRect().height +
          signatureMarginTop +
          8;
        const availableRowsHeight = Math.max(
          0,
          pageRect.height -
            (tbodyRect.top - pageRect.top) -
            reservedAfterRows
        );
        const fittedRowHeight = Math.min(
          48,
          Math.max(naturalRowHeight, Math.floor(availableRowsHeight / rows.length))
        );

        rows.forEach((row) => {
          row.style.height = `${fittedRowHeight}px`;
        });
      });
    };

    const printNote = () => {
      if (didPrint) return;
      if (printWindow.closed) return;
      didPrint = true;
      fitDeliveryNoteRows();
      printWindow.focus();
      printWindow.print();
    };

    printWindow.onafterprint = () => {
      printWindow.close();
    };

    printWindow.addEventListener("load", () => {
      setTimeout(printNote, 100);
    }, { once: true });

    setTimeout(printNote, 700);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Physical Stock" value={formatNumber(totals.physical)} icon="finishedGoods" />
        <StatCard label="Reserved Stock" value={formatNumber(totals.reserved)} tone="alert" icon="orders" />
        <StatCard label="Available Stock" value={formatNumber(totals.available)} tone="calm" icon="check" />
      </div>

      <SectionCard
        title="Create order"
        subtitle="Enter the customer first, then add products in whole cartons. The system calculates pairs automatically."
        icon="orders"
      >
        <form className="space-y-5" onSubmit={submit}>
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">1</span>
            <div>
              <h3 className="font-bold text-slate-900">Customer and delivery details</h3>
              <p className="text-xs text-slate-500">Who is ordering, where it is going, and which transport will carry it.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Customer name" hint="Choose an existing party name when available to avoid duplicate spellings.">
              <TextInput
                list="known-order-parties"
                value={form.customer_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customer_name: event.target.value }))
                }
                onBlur={applyKnownPartySuggestion}
                required
              />
              <datalist id="known-order-parties">
                {knownPartiesForCurrentUser.map((party) => (
                  <option key={`${party.dealer_id}:${party.key}`} value={party.name} />
                ))}
              </datalist>
            </Field>

            <Field label="Customer phone">
              <TextInput
                type="tel"
                maxLength={10}
                pattern="[0-9]{10}"
                value={form.customer_phone}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((current) => ({ ...current, customer_phone: value }));
                }}
                required
              />
            </Field>

            <Field label="Customer Address">
              <TextInput
                value={form.customer_address}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^a-zA-Z\s]/g, "");
                  setForm((current) => ({ ...current, customer_address: value }));
                }}
                required
              />
            </Field>

            <Field label="PAN Number">
              <TextInput
                type="text"
                maxLength={9}
                pattern="[0-9]{9}"
                value={form.pan_number}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 9);
                  setForm((current) => ({ ...current, pan_number: value }));
                }}
                required
              />
            </Field>

            <Field
              label="Transport Name"
              hint={
                suggestedTransportName
                  ? `Previously used for this customer: ${suggestedTransportName}. You can still type a different transport.`
                  : "The previous transport will be suggested when this customer is recognized."
              }
            >
              <TextInput
                value={form.transport_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, transport_name: event.target.value }))
                }
                required
              />
              {suggestedTransportName &&
              form.transport_name.trim() !== suggestedTransportName ? (
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      transport_name: suggestedTransportName,
                    }))
                  }
                  className="mt-2 inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  Use {suggestedTransportName}
                </button>
              ) : null}
            </Field>

            <Field label="Notes">
              <TextInput
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 border-b border-slate-200 pb-3 pt-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">2</span>
            <div>
              <h3 className="font-bold text-slate-900">Products and cartons</h3>
              <p className="text-xs text-slate-500">Select a product and enter CTN. Pairs are calculated using that product’s packing configuration.</p>
            </div>
          </div>

          <div className="space-y-3">
            {form.items.map((item, index) => {
              const selected = availabilityById.get(String(item.finished_good_id));
              const pairsPerCarton = Number(selected?.inner_boxes_per_outer_box || 0);
              const orderedPairs = Number(item.qty_ordered || 0);
              const availablePairs = Number(selected?.available_qty || 0);
              const availableCartons = pairsPerCarton > 0
                ? Math.floor(availablePairs / pairsPerCarton)
                : 0;
              const exceedsStock = Boolean(selected) && orderedPairs > availablePairs;
              return (
                <div
                  key={index}
                  className={`rounded-2xl border p-4 ${exceedsStock ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-slate-50/60"}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-700">Item {index + 1}</p>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={form.items.length === 1}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_0.65fr_1fr_1fr]">
                    <Field label="Product" hint="Search by product name or article code.">
                      <Select
                        options={availability.map((product) => ({
                          value: String(product.id),
                          label: `${product.article_code || product.name} · ${product.color || "No color"} · ${formatNumber(product.inner_boxes_per_outer_box || 0)} pairs/CTN`,
                        }))}
                        value={selected ? {
                          value: String(selected.id),
                          label: `${selected.article_code || selected.name} · ${selected.color || "No color"} · ${formatNumber(selected.inner_boxes_per_outer_box || 0)} pairs/CTN`,
                        } : null}
                        onChange={(option) => updateOrderItemProduct(index, option?.value || "")}
                        placeholder="Search and select product..."
                        isClearable
                        menuPortalTarget={document.body}
                        menuPosition="fixed"
                        styles={{
                          control: (base) => ({
                            ...base,
                            minHeight: "44px",
                            borderRadius: "12px",
                            borderColor: "#d1d5db",
                            boxShadow: "none",
                            fontSize: "14px",
                          }),
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                        }}
                      />
                    </Field>
                    <Field label="Order quantity (CTN)" hint="Whole cartons only.">
                      <TextInput
                        type="number"
                        min="1"
                        step="1"
                        value={item.carton_qty}
                        onChange={(event) => updateOrderItemCartons(index, event.target.value)}
                        required
                      />
                    </Field>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-2.5">
                      <p className="text-xs font-semibold text-indigo-600">Pairs calculated automatically</p>
                      <p className="mt-1 text-lg font-black text-indigo-950">
                        {selected && pairsPerCarton > 0 ? `${formatNumber(orderedPairs)} pairs` : "Select product"}
                      </p>
                      {selected && pairsPerCarton > 0 ? (
                        <p className="text-xs text-indigo-700">{formatNumber(item.carton_qty || 0)} CTN × {formatNumber(pairsPerCarton)} pairs</p>
                      ) : null}
                    </div>
                    <div className={`rounded-xl border px-3.5 py-2.5 ${exceedsStock ? "border-red-200 bg-white text-red-700" : "border-slate-200 bg-white text-slate-600"}`}>
                      <p className="text-xs font-semibold">Available stock</p>
                      <p className="mt-1 font-bold">{selected ? `${formatNumber(availableCartons)} CTN` : "Select product"}</p>
                      {selected ? <p className="text-xs">{formatNumber(availablePairs)} pairs</p> : null}
                      {exceedsStock ? <p className="mt-1 text-xs font-bold">Not enough available stock</p> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Order total</p>
              <p className="text-lg font-black text-slate-950">
                {formatNumber(createOrderTotals.cartons)} CTN / {formatNumber(createOrderTotals.pairs)} pairs
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              icon="plus"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  items: [...current.items, { finished_good_id: "", carton_qty: 1, qty_ordered: 0 }],
                }))
              }
            >
              Add another product
            </Button>
            <Button type="submit" icon="check">
              Reserve order
            </Button>
            </div>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Orders"
        subtitle={
          canManageOrders
            ? "Admin can move orders through confirmation, packing, delivery, or cancellation."
            : "Your reserved orders."
        }
        icon="orders"
      >
        <div className="mb-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_0.65fr]">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Search orders
          <div className="relative w-full">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search orders..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="h-[42px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
            Dealer / Created by
            <Select
              isClearable
              isSearchable
              placeholder="All dealers"
              value={dealerFilter}
              options={(orderFilterOptions.dealers || []).map((dealer) => ({
                value: String(dealer.id),
                label: `${dealer.name} (${formatNumber(dealer.order_count)})`,
                description: [dealer.role, dealer.email].filter(Boolean).join(" · "),
              }))}
              onChange={(option) => {
                setDealerFilter(option);
                setPartyFilter(null);
                setOrderPage(1);
              }}
              formatOptionLabel={(option) => (
                <div className="min-w-0">
                  <div className="truncate font-semibold">{option.label}</div>
                  {option.description ? <div className="truncate text-[11px] text-slate-400">{option.description}</div> : null}
                </div>
              )}
              styles={{
                control: (base, state) => ({
                  ...base,
                  minHeight: 42,
                  borderRadius: 12,
                  borderColor: state.isFocused ? "#818cf8" : "#cbd5e1",
                  boxShadow: state.isFocused ? "0 0 0 2px #e0e7ff" : "none",
                }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
            Party / Customer
            <Select
              isClearable
              isSearchable
              isDisabled={!dealerFilter}
              placeholder={dealerFilter ? "All parties for this dealer" : "Select dealer first"}
              value={partyFilter}
              options={(orderFilterOptions.parties || [])
                .filter((party) => String(party.dealer_id) === String(dealerFilter?.value))
                .map((party) => ({
                  value: party.key,
                  label: `${party.name} (${formatNumber(party.order_count)})`,
                  aliases: party.aliases || [],
                }))}
              onChange={(option) => {
                setPartyFilter(option);
                setOrderPage(1);
              }}
              formatOptionLabel={(option) => (
                <div className="min-w-0">
                  <div className="truncate font-semibold">{option.label}</div>
                  {option.aliases?.length > 1 ? (
                    <div className="truncate text-[11px] text-slate-400">
                      Also entered as: {option.aliases.filter((alias) => !option.label.startsWith(`${alias} (`)).join(", ")}
                    </div>
                  ) : null}
                </div>
              )}
              styles={{
                control: (base, state) => ({
                  ...base,
                  minHeight: 42,
                  borderRadius: 12,
                  borderColor: state.isFocused ? "#818cf8" : "#cbd5e1",
                  boxShadow: state.isFocused ? "0 0 0 2px #e0e7ff" : "none",
                }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Order status
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOrderPage(1);
              }}
              className="h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PACKED">Packed</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            English date from
            <input
              type="date"
              value={orderDateFilters.date_from}
              onChange={(event) =>
                setOrderDateFilters((current) => ({
                  ...current,
                  date_from: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            English date to
            <input
              type="date"
              value={orderDateFilters.date_to}
              onChange={(event) =>
                setOrderDateFilters((current) => ({
                  ...current,
                  date_to: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Nepali BS date from
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="2083-04-01"
              value={orderDateFilters.bs_date_from}
              onChange={(event) =>
                setOrderDateFilters((current) => ({
                  ...current,
                  bs_date_from: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Nepali BS date to
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="2083-04-27"
              value={orderDateFilters.bs_date_to}
              onChange={(event) =>
                setOrderDateFilters((current) => ({
                  ...current,
                  bs_date_to: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Nepali fiscal year
            <input
              type="text"
              inputMode="numeric"
              maxLength={7}
              placeholder="2083/84"
              value={orderDateFilters.fiscal_year}
              onChange={(event) =>
                setOrderDateFilters((current) => ({
                  ...current,
                  fiscal_year: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-5 xl:justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={clearAllOrderFilters}>
              Clear all filters
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearOrderDateFilters}>
              Clear dates
            </Button>
            <Button type="button" size="sm" icon="search" onClick={applyOrderDateFilters}>
              Search dates
            </Button>
          </div>
        </div>

        <DataTable
          columns={[
            { key: "id", label: "ID", minWidth: 90, align: "center" },
            {
              key: "customer_details",
              label: "Customer Details",
              minWidth: 220,
              render: (row) => (
                <div className="min-w-0">
                  <strong>{row.customer_name || "-"}</strong>
                  <br />
                  <small style={{ color: "#666" }}>Phone: {row.customer_phone || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>Address: {row.customer_address || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>PAN: {row.pan_number || "-"}</small>
                  <br />
                  <small style={{ color: "#666" }}>Transport: {row.transport_name || "-"}</small>
                </div>
              ),
            },
            { key: "items", label: "Items by Warehouse DN", minWidth: 460, render: renderOrderItems },
            {
              key: "status",
              label: "Status",
              minWidth: 165,
              align: "center",
              render: (row) => {
                const displayStatus = row.fulfillment_status || row.status;
                return (
                  <div className="space-y-1">
                    <StatusBadge tone={statusTone[displayStatus] || statusTone[row.status]}>
                      {displayStatus}
                    </StatusBadge>
                    {Number(row.warehouse_fulfillment_count || 0) > 0 ? (
                      <div className="text-xs text-slate-500">
                        {formatNumber(row.delivered_warehouse_count || 0)} of{" "}
                        {formatNumber(row.warehouse_fulfillment_count)} warehouses delivered
                      </div>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "cancellation_reason",
              label: "Cancel Reason",
              minWidth: 190,
              render: (row) =>
                row.status === "CANCELLED" ? (
                  <div className="space-y-1">
                    <strong>
                      {cancellationLabel(row.cancellation_code)}
                    </strong>
                    <div className="text-xs text-slate-500">
                      {row.cancellation_reason || "-"}
                    </div>
                    {row.duplicate_of_order_id ? (
                      <div className="text-xs font-semibold text-indigo-600">
                        Original: Order #{row.duplicate_of_order_id}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  "-"
                ),
            },
            {
              key: "created_by_name",
              label: "Created By",
              minWidth: 165,
              align: "center",
            },
            {
              key: "created_at",
              label: "Created",
              minWidth: 165,
              align: "center",
              render: (row) => {
                return (
                  <div className="flex flex-col">
                    <strong>{formatEnglishDate(row.created_at, { includeTime: false })}</strong>
                    <span className="text-xs text-slate-500">BS {formatNepaliDate(row.created_at)}</span>
                    <span className="text-xs text-slate-500">{formatTime(row.created_at)}</span>
                  </div>
                );
              },
            },
            canManageOrders
              ? {
                  key: "actions",
                  label: "Actions",
                  minWidth: 165,
                  align: "center",
                  render: (row) => {
                    const canPrint = PRINTABLE_DELIVERY_STATUSES.includes(row.status);
                    const canChangeStatus = !["DELIVERED", "CANCELLED"].includes(row.status);

                    if (!canPrint && !canChangeStatus) return null;

                    return (
                      <div className="grid gap-1">
                        {canPrint ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm"
                            title="Prepare one separate paper for each warehouse under the same DN"
                            onClick={() => printDeliveryNote(row)}
                          >
                            🖨️ DN
                          </Button>
                        ) : null}

                        {canChangeStatus ? (
                          <>
                            {row.status === "PENDING" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                                onClick={() => changeStatus(row.id, "CONFIRMED")}
                              >
                                Confirm
                              </Button>
                            ) : null}
                            {row.status === "CONFIRMED" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                                onClick={() => changeStatus(row.id, "PACKED")}
                              >
                                Pack
                              </Button>
                            ) : null}
                            {row.status === "PACKED" &&
                            Number(row.delivered_warehouse_count || 0) === 0 ? (
                              <div className="rounded-lg bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700">
                                Deliver from warehouse DNs.
                              </div>
                            ) : null}
                            {Number(row.delivered_warehouse_count || 0) === 0 ? (
                              <Button
                                size="sm"
                                variant="danger"
                                className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm"
                                onClick={() => openCancellation(row)}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  },
                }
              : null,
            {
              key: "confirmed_by_name",
              label: "Confirmed By / DN",
              minWidth: 230,
              align: "center",
              render: (row) => {
                const warehouseDeliveryNoteNumbers =
                  row.warehouse_delivery_note_numbers || [];
                const deliveryNoteNumber =
                  row.delivery_note_number ||
                  deliveryNoteNumbersByOrderId.get(Number(row.id)) ||
                  "-";
                const warehouseFulfillments = row.warehouse_fulfillments || [];
                const warehouseSlipsExpanded = expandedWarehouseOrders.has(
                  Number(row.id)
                );
                return (
                  <div className="space-y-1">
                    {row.confirmed_by_name || "-"}
                    <br />
                    <small className="font-semibold text-slate-600">
                      {row.delivery_note_number
                        ? `Master: ${deliveryNoteNumber}`
                        : warehouseDeliveryNoteNumbers.length
                          ? `DNs: ${warehouseDeliveryNoteNumbers.join(", ")}`
                          : "DNs: Not assigned"}
                    </small>
                    {canCorrectWarehouseSource &&
                    !row.delivery_note_number &&
                    !row.warehouse_dns_corrected &&
                    warehouseDeliveryNoteNumbers.length > 0 &&
                    warehouseFulfillments.every(
                      (fulfillment) =>
                        !["VOID", "REASSIGNED"].includes(fulfillment.status)
                    ) &&
                    row.status === "CONFIRMED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm"
                        disabled={correctingDnOrderId === Number(row.id)}
                        onClick={() => correctWarehouseDeliveryNotes(row)}
                      >
                        {correctingDnOrderId === Number(row.id)
                          ? "Correcting DNs…"
                          : "Correct DNs"}
                      </Button>
                    ) : null}
                    {!row.delivery_note_number && !warehouseDeliveryNoteNumbers.length && ["CONFIRMED", "PACKED", "DELIVERED"].includes(row.status) ? (
                      <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => assignDeliveryNote(row)}>
                        Assign DN
                      </Button>
                    ) : null}
                    {warehouseFulfillments.length ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                          onClick={() => toggleWarehouseSlips(Number(row.id))}
                        >
                          {warehouseSlipsExpanded ? "Hide" : "View"} warehouse slips ({warehouseFulfillments.length})
                        </Button>
                        {warehouseSlipsExpanded ? (
                          <div className="mt-2 grid min-w-[220px] gap-2 text-left">
                            {warehouseFulfillments.map((fulfillment) => {
                              const warehouseKey = `${row.id}:${fulfillment.warehouse_id}`;
                              const isDelivered = fulfillment.status === "DELIVERED";
                              const isDeliveredWithShortage =
                                fulfillment.status === "DELIVERED WITH SHORTAGE";
                              const isOutOfStock = fulfillment.status === "OUT OF STOCK";
                              const isCompleted =
                                isDelivered || isDeliveredWithShortage || isOutOfStock;
                              const isPartiallyDelivered = fulfillment.status === "PARTIALLY DELIVERED";
                              const isVoid = fulfillment.status === "VOID";
                              const isReassigned = fulfillment.status === "REASSIGNED";
                              const isInactive = isVoid || isReassigned;
                              const pendingWarehouseItems = (fulfillment.items || []).filter(
                                (item) => item.allocation_status === "PLANNED"
                              );
                              const productsChecked =
                                pendingWarehouseItems.length > 0 &&
                                pendingWarehouseItems.every(
                                  (item) => item.verified_at && item.verified_quantity !== null
                                );
                              const verifiedReadyPairs = pendingWarehouseItems.reduce(
                                (sum, item) => sum + Number(item.verified_quantity || 0),
                                0
                              );
                              const verifiedOutOfStockPairs = pendingWarehouseItems.reduce(
                                (sum, item) =>
                                  item.verification_status === "OUT_OF_STOCK"
                                    ? sum + Math.max(0, Number(item.quantity || 0) - Number(item.verified_quantity || 0))
                                    : sum,
                                0
                              );
                              return (
                                <div
                                  key={warehouseKey}
                                  className={`rounded-xl border p-2 ${
                                    isInactive
                                      ? "border-slate-300 bg-slate-100"
                                      : isCompleted
                                      ? "border-emerald-200 bg-emerald-50"
                                      : isPartiallyDelivered
                                        ? "border-sky-200 bg-sky-50"
                                        : "border-amber-200 bg-amber-50"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {fulfillment.warehouse_slip_number}
                                      </div>
                                      <div className="text-xs text-slate-600">
                                        {fulfillment.name}
                                      </div>
                                    </div>
                                    <StatusBadge tone={isDelivered ? "success" : isDeliveredWithShortage ? "warning" : isOutOfStock ? "danger" : isInactive ? "neutral" : isPartiallyDelivered ? "info" : "warning"}>
                                      {fulfillment.status}
                                    </StatusBadge>
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-slate-700">
                                    {formatNumber(fulfillment.cartons)} CTN / {formatNumber(fulfillment.pairs)} pairs
                                  </div>
                                  {Number(fulfillment.delivered_pairs || 0) > 0 && !isCompleted ? (
                                    <div className="mt-1 text-xs text-sky-700">
                                      {formatNumber(fulfillment.delivered_pairs)} delivered · {formatNumber(fulfillment.pending_pairs)} pending
                                    </div>
                                  ) : null}
                                  {isReassigned ? (
                                    <div className="mt-1 text-xs font-semibold text-slate-600">
                                      Products moved to {(
                                        fulfillment.reassigned_to_delivery_note_numbers || []
                                      ).join(", ") || "another warehouse DN"}. No delivery action is available on this DN.
                                    </div>
                                  ) : isVoid ? (
                                    <div className="mt-1 text-xs font-semibold text-slate-600">
                                      Void — this delivery note is inactive.
                                    </div>
                                  ) : isCompleted ? (
                                    <>
                                      <div className={`mt-1 text-xs ${isDelivered ? "text-emerald-700" : "text-amber-800"}`}>
                                        {isOutOfStock
                                          ? `Closed without stock deduction · ${formatNumber(fulfillment.out_of_stock_pairs || 0)} pairs out of stock`
                                          : isDeliveredWithShortage
                                            ? `Available products delivered · ${formatNumber(fulfillment.out_of_stock_pairs || 0)} pairs closed as out of stock`
                                            : fulfillment.delivered_by_name
                                              ? `By ${fulfillment.delivered_by_name}`
                                              : "Delivered"}
                                        {fulfillment.delivered_at
                                          ? ` · ${formatEnglishDate(fulfillment.delivered_at)}`
                                          : ""}
                                      </div>
                                      {isDelivered && canCorrectWarehouseSource ? (
                                        <Button
                                          size="sm"
                                          variant="danger"
                                          className="mt-2 h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                                          disabled={reversingWarehouseKey === warehouseKey}
                                          onClick={() => undoWarehouseDelivery(row, fulfillment)}
                                        >
                                          {reversingWarehouseKey === warehouseKey
                                            ? "Reversing…"
                                            : "Undo warehouse delivery"}
                                        </Button>
                                      ) : null}
                                    </>
                                  ) : canManageOrders && row.status === "PACKED" ? (
                                    <div className="mt-2 grid gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                                        disabled={verifyingWarehouseKey === warehouseKey}
                                        onClick={() => checkWarehouseProducts(row, fulfillment)}
                                      >
                                        {verifyingWarehouseKey === warehouseKey
                                          ? "Saving check…"
                                          : productsChecked
                                            ? "Recheck products"
                                            : "Check products"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        icon="check"
                                        className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                                        disabled={
                                          deliveringWarehouseKey === warehouseKey ||
                                          !productsChecked ||
                                          (verifiedReadyPairs <= 0 && verifiedOutOfStockPairs <= 0)
                                        }
                                        onClick={() => deliverWarehouse(row, fulfillment)}
                                      >
                                        {deliveringWarehouseKey === warehouseKey
                                          ? "Delivering…"
                                          : productsChecked && verifiedReadyPairs > 0
                                            ? `Deliver ${formatNumber(verifiedReadyPairs)} verified pairs`
                                            : productsChecked && verifiedOutOfStockPairs > 0
                                              ? "Close out-of-stock DN"
                                            : "Deliver verified products"}
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-xs text-amber-700">
                                      {row.status === "PACKED"
                                        ? "Waiting for warehouse delivery."
                                        : "Waiting for packing."}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              },
            },
            canManageOrders
              ? {
                  key: "order_edits",
                  label: "Order Edits",
                  minWidth: 155,
                  align: "center",
                  render: (row) => {
                    if (!canCorrectOrders) return <span className="text-slate-400">-</span>;
                    if (row.status === "PACKED") {
                      if ((row.warehouse_fulfillments || []).some(
                        (fulfillment) => Number(fulfillment.delivered_pairs || 0) > 0
                      )) {
                        return (
                          <div className="grid gap-1.5">
                            <span className="text-xs font-semibold text-slate-500">
                              Locked after partial delivery
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                              onClick={() => openLockedOrderDetails(row)}
                            >
                              View details
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => reopenPacking(row)}>
                          Reopen packing
                        </Button>
                      );
                    }
                    if (row.status === "CONFIRMED") {
                      return (
                        <div className="grid gap-1">
                          <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => undoConfirmation(row)}>
                            Undo confirmation
                          </Button>
                          <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => openCorrection(row)}>
                            Correct CTN
                          </Button>
                        </div>
                      );
                    }
                    if (row.status === "PENDING") {
                      return (
                        <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm" onClick={() => openCorrection(row)}>
                          Correct CTN
                        </Button>
                      );
                    }
                    return (
                      <div className="grid gap-1.5">
                        <span className="text-xs font-semibold text-slate-400">Locked</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs"
                          onClick={() => openLockedOrderDetails(row)}
                        >
                          View details
                        </Button>
                      </div>
                    );
                  },
                }
              : null,
          ].filter(Boolean)}
          rows={filteredOrders}
          showToolbar={false}
          wrapCells
          responsiveScroll
          density="comfortable"
          minTableWidth={canManageOrders ? 1885 : 1410}
          serverPagination={{
            ...orderPagination,
            onPageChange: setOrderPage,
          }}
        />
      </SectionCard>

      {lockedOrderDetails ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={() => setLockedOrderDetails(null)}
        >
          <div
            className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Order #{lockedOrderDetails.id} delivery details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {lockedOrderDetails.customer_name || "Customer"} · Current status: {lockedOrderDetails.fulfillment_status || lockedOrderDetails.status}
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLockedOrderDetails(null)}>
                Close
              </Button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-950">Warehouse and product details</h3>
                    <p className="text-sm text-slate-500">
                      Delivered stock is locked for audit safety. Pending products remain visible below.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {formatNumber((lockedOrderDetails.warehouse_fulfillments || []).length)} warehouse DNs
                  </span>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {(lockedOrderDetails.warehouse_fulfillments || []).map((fulfillment) => {
                    const fulfillmentTone = ["DELIVERED"].includes(fulfillment.status)
                      ? "success"
                      : ["DELIVERED WITH SHORTAGE", "PARTIALLY DELIVERED"].includes(fulfillment.status)
                        ? "warning"
                        : ["OUT OF STOCK"].includes(fulfillment.status)
                          ? "danger"
                          : "neutral";
                    return (
                      <article key={`${lockedOrderDetails.id}:${fulfillment.warehouse_id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <header className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="font-bold text-slate-950">{fulfillment.warehouse_slip_number}</p>
                            <p className="text-xs text-slate-500">{fulfillment.name}</p>
                          </div>
                          <StatusBadge tone={fulfillmentTone}>{fulfillment.status}</StatusBadge>
                        </header>

                        <div className="grid grid-cols-2 gap-2 border-y border-slate-200 px-4 py-3 text-xs sm:grid-cols-4">
                          <div><span className="block text-slate-400">Allocated</span><strong>{formatNumber(fulfillment.pairs)} pairs</strong></div>
                          <div><span className="block text-slate-400">CTN</span><strong>{formatNumber(fulfillment.cartons)}</strong></div>
                          <div><span className="block text-slate-400">Delivered</span><strong className="text-emerald-700">{formatNumber(fulfillment.delivered_pairs || 0)}</strong></div>
                          <div><span className="block text-slate-400">Pending / OOS</span><strong>{formatNumber(fulfillment.pending_pairs || 0)} / {formatNumber(fulfillment.out_of_stock_pairs || 0)}</strong></div>
                        </div>

                        {fulfillment.delivered_by_name || fulfillment.delivered_at ? (
                          <div className="bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                            {fulfillment.delivered_by_name ? `Delivered by ${fulfillment.delivered_by_name}` : "Delivered"}
                            {fulfillment.delivered_at
                              ? ` · ${formatEnglishDate(fulfillment.delivered_at, { includeTime: false })} ${formatTime(fulfillment.delivered_at)}`
                              : ""}
                          </div>
                        ) : null}

                        <div className="divide-y divide-slate-100">
                          {(fulfillment.items || []).map((item) => {
                            const itemStatus = String(item.allocation_status || "PLANNED").toUpperCase();
                            const itemTone = itemStatus === "DEDUCTED"
                              ? "success"
                              : itemStatus === "OUT_OF_STOCK"
                                ? "danger"
                                : itemStatus === "PLANNED"
                                  ? "warning"
                                  : "neutral";
                            const itemStatusLabel = itemStatus === "DEDUCTED" ? "DELIVERED" : itemStatus;
                            return (
                              <div key={item.allocation_id} className="px-4 py-3 text-sm">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-slate-900">{item.article_code || item.product_name}</p>
                                    <p className="text-xs text-slate-500">{[item.color, item.size].filter(Boolean).join(" · ") || item.product_name}</p>
                                  </div>
                                  <StatusBadge tone={itemTone}>{itemStatusLabel}</StatusBadge>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                                  <span>Allocated: <strong>{formatNumber(item.quantity)} pairs</strong></span>
                                  <span>Physically found: <strong>{item.verified_quantity === null ? "Not checked" : `${formatNumber(item.verified_quantity)} pairs`}</strong></span>
                                  {item.verification_status ? <span>Check: <strong>{String(item.verification_status).replace(/_/g, " ")}</strong></span> : null}
                                </div>
                                {item.verification_note ? (
                                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                                    Note: {item.verification_note}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                          {!(fulfillment.items || []).length ? (
                            <p className="px-4 py-4 text-sm text-slate-500">No active product allocations remain on this DN.</p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="font-bold text-slate-950">Order and warehouse history</h3>
                <p className="mb-3 text-sm text-slate-500">Newest activity appears first.</p>
                {loadingLockedOrderHistory ? (
                  <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">Loading history…</div>
                ) : lockedOrderHistory.length ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="divide-y divide-slate-100">
                      {lockedOrderHistory.map((log) => {
                        const metadata = log.metadata && typeof log.metadata === "object" ? log.metadata : {};
                        return (
                          <div key={log.id} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_150px_1fr]">
                            <div className="text-xs text-slate-500">
                              <strong className="block text-slate-700">{formatEnglishDate(log.created_at, { includeTime: false })}</strong>
                              {formatTime(log.created_at)}
                            </div>
                            <div className="text-xs">
                              <strong className="block text-slate-800">{log.user_name || "Unknown user"}</strong>
                              <span className="text-slate-500">{log.user_role || "-"}</span>
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone={String(log.action_type).toUpperCase() === "DELIVERED" ? "success" : String(log.action_type).toUpperCase() === "REVERSED" ? "danger" : "neutral"}>
                                  {String(log.action_type || "Activity").replace(/_/g, " ")}
                                </StatusBadge>
                                {metadata.warehouse_name ? <span className="text-xs font-semibold text-indigo-700">{metadata.warehouse_name}</span> : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-700">{log.description || "-"}</p>
                              {metadata.reason ? <p className="mt-1 text-xs text-amber-800">Reason: {metadata.reason}</p> : null}
                              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                                {metadata.delivered_pairs !== undefined ? <span>Delivered: {formatNumber(metadata.delivered_pairs)} pairs</span> : null}
                                {metadata.out_of_stock_pairs !== undefined ? <span>Out of stock: {formatNumber(metadata.out_of_stock_pairs)} pairs</span> : null}
                                {metadata.restored_pairs !== undefined ? <span>Restored: {formatNumber(metadata.restored_pairs)} pairs</span> : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
                    No activity history was found for this order.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOrder ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={() => !savingCancellation && setCancelOrder(null)}
        >
          <form
            onSubmit={submitCancellation}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Cancel Order #{cancelOrder.id}
              </h2>
              <p className="text-sm text-slate-500">
                Select the correct category so duplicate orders do not reduce
                product or dealer performance.
              </p>
            </div>

            <Field label="Cancellation category">
              <SelectInput
                value={cancellationCode}
                onChange={(event) => {
                  setCancellationCode(event.target.value);
                  if (event.target.value !== "DUPLICATE_ORDER") {
                    setDuplicateOfOrderId("");
                  }
                }}
              >
                {CANCELLATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>

            {cancellationCode === "DUPLICATE_ORDER" ? (
              <Field
                label="Original order number (optional)"
                hint="Enter the order that should remain active. The duplicate order will link to it for audit history."
              >
                <TextInput
                  type="number"
                  min="1"
                  step="1"
                  value={duplicateOfOrderId}
                  onChange={(event) => setDuplicateOfOrderId(event.target.value)}
                  placeholder="For example: 351"
                />
              </Field>
            ) : null}

            <Field
              label="Additional note"
              hint="Optional unless the category needs more explanation."
            >
              <TextAreaInput
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                placeholder="Explain what happened"
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={savingCancellation}
                onClick={() => setCancelOrder(null)}
              >
                Keep order
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={savingCancellation}
              >
                {savingCancellation ? "Cancelling..." : "Cancel order"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {correctionOrder ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={() => !savingCorrection && setCorrectionOrder(null)}>
          <form onSubmit={saveCorrection} onMouseDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Correct Order #{correctionOrder.id}</h2>
              <p className="text-sm text-slate-500">Only whole cartons are allowed. Reserved pairs update automatically when you save.</p>
            </div>

            <div className="space-y-3">
              {correctionItems.map((item, index) => {
                const selected = availabilityById.get(String(item.finished_good_id));
                const pairsPerCarton = Number(selected?.inner_boxes_per_outer_box || 0);
                const pairs = Number(item.carton_qty || 0) * pairsPerCarton;
                return (
                  <div key={`${item.finished_good_id}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_0.7fr_1fr_auto]">
                    <Select
                      options={availability.filter((product) => Number(product.inner_boxes_per_outer_box) > 0).map((product) => ({ value: String(product.id), label: `${product.article_code || product.name} · ${product.color || "No color"}` }))}
                      value={selected ? { value: String(selected.id), label: `${selected.article_code || selected.name} · ${selected.color || "No color"}` } : null}
                      onChange={(option) => setCorrectionItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, finished_good_id: option?.value || "" } : row))}
                      placeholder="Select product"
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }), control: (base) => ({ ...base, minHeight: "42px", borderRadius: "12px" }) }}
                    />
                    <Field label="CTN">
                      <TextInput type="number" min="1" step="1" required value={item.carton_qty} onChange={(event) => setCorrectionItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, carton_qty: event.target.value } : row))} />
                    </Field>
                    <div className="flex flex-col justify-end rounded-xl bg-white px-3 py-2 text-sm"><span className="text-xs text-slate-400">Reserved pairs</span><strong>{pairsPerCarton > 0 ? formatNumber(pairs) : "Set CTN config"}</strong></div>
                    <div className="flex items-end"><Button type="button" variant="danger" size="sm" disabled={correctionItems.length === 1} onClick={() => setCorrectionItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button></div>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="secondary" icon="plus" onClick={() => setCorrectionItems((current) => [...current, { finished_good_id: "", carton_qty: 1 }])}>Add product</Button>

            <Field label="Correction reason">
              <TextInput required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain why this order is being changed" />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={savingCorrection} onClick={() => setCorrectionOrder(null)}>Cancel</Button>
              <Button type="submit" disabled={savingCorrection || !correctionItems.length}>{savingCorrection ? "Saving..." : "Save correction"}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {verificationWarehouse ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={() => !verifyingWarehouseKey && setVerificationWarehouse(null)}
        >
          <form
            onSubmit={submitWarehouseVerification}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-4xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Verify {verificationWarehouse.fulfillment.warehouse_slip_number}
              </h2>
              <p className="text-sm text-slate-500">
                Enter the quantity physically found and save the check. No stock will be deducted until you use the separate Deliver button.
              </p>
            </div>

            <div className="space-y-3">
              {verificationItems.map((item) => {
                const planned = Number(item.quantity || 0);
                const deliverNow = Number(item.deliver_quantity || 0);
                const remaining = Math.max(0, planned - deliverNow);
                return (
                  <div key={item.allocation_id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-950">
                          {item.article_code || item.product_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[item.product_name, item.color, item.size].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                        Planned: {formatNumber(planned)} pairs
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
                      <Field label="Found and ready (pairs)">
                        <TextInput
                          type="number"
                          min="0"
                          max={planned}
                          step="1"
                          required
                          value={item.deliver_quantity}
                          onChange={(event) =>
                            updateVerificationItem(item.allocation_id, "deliver_quantity", event.target.value)
                          }
                        />
                      </Field>
                      <Field label={`Remaining (${formatNumber(remaining)})`}>
                        <SelectInput
                          value={item.remainder_action}
                          disabled={remaining <= 0}
                          onChange={(event) =>
                            updateVerificationItem(item.allocation_id, "remainder_action", event.target.value)
                          }
                        >
                          <option value="DELIVER_LATER">Deliver later</option>
                          <option value="NOT_FOUND">Not found — recheck later</option>
                          <option value="OUT_OF_STOCK">Close as out of stock</option>
                          <option value="FOUND_OTHER_WAREHOUSE">Found in another warehouse</option>
                        </SelectInput>
                      </Field>
                      <Field label="Warehouse note">
                        <TextInput
                          value={item.note}
                          maxLength={500}
                          onChange={(event) =>
                            updateVerificationItem(item.allocation_id, "note", event.target.value)
                          }
                          placeholder="Optional physical-count note"
                        />
                      </Field>
                    </div>
                    {remaining > 0 && item.remainder_action === "FOUND_OTHER_WAREHOUSE" ? (
                      <div className="mt-3 max-w-sm">
                        <Field label="Found in warehouse">
                          <SelectInput
                            required
                            value={item.target_warehouse_id}
                            onChange={(event) =>
                              updateVerificationItem(item.allocation_id, "target_warehouse_id", event.target.value)
                            }
                          >
                            <option value="">Select destination warehouse</option>
                            {warehouses
                              .filter(
                                (warehouse) =>
                                  Number(warehouse.id) !==
                                    Number(verificationWarehouse.fulfillment.warehouse_id) &&
                                  Number(warehouse.is_active) !== 0
                              )
                              .map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                  {warehouse.name}
                                </option>
                              ))}
                          </SelectInput>
                        </Field>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setVerificationItemAction(item.allocation_id, "ALL_FOUND")
                        }
                      >
                        All found
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setVerificationItemAction(item.allocation_id, "DELIVER_LATER")
                        }
                      >
                        Deliver later
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setVerificationItemAction(item.allocation_id, "NOT_FOUND")
                        }
                      >
                        Not found
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setVerificationItemAction(item.allocation_id, "OUT_OF_STOCK")
                        }
                      >
                        Out of stock
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setVerificationItemAction(
                            item.allocation_id,
                            "FOUND_OTHER_WAREHOUSE"
                          )
                        }
                      >
                        Found in another warehouse
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Deliver later and Not found remain pending. Out of stock permanently closes the missing quantity without deducting stock, allowing the found products and warehouse DN to be completed. Use Out of stock only after confirming that the product will not be delivered later.
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <div>
                {canCorrectOrders &&
                !(verificationWarehouse.order.warehouse_fulfillments || []).some(
                  (fulfillment) => Number(fulfillment.delivered_pairs || 0) > 0
                ) ? (
                  <Button type="button" variant="secondary" disabled={Boolean(verifyingWarehouseKey)} onClick={reopenFromVerification}>
                    Reopen & change products
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={Boolean(verifyingWarehouseKey)} onClick={() => setVerificationWarehouse(null)}>
                  Cancel
                </Button>
                <Button type="submit" icon="check" disabled={Boolean(verifyingWarehouseKey)}>
                  {verifyingWarehouseKey ? "Saving check…" : "Save product check"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
