import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";
import Select from "react-select";

const selectStyles = {
  control: (base) => ({
    ...base,
    minHeight: "44px",
    borderRadius: "12px",
    borderColor: "#d1d5db",
    boxShadow: "none",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

const boardColumns = [
  { key: "ORDERED", title: "Ordered", hint: "New slips" },
  { key: "SHIPPED", title: "Shipping", hint: "On the way" },
  { key: "AT_CUSTOMS", title: "Customs", hint: "Clearing" },
  { key: "DELIVERED", title: "Arrived", hint: "Delivered nearby" },
  { key: "REACHED_SITE", title: "At Site", hint: "Factory reached" },
  { key: "RECEIVED", title: "Checked", hint: "Verified only" },
];

const categoryOptions = ["Upper", "Sole", "Sole Powder", "Sole Foam", "Lace", "TPR", "Inner Box", "Outer Box"];
const OTHER_CATEGORY_VALUE = "__OTHER__";
const transportOptions = ["Sea", "Air", "Road", "Courier", "Hand Carry", "Other"];
const priceCurrencyOptions = ["RMB", "NPR"];

const statusTone = {
  ORDERED: "info",
  SHIPPED: "info",
  AT_CUSTOMS: "warning",
  DELIVERED: "success",
  REACHED_SITE: "success",
  RECEIVED: "success",
  CANCELLED: "danger",
};

const emptySlip = {
  order_number: "",
  supplier_name: "",
  supplier_country: "",
  sender_name: "",
  agent_name: "",
  shipping_method: "Sea",
  transport_company: "",
  tracking_number: "",
  order_date: new Date().toISOString().slice(0, 10),
  expected_delivery_date: "",
  container_number: "",
  material_name: "",
  raw_material_id: "",
  article_code: "",
  category: "",
  color: "",
  unit: "pcs",
  ordered_qty: "",
  notes: "",
};

const createSlipItem = (item = {}) => ({
  client_id: item.client_id || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  id: item.id || "",
  raw_material_id: item.raw_material_id || "",
  material_name: item.material_name || "",
  article_code: item.article_code || "",
  category: item.category || "",
  color: item.color || "",
  unit: item.unit || "pcs",
  ordered_qty: item.ordered_qty || "",
  unit_price: item.unit_price || "",
  price_currency: item.price_currency || "RMB",
  received_qty: Number(item.received_qty || 0),
  damaged_qty: Number(item.damaged_qty || 0),
  short_qty: Number(item.short_qty || 0),
  notes: item.notes || "",
});

const compactDate = (value) => (value ? String(value).slice(0, 10) : "");
const label = (value = "") => String(value).replace(/_/g, " ");
const wholeNumberValue = (value) => String(value || "").replace(/\D/g, "");
const wholeNumberInputProps = {
  type: "text",
  inputMode: "numeric",
  pattern: "[0-9]*",
};
const formatMoney = (amount, currency = "RMB") => `${currency || "RMB"} ${formatNumber(amount)}`;

const firstItem = (order) => order.items?.[0] || {};
const firstContainer = (order) => order.containers?.[0] || {};

const getItemStockStatus = (item) => {
  const orderedQty = Number(item.ordered_qty || 0);
  const receivedQty = Number(item.received_qty || 0);

  if (orderedQty > 0 && receivedQty >= orderedQty) {
    return { label: "Stock added", tone: "success", remaining: 0 };
  }

  if (receivedQty > 0) {
    return {
      label: "Partially added",
      tone: "warning",
      remaining: Math.max(orderedQty - receivedQty, 0),
    };
  }

  return { label: "Not added", tone: "neutral", remaining: orderedQty };
};

const getStockEntryStatus = (order) => {
  const items = order.items || [];
  const orderedQty = items.reduce((sum, item) => sum + Number(item.ordered_qty || 0), 0);
  const receivedQty = items.reduce((sum, item) => sum + Number(item.received_qty || 0), 0);

  if (orderedQty > 0 && receivedQty >= orderedQty) {
    return { label: "Stock added", tone: "success", remaining: 0 };
  }

  if (receivedQty > 0) {
    return {
      label: "Partially added",
      tone: "warning",
      remaining: Math.max(orderedQty - receivedQty, 0),
    };
  }

  if (["DELIVERED", "REACHED_SITE", "RECEIVED"].includes(order.status)) {
    return { label: "Pending stock entry", tone: "warning", remaining: orderedQty };
  }

  return { label: "Not added", tone: "neutral", remaining: orderedQty };
};

const orderToPayload = (order, status = order.status) => {
  const today = new Date().toISOString().slice(0, 10);

  return {
    order_number: order.order_number || "",
    supplier_name: order.supplier_name || "",
    supplier_country: order.supplier_country || "",
    sender_name: order.sender_name || "",
    agent_name: order.agent_name || "",
    shipping_method: order.shipping_method || "Sea",
    transport_company: order.transport_company || "",
    tracking_number: order.tracking_number || "",
    order_date: compactDate(order.order_date) || today,
    expected_delivery_date: compactDate(order.expected_delivery_date),
    shipped_date: compactDate(order.shipped_date) || (status === "SHIPPED" ? today : ""),
    delivered_date: compactDate(order.delivered_date) || (status === "DELIVERED" ? today : ""),
    reached_site_date: compactDate(order.reached_site_date) || (status === "REACHED_SITE" ? today : ""),
    status,
    is_test: Number(order.is_test ?? 1) === 1,
    notes: order.notes || "",
    items: (order.items || []).map((item) => ({
      raw_material_id: item.raw_material_id || "",
      material_name: item.material_name || "",
      article_code: item.article_code || "",
      category: item.category || "",
      color: item.color || "",
      unit: item.unit || "pcs",
      ordered_qty: Number(item.ordered_qty || 0),
      unit_price: Number(item.unit_price || 0),
      price_currency: item.price_currency || "RMB",
      received_qty: Number(item.received_qty || 0),
      damaged_qty: Number(item.damaged_qty || 0),
      short_qty: Number(item.short_qty || 0),
      notes: item.notes || "",
    })),
    containers: (order.containers || []).map((container) => ({
      container_number: container.container_number || "",
      seal_number: container.seal_number || "",
      container_size: container.container_size || "",
      status:
        status === "SHIPPED"
          ? "SHIPPED"
          : status === "DELIVERED" || status === "REACHED_SITE" || status === "RECEIVED"
          ? "ARRIVED"
          : container.status || "PLANNED",
      departure_date: compactDate(container.departure_date),
      expected_arrival_date: compactDate(container.expected_arrival_date),
      actual_arrival_date: compactDate(container.actual_arrival_date) || (status === "DELIVERED" ? today : ""),
      notes: container.notes || "",
      items: (container.items || []).map((item) => ({
        material_name: item.material_name,
        quantity: Number(item.quantity || 0),
      })),
    })),
  };
};

export default function ImportTrackingPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const canCreateImport = true;
  const canEditImport = true;
  const canDeleteImport = true;

  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({ search: "", date_from: "", date_to: "", is_test: "1" });
  const [slip, setSlip] = useState(emptySlip);
  const [slipItems, setSlipItems] = useState([createSlipItem()]);
  const [editingId, setEditingId] = useState(null);
  const [showSlipForm, setShowSlipForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [receivingItem, setReceivingItem] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ qty_received: "", damaged_qty: "", short_qty: "", notes: "" });
  const [customCategoryItems, setCustomCategoryItems] = useState({});

  const materialById = useMemo(
    () => new Map(materials.map((material) => [String(material.id), material])),
    [materials]
  );

  const materialOptions = useMemo(
    () =>
      materials.map((material) => ({
        value: String(material.id),
        label: [
          material.name,
          material.article_code ? `(${material.article_code})` : "",
          material.color ? `- ${material.color}` : "",
        ].filter(Boolean).join(" "),
      })),
    [materials]
  );

  const getSelectedMaterialOption = (rawMaterialId) =>
    materialOptions.find((option) => option.value === String(rawMaterialId || "")) || null;
  const getCategorySelectValue = (item) =>
    customCategoryItems[item.client_id] ? OTHER_CATEGORY_VALUE : item.category;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResult, materialsResult, reportResult] = await Promise.all([
        api.getImportOrders(token, { ...filters, limit: 300 }),
        api.getRawMaterials(token),
        api.getImportReport(token, filters),
      ]);

      setOrders(ordersResult.data || []);
      setMaterials(materialsResult.data || []);
      setReport(reportResult || null);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Import tracking failed to load",
        message: error.message || "Could not load import tracking data.",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, showToast, token]);

  useEffect(() => {
    load();
  }, [load]);

  const groupedOrders = useMemo(() => {
    const groups = new Map(boardColumns.map((column) => [column.key, []]));

    orders.forEach((order) => {
      const key = groups.has(order.status) ? order.status : "ORDERED";
      groups.get(key).push(order);
    });

    return groups;
  }, [orders]);

  const summary = report?.summary || {
    orders: orders.length,
    materials: orders.reduce((sum, order) => sum + (order.items?.length || 0), 0),
    containers: orders.reduce((sum, order) => sum + (order.containers?.length || 0), 0),
    ordered_qty: orders.reduce((sum, order) => sum + Number(order.total_ordered_qty || 0), 0),
    received_qty: orders.reduce((sum, order) => sum + Number(order.total_received_qty || 0), 0),
  };

  const receivedRows = useMemo(
    () =>
      orders.flatMap((order) =>
        (order.items || [])
          .filter((item) => Number(item.received_qty || 0) > 0)
          .map((item) => {
            const orderedQty = Number(item.ordered_qty || 0);
            const receivedQty = Number(item.received_qty || 0);
            const remainingQty = Math.max(orderedQty - receivedQty, 0);

            return {
              id: `${order.id}-${item.id}`,
              order_number: order.order_number,
              mode: Number(order.is_test ?? 1) === 1 ? "Test" : "Real",
              material_name: item.material_name,
              article_code: item.article_code,
              category: item.category,
              color: item.color,
              unit: item.unit || "",
              ordered_qty: orderedQty,
              unit_price: Number(item.unit_price || 0),
              price_currency: item.price_currency || "RMB",
              total_price: orderedQty * Number(item.unit_price || 0),
              received_qty: receivedQty,
              damaged_qty: Number(item.damaged_qty || 0),
              short_qty: Number(item.short_qty || 0),
              remaining_qty: remainingQty,
              supplier_name: order.supplier_name,
              container_number: firstContainer(order).container_number || "-",
              status: remainingQty > 0 ? "Partially added" : "Stock added",
            };
          })
      ),
    [orders]
  );

  const updateSlip = (key, value) => {
    setSlip((current) => ({ ...current, [key]: value }));
  };

  const updateSlipItem = (index, key, value) => {
    setSlipItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (key === "raw_material_id") {
          const material = materialById.get(String(value));
          if (material?.category && !categoryOptions.includes(material.category)) {
            setCustomCategoryItems((categories) => ({ ...categories, [item.client_id]: true }));
          } else {
            setCustomCategoryItems((categories) => ({ ...categories, [item.client_id]: false }));
          }

          return {
            ...item,
            raw_material_id: value,
            material_name: material?.name || item.material_name,
            article_code: material?.article_code || item.article_code,
            category: material?.category || item.category,
            color: material?.color || item.color,
            unit: material?.unit || item.unit || "pcs",
          };
        }

        return { ...item, [key]: value };
      })
    );
  };

  const addSlipItem = () => {
    setSlipItems((current) => [...current, createSlipItem()]);
  };

  const removeSlipItem = (index) => {
    setSlipItems((current) => (current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current));
  };

  const resetSlip = () => {
    setSlip(emptySlip);
    setSlipItems([createSlipItem()]);
    setEditingId(null);
    setShowSlipForm(false);
    setCustomCategoryItems({});
  };

  const updateItemCategory = (index, value) => {
    const item = slipItems[index];
    if (!item) return;

    if (value === OTHER_CATEGORY_VALUE) {
      setCustomCategoryItems((current) => ({ ...current, [item.client_id]: true }));
      updateSlipItem(index, "category", categoryOptions.includes(item.category) ? "" : item.category);
      return;
    }

    setCustomCategoryItems((current) => ({ ...current, [item.client_id]: false }));
    updateSlipItem(index, "category", value);
  };

  const buildSlipPayload = () => {
    const items = slipItems
      .map((item) => ({
        raw_material_id: item.raw_material_id || null,
        material_name: item.material_name,
        article_code: item.article_code,
        category: item.category,
        color: item.color,
        unit: item.unit || "pcs",
        ordered_qty: Number(item.ordered_qty || 0),
        unit_price: Number(item.unit_price || 0),
        price_currency: item.price_currency || "RMB",
        received_qty: Number(item.received_qty || 0),
        damaged_qty: Number(item.damaged_qty || 0),
        short_qty: Number(item.short_qty || 0),
        notes: item.notes || "",
      }))
      .filter((item) => item.material_name && item.ordered_qty > 0);

    return {
      order_number: slip.order_number,
      supplier_name: slip.supplier_name,
      supplier_country: slip.supplier_country,
      sender_name: slip.sender_name,
      agent_name: slip.agent_name,
      shipping_method: slip.shipping_method,
      transport_company: slip.transport_company,
      tracking_number: slip.tracking_number,
      order_date: slip.order_date,
      expected_delivery_date: slip.expected_delivery_date,
      status: "ORDERED",
      is_test: filters.is_test !== "0",
      notes: slip.notes,
      items,
      containers: slip.container_number
        ? [
            {
              container_number: slip.container_number,
              status: "PLANNED",
              expected_arrival_date: slip.expected_delivery_date,
              items: items.map((item, itemIndex) => ({
                item_index: itemIndex,
                raw_material_id: item.raw_material_id,
                material_name: item.material_name,
                quantity: Number(item.ordered_qty || 0),
              })),
            },
          ]
        : [],
    };
  };

  const submitSlip = async (event) => {
    event.preventDefault();

    if ((editingId && !canEditImport) || (!editingId && !canCreateImport)) {
      showToast({
        tone: "error",
        title: "Access denied",
        message: "You do not have permission to save import slips.",
      });
      return;
    }

    try {
      if (editingId) {
        const existing = orders.find((order) => Number(order.id) === Number(editingId));
        const payload = {
          ...orderToPayload(existing || {}, existing?.status || "ORDERED"),
          ...buildSlipPayload(),
          status: existing?.status || "ORDERED",
        };
        await api.updateImportOrder(editingId, payload, token);
        showToast({ tone: "success", title: "Order slip updated" });
      } else {
        await api.createImportOrder(buildSlipPayload(), token);
        showToast({ tone: "success", title: "Order slip created" });
      }

      resetSlip();
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Slip failed",
        message: error.message || "Could not save this order slip.",
      });
    }
  };

  const editSlip = (order) => {
    if (!canEditImport) return;

    const container = firstContainer(order);
    const items = (order.items?.length ? order.items : [firstItem(order)]).map((item) => createSlipItem(item));
    const customCategories = {};
    items.forEach((item) => {
      customCategories[item.client_id] = Boolean(item.category && !categoryOptions.includes(item.category));
    });

    setSlip({
      ...emptySlip,
      order_number: order.order_number || "",
      supplier_name: order.supplier_name || "",
      supplier_country: order.supplier_country || "",
      sender_name: order.sender_name || "",
      agent_name: order.agent_name || "",
      shipping_method: order.shipping_method || "Sea",
      transport_company: order.transport_company || "",
      tracking_number: order.tracking_number || "",
      order_date: compactDate(order.order_date) || emptySlip.order_date,
      expected_delivery_date: compactDate(order.expected_delivery_date),
      container_number: container.container_number || "",
      notes: order.notes || "",
    });
    setSlipItems(items);
    setCustomCategoryItems(customCategories);
    setEditingId(order.id);
    setShowSlipForm(true);
  };

  const deleteSlip = async (order) => {
    if (!canDeleteImport) return;

    if (!window.confirm(`Delete ${order.order_number}?`)) return;

    try {
      await api.deleteImportOrder(order.id, token);
      showToast({ tone: "success", title: "Order slip deleted" });
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Delete failed",
        message: error.message || "Could not delete this slip.",
      });
    }
  };

  const createMaterialFromSlip = async (order, item) => {
    if (!canEditImport) return;

    if (!item.id || item.raw_material_id) return;

    const isTest = Number(order.is_test ?? 1) === 1;
    const baseName = item.material_name || "this material";
    const materialName = isTest && !baseName.startsWith("[TEST]") ? `[TEST] ${baseName}` : baseName;
    const confirmed = window.confirm(
      `Create raw material "${materialName}" with quantity 0?\n\nThis will only register the material name. It will not add stock.`
    );

    if (!confirmed) return;

    try {
      const result = await api.createRawMaterialFromImportItem(order.id, item.id, token);
      showToast({
        tone: "success",
        title: result.data?.linked_existing ? "Material linked" : "Material created",
        message: result.message || `${materialName} is now linked to this slip.`,
      });
      setViewingOrder(null);
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Material setup failed",
        message: error.message || "Could not create the raw material from this slip.",
      });
    }
  };

  const openReceiveModal = (order, item) => {
    if (!canEditImport) return;

    const remainingQty = Math.max(Number(item.ordered_qty || 0) - Number(item.received_qty || 0), 0);

    setReceivingOrder(order);
    setReceivingItem(item);
    setViewingOrder(null);
    setReceiveForm({
      qty_received: remainingQty || item.ordered_qty || "",
      damaged_qty: "",
      short_qty: "",
      notes: "",
    });
  };

  const submitReceiveStock = async (event) => {
    event.preventDefault();
    if (!receivingOrder || !receivingItem) return;

    if (!canEditImport) {
      showToast({
        tone: "error",
        title: "Access denied",
        message: "You do not have permission to receive import stock.",
      });
      return;
    }

    const item = receivingItem;
    const isTest = Number(receivingOrder.is_test ?? 1) === 1;
    const qtyReceived = Number(receiveForm.qty_received || 0);

    if (!isTest && !item.raw_material_id) {
      showToast({
        tone: "error",
        title: "Material not linked",
        message: "Create or link the raw material before adding real stock.",
      });
      return;
    }

    const confirmed = window.confirm(
      isTest
        ? "Mark this test slip as received? Real raw material stock will not change."
        : `Add ${formatNumber(qtyReceived)} ${item.unit || ""} to raw material stock?`
    );

    if (!confirmed) return;

    try {
      const result = await api.receiveImportItemStock(
        receivingOrder.id,
        item.id,
        {
          qty_received: qtyReceived,
          damaged_qty: Number(receiveForm.damaged_qty || 0),
          short_qty: Number(receiveForm.short_qty || 0),
          notes: receiveForm.notes,
        },
        token
      );

      showToast({
        tone: "success",
        title: isTest ? "Test slip received" : "Stock added",
        message: result.message || "Import slip stock status updated.",
      });
      setReceivingOrder(null);
      setReceivingItem(null);
      setReceiveForm({ qty_received: "", damaged_qty: "", short_qty: "", notes: "" });
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Receive failed",
        message: error.message || "Could not receive this import slip.",
      });
    }
  };

  const moveOrder = async (orderId, nextStatus) => {
    if (!canEditImport) return;

    const order = orders.find((item) => Number(item.id) === Number(orderId));
    if (!order || order.status === nextStatus) return;

    const previousOrders = orders;
    setOrders((current) =>
      current.map((item) => (Number(item.id) === Number(orderId) ? { ...item, status: nextStatus } : item))
    );

    try {
      await api.updateImportOrder(order.id, orderToPayload(order, nextStatus), token);
      showToast({ tone: "success", title: `Moved to ${label(nextStatus)}` });
      await load();
    } catch (error) {
      setOrders(previousOrders);
      showToast({
        tone: "error",
        title: "Move failed",
        message: error.message || "Could not move this order slip.",
      });
    }
  };

  const exportReport = () => {
    const rows = orders.flatMap((order) =>
      (order.items || []).map((item) => ({
        "Order No": order.order_number,
        Mode: Number(order.is_test ?? 1) === 1 ? "Test" : "Real",
        Supplier: order.supplier_name,
        By: order.agent_name,
        "Transportation": order.shipping_method || "",
        Status: label(order.status),
        Material: item.material_name || "-",
        "Article Code": item.article_code || "",
        Category: item.category || "",
        Color: item.color || "",
        Quantity: Number(item.ordered_qty || 0),
        "Unit Price": Number(item.unit_price || 0),
        Currency: item.price_currency || "RMB",
        "Total Price": Number(item.ordered_qty || 0) * Number(item.unit_price || 0),
        Received: Number(item.received_qty || 0),
        Unit: item.unit || "",
        Container: firstContainer(order).container_number || "-",
        "Order Date": compactDate(order.order_date),
        "Expected Date": compactDate(order.expected_delivery_date),
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Import Board");
    XLSX.writeFile(workbook, "import-tracking-board.xlsx");
  };

  const renderCard = (order) => {
    const items = order.items || [];
    const container = firstContainer(order);
    const isTest = Number(order.is_test ?? 1) === 1;
    const stockStatus = getStockEntryStatus(order);
    const totalOrdered = items.reduce((sum, item) => sum + Number(item.ordered_qty || 0), 0);
    const totalReceived = items.reduce((sum, item) => sum + Number(item.received_qty || 0), 0);
    const priceTotals = items.reduce((totals, item) => {
      const currency = item.price_currency || "RMB";
      totals[currency] = (totals[currency] || 0) + Number(item.ordered_qty || 0) * Number(item.unit_price || 0);
      return totals;
    }, {});
    const linkedCount = items.filter((item) => item.raw_material_id).length;
    const unlinkedCount = items.length - linkedCount;

    return (
      <article
        key={order.id}
        draggable={canEditImport}
        onDragStart={(event) => {
          if (!canEditImport) return;
          setDraggingId(order.id);
          event.dataTransfer.setData("text/plain", String(order.id));
        }}
        onDragEnd={() => setDraggingId(null)}
        className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          Number(draggingId) === Number(order.id) ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{order.order_number}</p>
            <p className="truncate text-xs text-slate-500">{order.supplier_name}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge tone={Number(order.is_test ?? 1) === 1 ? "warning" : "success"}>
              {Number(order.is_test ?? 1) === 1 ? "TEST" : "REAL"}
            </StatusBadge>
            <StatusBadge tone={statusTone[order.status] || "neutral"}>{label(order.status)}</StatusBadge>
            <StatusBadge tone={stockStatus.tone}>{stockStatus.label}</StatusBadge>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-xs text-slate-600">
          <p className="font-medium text-slate-800">
            {formatNumber(items.length)} {items.length === 1 ? "material" : "materials"}
          </p>
          <p>Ordered total: <span className="font-semibold">{formatNumber(totalOrdered)}</span></p>
          <p>Received total: <span className="font-semibold">{formatNumber(totalReceived)}</span></p>
          <p>
            Price total:{" "}
            <span className="font-semibold">
              {Object.entries(priceTotals).length
                ? Object.entries(priceTotals).map(([currency, amount]) => formatMoney(amount, currency)).join(" / ")
                : "-"}
            </span>
          </p>
          <p>Linked: {formatNumber(linkedCount)} / {formatNumber(items.length)}</p>
          {unlinkedCount > 0 ? <p className="font-medium text-amber-700">{formatNumber(unlinkedCount)} item needs material link</p> : null}
          <div className="space-y-1">
            {items.slice(0, 3).map((item) => (
              <p key={item.id || item.material_name} className="truncate">
                {item.material_name || "No material"} · {formatNumber(item.ordered_qty)} {item.unit || ""}
              </p>
            ))}
            {items.length > 3 ? <p className="text-slate-400">+ {items.length - 3} more</p> : null}
          </div>
          <p>By: {order.agent_name || "-"}</p>
          <p>Transportation: {order.shipping_method || "-"}</p>
          <p>Container: {container.container_number || "-"}</p>
          <p>Expected: {order.expected_delivery_date ? formatDate(order.expected_delivery_date, { includeTime: false }) : "-"}</p>
        </div>

        <div className="mt-3 grid gap-2">
          <Button size="sm" icon="check" onClick={() => setViewingOrder(order)}>
            View / receive items
          </Button>
        </div>

        <div className="mt-2 flex gap-2">
          {canEditImport ? (
            <Button size="sm" variant="secondary" icon="edit" onClick={() => editSlip(order)}>
              Edit
            </Button>
          ) : null}
          {canDeleteImport ? (
            <Button size="sm" variant="danger" icon="delete" onClick={() => deleteSlip(order)}>
              Delete
            </Button>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Raw Material Logistics"
        title="Import Tracking"
        description="Create an order slip, then drag it through the factory import stages."
        icon="purchase"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="download" onClick={exportReport} disabled={!orders.length}>
              Export
            </Button>
            {canCreateImport ? (
              <Button icon="plus" onClick={() => setShowSlipForm((open) => !open)}>
                New {filters.is_test === "1" ? "test" : "real"} slip
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Slips" value={formatNumber(summary.orders)} icon="orders" />
        <StatCard label="Materials" value={formatNumber(summary.materials)} icon="materials" />
        <StatCard label="Containers" value={formatNumber(summary.containers)} icon="box" />
        <StatCard label="Ordered Qty" value={formatNumber(summary.ordered_qty)} icon="purchase" />
        <StatCard label="Received Qty" value={formatNumber(summary.received_qty)} icon="check" />
      </div>

      <SectionCard title="Mode" subtitle="Keep test import slips separate from real import tracking." icon="permission">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {filters.is_test === "1" ? "Testing board" : "Real import board"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {filters.is_test === "1"
                ? "New slips are marked as test data and stay out of the real board."
                : "New slips are real records. Use this after you finish testing."}
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setFilters((current) => ({ ...current, is_test: "1" }))}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filters.is_test === "1" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Test slips
            </button>
            <button
              type="button"
              onClick={() => setFilters((current) => ({ ...current, is_test: "0" }))}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filters.is_test === "0" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Real slips
            </button>
          </div>
        </div>
      </SectionCard>

      {showSlipForm ? (
        <SectionCard
          title={editingId ? "Edit order slip" : "New order slip"}
          subtitle="Tracking only. This will not add raw material stock."
          icon="purchase"
        >
          <form className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitSlip}>
            <Field label="Supplier">
              <TextInput value={slip.supplier_name} onChange={(event) => updateSlip("supplier_name", event.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Order date">
              <TextInput type="date" value={slip.order_date} onChange={(event) => updateSlip("order_date", event.target.value)} required />
            </Field>
            <Field label="By">
              <TextInput value={slip.agent_name} onChange={(event) => updateSlip("agent_name", event.target.value)} placeholder="Who ordered / handled" />
            </Field>
            <Field label="Mode of transportation">
              <SelectInput value={slip.shipping_method} onChange={(event) => updateSlip("shipping_method", event.target.value)}>
                {transportOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Country / place">
              <TextInput value={slip.supplier_country} onChange={(event) => updateSlip("supplier_country", event.target.value)} placeholder="China, India..." />
            </Field>
            <div className="space-y-3 md:col-span-2 xl:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Materials in this order</p>
                  <p className="text-xs text-slate-500">Add every raw material from this purchase slip.</p>
                </div>
                <Button size="sm" variant="secondary" icon="plus" onClick={addSlipItem}>
                  Add material
                </Button>
              </div>

              <div className="space-y-3">
                {slipItems.map((item, index) => (
                  <div key={item.client_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Item {index + 1}</p>
                      <Button
                        size="sm"
                        variant="danger"
                        icon="delete"
                        onClick={() => removeSlipItem(index)}
                        disabled={slipItems.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Existing raw material">
                        <Select
                          options={materialOptions}
                          value={getSelectedMaterialOption(item.raw_material_id)}
                          onChange={(selected) => updateSlipItem(index, "raw_material_id", selected?.value || "")}
                          placeholder="Search raw material..."
                          isClearable
                          menuPortalTarget={document.body}
                          menuPosition="fixed"
                          styles={selectStyles}
                        />
                      </Field>
                      <Field label="Name">
                        <TextInput value={item.material_name} onChange={(event) => updateSlipItem(index, "material_name", event.target.value)} required />
                      </Field>
                      <Field label="Article code">
                        <TextInput value={item.article_code} onChange={(event) => updateSlipItem(index, "article_code", event.target.value)} />
                      </Field>
                      <Field label="Category">
                        <SelectInput value={getCategorySelectValue(item)} onChange={(event) => updateItemCategory(index, event.target.value)}>
                          <option value="">Select category</option>
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                          <option value={OTHER_CATEGORY_VALUE}>Other</option>
                        </SelectInput>
                        {customCategoryItems[item.client_id] ? (
                          <TextInput
                            className="mt-2"
                            value={item.category}
                            onChange={(event) => updateSlipItem(index, "category", event.target.value)}
                            placeholder="Enter new category"
                          />
                        ) : null}
                      </Field>
                      <Field label="Color">
                        <TextInput value={item.color} onChange={(event) => updateSlipItem(index, "color", event.target.value)} />
                      </Field>
                      <Field label="Quantity">
                        <TextInput
                          {...wholeNumberInputProps}
                          value={item.ordered_qty}
                          onChange={(event) => updateSlipItem(index, "ordered_qty", wholeNumberValue(event.target.value))}
                          required
                        />
                      </Field>
                      <Field label="Price">
                        <TextInput
                          {...wholeNumberInputProps}
                          value={item.unit_price}
                          onChange={(event) => updateSlipItem(index, "unit_price", wholeNumberValue(event.target.value))}
                        />
                      </Field>
                      <Field label="Currency">
                        <SelectInput value={item.price_currency || "RMB"} onChange={(event) => updateSlipItem(index, "price_currency", event.target.value)}>
                          {priceCurrencyOptions.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Unit">
                        <TextInput value={item.unit} onChange={(event) => updateSlipItem(index, "unit", event.target.value)} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Field label="Container no.">
              <TextInput value={slip.container_number} onChange={(event) => updateSlip("container_number", event.target.value)} />
            </Field>
            <Field label="Expected date">
              <TextInput type="date" value={slip.expected_delivery_date} onChange={(event) => updateSlip("expected_delivery_date", event.target.value)} />
            </Field>
            <Field label="Tracking / bill no.">
              <TextInput value={slip.tracking_number} onChange={(event) => updateSlip("tracking_number", event.target.value)} />
            </Field>
            <Field label="Sender">
              <TextInput value={slip.sender_name} onChange={(event) => updateSlip("sender_name", event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-4">
              <Button type="submit" icon={editingId ? "check" : "plus"}>
                {editingId ? "Update slip" : "Create slip"}
              </Button>
              <Button variant="secondary" onClick={resetSlip}>
                Cancel
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Import board" subtitle="Drag slips from left to right as work progresses." icon="ledger">
        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
            <TextInput
              placeholder="Search supplier, by, material, container..."
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
            <TextInput
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
            <TextInput
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
            <Button variant="secondary" icon="refresh" onClick={load}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Loading import board...
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="flex w-max min-w-full gap-3">
                {boardColumns.map((column) => {
                  const columnOrders = groupedOrders.get(column.key) || [];

                  return (
                    <section
                      key={column.key}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!canEditImport) return;
                        moveOrder(event.dataTransfer.getData("text/plain"), column.key);
                      }}
                      className="min-h-[420px] w-[280px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <div className="border-b border-slate-200 px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{column.title}</p>
                            <p className="text-xs text-slate-500">{column.hint}</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            {columnOrders.length}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-3 p-3">
                        {columnOrders.length ? (
                          columnOrders.map(renderCard)
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-6 text-center text-xs text-slate-400">
                            Drop slips here
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Received materials"
        subtitle="Items that have been marked received from import slips."
        icon="check"
      >
        <div className="p-4">
          {receivedRows.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {receivedRows.map((row) => (
                  <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.material_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.order_number} · {row.supplier_name || "-"}
                        </p>
                      </div>
                      <StatusBadge tone={row.mode === "Test" ? "warning" : "success"}>{row.mode}</StatusBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <p>Article: <span className="font-medium text-slate-800">{row.article_code || "-"}</span></p>
                      <p>Color: <span className="font-medium text-slate-800">{row.color || "-"}</span></p>
                      <p>Ordered: <span className="font-medium text-slate-800">{formatNumber(row.ordered_qty)} {row.unit}</span></p>
                      <p>Price: <span className="font-medium text-slate-800">{formatMoney(row.unit_price, row.price_currency)}</span></p>
                      <p>Received: <span className="font-medium text-slate-800">{formatNumber(row.received_qty)} {row.unit}</span></p>
                      <p>Total: <span className="font-medium text-slate-800">{formatMoney(row.total_price, row.price_currency)}</span></p>
                      <p>Damaged: <span className="font-medium text-slate-800">{formatNumber(row.damaged_qty)} {row.unit}</span></p>
                      <p>Short: <span className="font-medium text-slate-800">{formatNumber(row.short_qty)} {row.unit}</span></p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Mode", "Order", "Material", "Article", "Category", "Color", "Ordered", "Price", "Total", "Received", "Damaged", "Short", "Remaining", "Supplier", "Container", "Status"].map((heading) => (
                        <th key={heading} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {receivedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusBadge tone={row.mode === "Test" ? "warning" : "success"}>{row.mode}</StatusBadge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">{row.order_number}</td>
                        <td className="min-w-[180px] px-3 py-3 text-slate-700">{row.material_name}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.article_code || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.category || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.color || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.ordered_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(row.unit_price, row.price_currency)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(row.total_price, row.price_currency)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700">{formatNumber(row.received_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.damaged_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.short_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.remaining_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.supplier_name || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.container_number}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusBadge tone={row.remaining_qty > 0 ? "warning" : "success"}>{row.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No received materials yet. Use Mark test received or Receive stock on a slip first.
            </div>
          )}
        </div>
      </SectionCard>

      {viewingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <p className="text-base font-semibold text-slate-900">Items in {viewingOrder.order_number}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Receive each material separately when it arrives.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setViewingOrder(null)}>
                Close
              </Button>
            </div>

            <div className="max-h-[72vh] overflow-auto p-4">
              <div className="space-y-3 md:hidden">
                {(viewingOrder.items || []).map((item) => {
                  const itemStatus = getItemStockStatus(item);
                  const isTest = Number(viewingOrder.is_test ?? 1) === 1;
                  const canReceiveItem = itemStatus.remaining > 0 && (isTest || item.raw_material_id);

                  return (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.material_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.category || "-"} · {item.color || "-"}</p>
                        </div>
                        <StatusBadge tone={itemStatus.tone}>{itemStatus.label}</StatusBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <p>Ordered: <span className="font-medium text-slate-800">{formatNumber(item.ordered_qty)} {item.unit || ""}</span></p>
                        <p>Price: <span className="font-medium text-slate-800">{formatMoney(item.unit_price || 0, item.price_currency)}</span></p>
                        <p>Received: <span className="font-medium text-slate-800">{formatNumber(item.received_qty || 0)} {item.unit || ""}</span></p>
                        <p>Total: <span className="font-medium text-slate-800">{formatMoney(Number(item.ordered_qty || 0) * Number(item.unit_price || 0), item.price_currency)}</span></p>
                        <p>Damaged: <span className="font-medium text-slate-800">{formatNumber(item.damaged_qty || 0)} {item.unit || ""}</span></p>
                        <p>Short: <span className="font-medium text-slate-800">{formatNumber(item.short_qty || 0)} {item.unit || ""}</span></p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {item.raw_material_id ? (
                          <Button size="sm" variant="secondary" icon="check" disabled>
                            Linked material
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            icon="plus"
                            disabled={!canEditImport}
                            onClick={() => createMaterialFromSlip(viewingOrder, item)}
                          >
                            {isTest ? "Create test material" : "Create material"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={canReceiveItem ? "primary" : "secondary"}
                          icon="check"
                          disabled={!canReceiveItem || !canEditImport}
                          onClick={() => openReceiveModal(viewingOrder, item)}
                        >
                          {isTest ? "Mark received" : item.raw_material_id ? "Receive stock" : "Link material first"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Material", "Article", "Category", "Color", "Ordered", "Price", "Total", "Received", "Damaged", "Short", "Remaining", "Status", "Material Link", "Action"].map((heading) => (
                        <th key={heading} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(viewingOrder.items || []).map((item) => {
                      const itemStatus = getItemStockStatus(item);
                      const isTest = Number(viewingOrder.is_test ?? 1) === 1;
                      const canReceiveItem = itemStatus.remaining > 0 && (isTest || item.raw_material_id);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="min-w-[180px] px-3 py-3 font-medium text-slate-900">{item.material_name}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.article_code || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.category || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.color || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.ordered_qty)} {item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(item.unit_price || 0, item.price_currency)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(Number(item.ordered_qty || 0) * Number(item.unit_price || 0), item.price_currency)}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700">{formatNumber(item.received_qty || 0)} {item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.damaged_qty || 0)} {item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.short_qty || 0)} {item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(itemStatus.remaining)} {item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <StatusBadge tone={itemStatus.tone}>{itemStatus.label}</StatusBadge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {item.raw_material_id ? (
                              <StatusBadge tone="success">Linked</StatusBadge>
                            ) : (
                              <Button
                                size="sm"
                                icon="plus"
                                disabled={!canEditImport}
                                onClick={() => createMaterialFromSlip(viewingOrder, item)}
                              >
                                {isTest ? "Create test material" : "Create material"}
                              </Button>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <Button
                              size="sm"
                              variant={canReceiveItem ? "primary" : "secondary"}
                              icon="check"
                              disabled={!canReceiveItem || !canEditImport}
                              onClick={() => openReceiveModal(viewingOrder, item)}
                            >
                              {isTest ? "Mark received" : item.raw_material_id ? "Receive stock" : "Link material first"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {receivingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitReceiveStock}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200"
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-900">
                {Number(receivingOrder.is_test ?? 1) === 1 ? "Mark test slip received" : "Receive into raw materials"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {receivingItem?.material_name} · {receivingOrder.order_number}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Received qty">
                <TextInput
                  {...wholeNumberInputProps}
                  value={receiveForm.qty_received}
                  onChange={(event) => setReceiveForm((current) => ({ ...current, qty_received: wholeNumberValue(event.target.value) }))}
                  required
                />
              </Field>
              <Field label="Damaged qty">
                <TextInput
                  {...wholeNumberInputProps}
                  value={receiveForm.damaged_qty}
                  onChange={(event) => setReceiveForm((current) => ({ ...current, damaged_qty: wholeNumberValue(event.target.value) }))}
                />
              </Field>
              <Field label="Short qty">
                <TextInput
                  {...wholeNumberInputProps}
                  value={receiveForm.short_qty}
                  onChange={(event) => setReceiveForm((current) => ({ ...current, short_qty: wholeNumberValue(event.target.value) }))}
                />
              </Field>
              <div className="sm:col-span-3">
                <Field
                  label="Notes"
                  hint={
                    Number(receivingOrder.is_test ?? 1) === 1
                      ? "Test mode updates only this import slip. Raw material stock is not changed."
                      : "Real mode creates a stock batch and increases the linked raw material quantity."
                  }
                >
                  <TextAreaInput
                    value={receiveForm.notes}
                    onChange={(event) => setReceiveForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Container checked, shortage reason, damage note..."
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setReceivingOrder(null);
                  setReceivingItem(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" icon="check">
                {Number(receivingOrder.is_test ?? 1) === 1 ? "Mark received" : "Add stock"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
