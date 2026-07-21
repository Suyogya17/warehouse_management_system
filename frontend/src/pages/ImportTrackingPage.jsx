import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import { Field, SelectInput, TextInput } from "../components/Field";
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
  loading_date: "",
  vehicle_no: "",
  vehicle_size: "",
  destination: "",
  ocean_company: "",
  order_date: new Date().toISOString().slice(0, 10),
  expected_delivery_date: "",
  container_number: "",
  material_name: "",
  raw_material_id: "",
  article_code: "",
  category: "",
  color: "",
  size: "",
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
  size: item.size || "",
  unit: item.unit || "pcs",
  carton_qty: item.carton_qty || "",
  qty_per_carton: item.qty_per_carton || "",
  ordered_qty: item.ordered_qty || "",
  unit_price: item.unit_price || "",
  price_currency: item.price_currency || "RMB",
  creditor: item.creditor || "",
  received_qty: Number(item.received_qty || 0),
  damaged_qty: Number(item.damaged_qty || 0),
  short_qty: Number(item.short_qty || 0),
  notes: item.notes || "",
});

const compactDate = (value) => (value ? String(value).slice(0, 10) : "");
const label = (value = "") => String(value).replace(/_/g, " ");
const decimalNumberValue = (value) => {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  const [first, ...rest] = cleaned.split(".");
  return rest.length ? `${first}.${rest.join("")}` : first;
};
const formatMoney = (amount, currency = "RMB") => `${currency || "RMB"} ${formatNumber(amount)}`;
const VIEWING_ITEMS_PER_PAGE = 15;
const RECEIVED_ROWS_PER_PAGE = 15;

const firstItem = (order) => order.items?.[0] || {};
const firstContainer = (order) => order.containers?.[0] || {};

const getItemStockStatus = (item) => {
  const orderedQty = Number(item.ordered_qty || 0);
  const receivedQty = Number(item.received_qty || 0);

  if (orderedQty > 0 && receivedQty >= orderedQty) {
    return { label: "Received", tone: "success", remaining: 0 };
  }

  if (receivedQty > 0) {
    return {
      label: "Partially received",
      tone: "warning",
      remaining: Math.max(orderedQty - receivedQty, 0),
    };
  }

  return { label: "Not received", tone: "neutral", remaining: orderedQty };
};

const getStockEntryStatus = (order) => {
  const items = order.items || [];
  const orderedQty = items.reduce((sum, item) => sum + Number(item.ordered_qty || 0), 0);
  const receivedQty = items.reduce((sum, item) => sum + Number(item.received_qty || 0), 0);

  if (orderedQty > 0 && receivedQty >= orderedQty) {
    return { label: "Received", tone: "success", remaining: 0 };
  }

  if (receivedQty > 0) {
    return {
      label: "Partially received",
      tone: "warning",
      remaining: Math.max(orderedQty - receivedQty, 0),
    };
  }

  if (["DELIVERED", "REACHED_SITE", "RECEIVED"].includes(order.status)) {
    return { label: "Pending receipt", tone: "warning", remaining: orderedQty };
  }

  return { label: "Not received", tone: "neutral", remaining: orderedQty };
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
    loading_date: compactDate(order.loading_date),
    expected_delivery_date: compactDate(order.expected_delivery_date),
    shipped_date: compactDate(order.shipped_date) || (status === "SHIPPED" ? today : ""),
    delivered_date: compactDate(order.delivered_date) || (status === "DELIVERED" ? today : ""),
    reached_site_date: compactDate(order.reached_site_date) || (status === "REACHED_SITE" ? today : ""),
    status,
    vehicle_no: order.vehicle_no || "",
    vehicle_size: order.vehicle_size || "",
    destination: order.destination || "",
    ocean_company: order.ocean_company || "",
    is_test: Number(order.is_test ?? 1) === 1,
    notes: order.notes || "",
    items: (order.items || []).map((item) => ({
      raw_material_id: item.raw_material_id || "",
      material_name: item.material_name || "",
      article_code: item.article_code || "",
      category: item.category || "",
      color: item.color || "",
      size: item.size || "",
      unit: item.unit || "pcs",
      carton_qty: Number(item.carton_qty || 0),
      qty_per_carton: Number(item.qty_per_carton || 0),
      ordered_qty: Number(item.ordered_qty || 0),
      unit_price: Number(item.unit_price || 0),
      price_currency: item.price_currency || "RMB",
      creditor: item.creditor || "",
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
  const [viewingItemsPage, setViewingItemsPage] = useState(1);
  const [receivedRowsPage, setReceivedRowsPage] = useState(1);
  const [receivingItemIds, setReceivingItemIds] = useState([]);
  const [customCategoryItems, setCustomCategoryItems] = useState({});
  const [splitModal, setSplitModal] = useState(null);
  const [splitRows, setSplitRows] = useState([]);
  const [addingSplitStockIds, setAddingSplitStockIds] = useState([]);
  const [savingSplits, setSavingSplits] = useState(false);

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

    (Array.isArray(orders) ? orders : []).forEach((order) => {
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
              size: item.size || "",
              unit: item.unit || "",
              carton_qty: Number(item.carton_qty || 0),
              qty_per_carton: Number(item.qty_per_carton || 0),
              ordered_qty: orderedQty,
              unit_price: Number(item.unit_price || 0),
              price_currency: item.price_currency || "RMB",
              total_price: orderedQty * Number(item.unit_price || 0),
              creditor: item.creditor || "",
              notes: item.notes || "",
              received_qty: receivedQty,
              damaged_qty: Number(item.damaged_qty || 0),
              short_qty: Number(item.short_qty || 0),
              remaining_qty: remainingQty,
              supplier_name: order.supplier_name,
              container_number: firstContainer(order).container_number || "-",
              status: remainingQty > 0 ? "Partially received" : "Received",
            };
          })
      ),
    [orders]
  );

  const receivedPageCount = Math.max(1, Math.ceil(receivedRows.length / RECEIVED_ROWS_PER_PAGE));
  const receivedPage = Math.min(receivedRowsPage, receivedPageCount);
  const paginatedReceivedRows = receivedRows.slice(
    (receivedPage - 1) * RECEIVED_ROWS_PER_PAGE,
    receivedPage * RECEIVED_ROWS_PER_PAGE
  );

  const receivedPageNumbers = useMemo(() => {
    const pages = new Set([1, receivedPageCount]);
    for (let page = receivedPage - 2; page <= receivedPage + 2; page += 1) {
      if (page >= 1 && page <= receivedPageCount) pages.add(page);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [receivedPage, receivedPageCount]);

  const viewingItems = viewingOrder?.items || [];
  const viewingPageCount = Math.max(1, Math.ceil(viewingItems.length / VIEWING_ITEMS_PER_PAGE));
  const viewingPage = Math.min(viewingItemsPage, viewingPageCount);
  const paginatedViewingItems = viewingItems.slice(
    (viewingPage - 1) * VIEWING_ITEMS_PER_PAGE,
    viewingPage * VIEWING_ITEMS_PER_PAGE
  );

  const viewingPageNumbers = useMemo(() => {
    const pages = new Set([1, viewingPageCount]);
    for (let page = viewingPage - 2; page <= viewingPage + 2; page += 1) {
      if (page >= 1 && page <= viewingPageCount) pages.add(page);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [viewingPage, viewingPageCount]);
  const splitTotalQty = splitRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const splitMaxQty = splitModal
    ? Number(splitModal.item.received_qty || 0) > 0
      ? Number(splitModal.item.received_qty || 0)
      : Number(splitModal.item.ordered_qty || 0)
    : 0;
  const splitRemainingQty = Math.max(splitMaxQty - splitTotalQty, 0);

  const openViewingOrder = (order) => {
    setViewingItemsPage(1);
    setViewingOrder(order);
  };

  const setSlipMode = (isTestMode) => {
    setFilters((current) => ({ ...current, is_test: isTestMode ? "1" : "0" }));
    setViewingOrder(null);
    setSplitModal(null);
    setShowSlipForm(false);
    setEditingId(null);
    setViewingItemsPage(1);
    setReceivedRowsPage(1);
  };

  const createSplitRow = (item = {}) => ({
    client_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: item.id || null,
    raw_material_id: item.raw_material_id || null,
    stock_added_at: item.stock_added_at || null,
    product_article: item.product_article || "",
    product_name: item.product_name || "",
    color: item.color || "",
    size: item.size || "",
    quantity: item.quantity || "",
    note: item.note || "",
  });

  const openSplitModal = (order, item) => {
    const rows = item.splits?.length
      ? item.splits.map((split) => createSplitRow(split))
      : [createSplitRow({ color: item.color || "", size: item.size || "" })];

    setSplitModal({ order, item });
    setSplitRows(rows);
  };

  const updateSplitRow = (index, key, value) => {
    setSplitRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  };

  const addSplitRow = () => {
    setSplitRows((current) => [
      ...current,
      createSplitRow({
        color: splitModal?.item?.color || "",
        size: splitModal?.item?.size || "",
      }),
    ]);
  };

  const removeSplitRow = (index) => {
    setSplitRows((current) => (current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current));
  };

  const saveSplitRows = async () => {
    if (!splitModal || !canEditImport) return;

    const total = splitRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const maxQty = Number(splitModal.item.received_qty || 0) > 0
      ? Number(splitModal.item.received_qty || 0)
      : Number(splitModal.item.ordered_qty || 0);

    if (total > maxQty) {
      showToast({
        tone: "error",
        title: "Split total is too high",
        message: `Split quantity ${formatNumber(total)} is greater than ${formatNumber(maxQty)}.`,
      });
      return;
    }

    setSavingSplits(true);
    try {
      await api.updateImportItemSplits(
        splitModal.order.id,
        splitModal.item.id,
        {
          splits: splitRows
            .map((row) => ({
              product_article: row.product_article,
              product_name: row.product_name,
              color: row.color,
              size: row.size,
              quantity: Number(row.quantity || 0),
              note: row.note,
            }))
            .filter((row) => row.quantity > 0),
        },
        token
      );

      const refreshedOrder = await api.getImportOrder(splitModal.order.id, token);
      showToast({ tone: "success", title: "Split saved", message: "Article breakdown was saved for this material." });
      setViewingOrder(refreshedOrder.data || null);
      setSplitModal(null);
      setSplitRows([]);
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Split save failed",
        message: error.message || "Could not save this split.",
      });
    } finally {
      setSavingSplits(false);
    }
  };

  const addSplitStockToRawMaterial = async (row) => {
    if (!splitModal || !row.id || row.stock_added_at || addingSplitStockIds.includes(row.id)) return;
    setAddingSplitStockIds((current) => [...current, row.id]);
    try {
      const result = await api.addImportSplitToRawMaterial(
        splitModal.order.id,
        splitModal.item.id,
        row.id,
        token
      );
      const refreshedOrder = await api.getImportOrder(splitModal.order.id, token);
      const refreshed = refreshedOrder.data;
      const refreshedItem = refreshed?.items?.find((item) => Number(item.id) === Number(splitModal.item.id));
      setSplitModal(refreshedItem ? { order: refreshed, item: refreshedItem } : null);
      setSplitRows((refreshedItem?.splits || []).map((split) => createSplitRow(split)));
      showToast({ tone: "success", title: "Added to raw material", message: result.message || `${formatNumber(row.quantity)} added to raw material stock.` });
      await load();
    } catch (error) {
      showToast({ tone: "error", title: "Stock was not added", message: error.message || "Could not add this split to raw material stock." });
    } finally {
      setAddingSplitStockIds((current) => current.filter((id) => Number(id) !== Number(row.id)));
    }
  };

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

        const nextItem = { ...item, [key]: value };
        if (["carton_qty", "qty_per_carton"].includes(key)) {
          const cartons = Number(nextItem.carton_qty || 0);
          const qtyPerCarton = Number(nextItem.qty_per_carton || 0);
          if (cartons > 0 && qtyPerCarton > 0) {
            nextItem.ordered_qty = String(cartons * qtyPerCarton);
          }
        }
        return nextItem;
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
        size: item.size,
        unit: item.unit || "pcs",
        carton_qty: Number(item.carton_qty || 0),
        qty_per_carton: Number(item.qty_per_carton || 0),
        ordered_qty: Number(item.ordered_qty || 0),
        unit_price: Number(item.unit_price || 0),
        price_currency: item.price_currency || "RMB",
        creditor: item.creditor || "",
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
      loading_date: slip.loading_date,
      vehicle_no: slip.vehicle_no,
      vehicle_size: slip.vehicle_size,
      destination: slip.destination,
      ocean_company: slip.ocean_company,
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
      loading_date: compactDate(order.loading_date),
      vehicle_no: order.vehicle_no || "",
      vehicle_size: order.vehicle_size || "",
      destination: order.destination || "",
      ocean_company: order.ocean_company || "",
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

  const quickReceiveItem = async (order, item) => {
    if (!canEditImport) {
      showToast({
        tone: "error",
        title: "Access denied",
        message: "You do not have permission to receive import stock.",
      });
      return;
    }

    const qtyReceived = Math.max(Number(item.ordered_qty || 0) - Number(item.received_qty || 0), 0);
    if (!order || !item || qtyReceived <= 0 || receivingItemIds.includes(item.id)) return;

    setReceivingItemIds((current) => [...current, item.id]);
    try {
      const result = await api.receiveImportItemStock(
        order.id,
        item.id,
        {
          qty_received: qtyReceived,
          damaged_qty: 0,
          short_qty: 0,
          notes: "Quick received from slip item list",
        },
        token
      );

      const refreshedOrder = await api.getImportOrder(order.id, token);
      showToast({
        tone: "success",
        title: Number(order.is_test ?? 1) === 1 ? "Marked received" : "Receipt recorded",
        message: result.message || "Import slip receipt status updated.",
      });
      setViewingOrder(refreshedOrder.data || null);
      await load();
    } catch (error) {
      showToast({
        tone: "error",
        title: "Receive failed",
        message: error.message || "Could not receive this import slip.",
      });
    } finally {
      setReceivingItemIds((current) => current.filter((id) => id !== item.id));
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

  const buildExportRows = (exportOrders) =>
    exportOrders.flatMap((order) =>
      (order.items || []).map((item) => ({
        "Order No": order.order_number,
        Mode: Number(order.is_test ?? 1) === 1 ? "Test" : "Real",
        Supplier: order.supplier_name,
        By: order.agent_name,
        "Transportation": order.shipping_method || "",
        "Loading Date": compactDate(order.loading_date),
        "Vehicle No": order.vehicle_no || "",
        "Vehicle Size": order.vehicle_size || "",
        Destination: order.destination || "",
        Ocean: order.ocean_company || "",
        Status: label(order.status),
        Material: item.material_name || "-",
        "Article Code": item.article_code || "",
        Category: item.category || "",
        Color: item.color || "",
        Size: item.size || "",
        CTN: Number(item.carton_qty || 0),
        "QTY/CTN": Number(item.qty_per_carton || 0),
        Quantity: Number(item.ordered_qty || 0),
        Unit: item.unit || "",
        Rate: Number(item.unit_price || 0),
        Currency: item.price_currency || "RMB",
        Amount: Number(item.ordered_qty || 0) * Number(item.unit_price || 0),
        Creditor: item.creditor || "",
        Note: item.notes || "",
        Received: Number(item.received_qty || 0),
        Container: firstContainer(order).container_number || "-",
        "Order Date": compactDate(order.order_date),
        "Expected Date": compactDate(order.expected_delivery_date),
      }))
    );

  const exportReport = () => {
    const rows = buildExportRows(orders);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Import Board");
    XLSX.writeFile(workbook, "import-tracking-board.xlsx");
  };

  const exportOrderSlip = (order) => {
    const rows = buildExportRows([order]);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    const sheetName = String(order.order_number || "Slip").slice(0, 31);
    const fileOrder = String(order.order_number || "import-slip").replace(/[^\w-]+/g, "-");

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Slip");
    XLSX.writeFile(workbook, `${fileOrder}-items.xlsx`);
  };

  const renderCard = (order) => {
    const items = order.items || [];
    const container = firstContainer(order);
    const isTest = Number(order.is_test ?? 1) === 1;
    const stockStatus = getStockEntryStatus(order);
    const totalOrdered = items.reduce((sum, item) => sum + Number(item.ordered_qty || 0), 0);
    const totalReceived = items.reduce((sum, item) => sum + Number(item.received_qty || 0), 0);
    const totalCartons = items.reduce((sum, item) => sum + Number(item.carton_qty || 0), 0);
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
          <p>CTN total: <span className="font-semibold">{formatNumber(totalCartons)}</span></p>
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
          <p>Destination: {order.destination || "-"}</p>
          <p>Vehicle size: {order.vehicle_size || "-"}</p>
          <p>Transportation: {order.shipping_method || "-"}</p>
          <p>Container: {container.container_number || "-"}</p>
          <p>Expected: {order.expected_delivery_date ? formatDate(order.expected_delivery_date, { includeTime: false }) : "-"}</p>
        </div>

        <div className="mt-3 grid gap-2">
          <Button size="sm" icon="check" onClick={() => openViewingOrder(order)}>
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
        description="Create slips for supplier lists and record received quantities without adding raw material stock."
        icon="purchase"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Slips" value={formatNumber(summary.orders)} icon="orders" />
        <StatCard label="Materials" value={formatNumber(summary.materials)} icon="materials" />
        <StatCard label="Containers" value={formatNumber(summary.containers)} icon="box" />
        <StatCard label="Ordered Qty" value={formatNumber(summary.ordered_qty)} icon="purchase" />
        <StatCard label="Received Qty" value={formatNumber(summary.received_qty)} icon="check" />
      </div>

      <SectionCard title="Start" subtitle="Choose the board, then create or export slips." icon="permission">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setSlipMode(true)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
                  filters.is_test === "1" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                Test slips
              </button>
              <button
                type="button"
                onClick={() => setSlipMode(false)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
                  filters.is_test === "0" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-purple"
                }`}
              >
                Real slips
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {filters.is_test === "1"
                ? "You are working with test slips."
                : "You are working with real import records."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {canCreateImport ? (
              <Button icon="plus" onClick={() => setShowSlipForm((open) => !open)}>
                {showSlipForm ? "Close slip form" : `New ${filters.is_test === "1" ? "test" : "real"} slip`}
              </Button>
            ) : null}
            <Button variant="secondary" icon="download" onClick={exportReport} disabled={!orders.length}>
              Export
            </Button>
          </div>
        </div>
      </SectionCard>

      {showSlipForm ? (
        <SectionCard
          title={editingId ? "Edit order slip" : "New order slip"}
          subtitle="Tracking only. This will not add raw material stock."
          icon="purchase"
        >
          <form className="grid gap-5 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitSlip}>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">1</span>
                <p className="text-sm font-semibold text-slate-900">Slip details</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Supplier">
                  <TextInput value={slip.supplier_name} onChange={(event) => updateSlip("supplier_name", event.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Order date">
                  <TextInput type="date" value={slip.order_date} onChange={(event) => updateSlip("order_date", event.target.value)} required />
                </Field>
                <Field label="By">
                  <TextInput value={slip.agent_name} onChange={(event) => updateSlip("agent_name", event.target.value)} placeholder="Who ordered / handled" />
                </Field>
                <Field label="Country / place">
                  <TextInput value={slip.supplier_country} onChange={(event) => updateSlip("supplier_country", event.target.value)} placeholder="China, India..." />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">2</span>
                <p className="text-sm font-semibold text-slate-900">Loading details</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Loading date">
                  <TextInput type="date" value={slip.loading_date} onChange={(event) => updateSlip("loading_date", event.target.value)} />
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
                <Field label="Destination">
                  <TextInput value={slip.destination} onChange={(event) => updateSlip("destination", event.target.value)} placeholder="Calcutta, Birgunj..." />
                </Field>
                <Field label="Vehicle no.">
                  <TextInput value={slip.vehicle_no} onChange={(event) => updateSlip("vehicle_no", event.target.value)} />
                </Field>
                <Field label="Vehicle size">
                  <TextInput value={slip.vehicle_size} onChange={(event) => updateSlip("vehicle_size", event.target.value)} placeholder="68 CBM" />
                </Field>
                <Field label="Transportation name">
                  <TextInput value={slip.ocean_company} onChange={(event) => updateSlip("ocean_company", event.target.value)} placeholder="Blue Ocean" />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">3</span>
                <p className="text-sm font-semibold text-slate-900">Other details</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Expected date">
                  <TextInput type="date" value={slip.expected_delivery_date} onChange={(event) => updateSlip("expected_delivery_date", event.target.value)} />
                </Field>
                <Field label="Tracking / bill no.">
                  <TextInput value={slip.tracking_number} onChange={(event) => updateSlip("tracking_number", event.target.value)} />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">4</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Materials in this order</p>
                  <p className="text-xs text-slate-500">Add every raw material from this purchase slip.</p>
                </div>
              </div>

              <div className="space-y-3">
                {slipItems.map((item, index) => (
                  <div key={item.client_id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Item {index + 1}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="delete"
                        onClick={() => removeSlipItem(index)}
                        disabled={slipItems.length === 1}
                      >
                        Remove row
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
                      <Field label="Size">
                        <TextInput
                          value={item.size}
                          onChange={(event) => updateSlipItem(index, "size", event.target.value)}
                          placeholder="26-30, 31-35..."
                        />
                      </Field>
                      <Field label="CTN">
                        <TextInput
                          type="text"
                          inputMode="decimal"
                          value={item.carton_qty}
                          onChange={(event) => updateSlipItem(index, "carton_qty", decimalNumberValue(event.target.value))}
                        />
                      </Field>
                      <Field label="QTY/CTN">
                        <TextInput
                          type="text"
                          inputMode="decimal"
                          value={item.qty_per_carton}
                          onChange={(event) => updateSlipItem(index, "qty_per_carton", decimalNumberValue(event.target.value))}
                        />
                      </Field>
                      <Field label="Total qty">
                        <TextInput
                          type="text"
                          inputMode="decimal"
                          value={item.ordered_qty}
                          onChange={(event) => updateSlipItem(index, "ordered_qty", decimalNumberValue(event.target.value))}
                          required
                        />
                      </Field>
                      <Field label="Unit">
                        <TextInput value={item.unit} onChange={(event) => updateSlipItem(index, "unit", event.target.value)} />
                      </Field>
                      <Field label="Rate">
                        <TextInput
                          type="text"
                          inputMode="decimal"
                          value={item.unit_price}
                          onChange={(event) => updateSlipItem(index, "unit_price", decimalNumberValue(event.target.value))}
                        />
                      </Field>
                      <Field label="Amount">
                        <TextInput value={formatMoney(Number(item.ordered_qty || 0) * Number(item.unit_price || 0), item.price_currency)} disabled />
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
                      <Field label="Creditor">
                        <TextInput value={item.creditor} onChange={(event) => updateSlipItem(index, "creditor", event.target.value)} />
                      </Field>
                      <Field label="Note">
                        <TextInput value={item.notes} onChange={(event) => updateSlipItem(index, "notes", event.target.value)} placeholder="SAMBA, BOSS LS..." />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sticky bottom-3 z-10 md:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <Button variant="secondary" icon="plus" onClick={addSlipItem}>
                  Add material row
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={resetSlip}>
                    Cancel
                  </Button>
                  <Button type="submit" icon={editingId ? "check" : "plus"}>
                    {editingId ? "Update slip" : "Create slip"}
                  </Button>
                </div>
              </div>
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
                {paginatedReceivedRows.map((row) => (
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
                      <p>Size: <span className="font-medium text-slate-800">{row.size || "-"}</span></p>
                      <p>Ordered: <span className="font-medium text-slate-800">{formatNumber(row.ordered_qty)} {row.unit}</span></p>
                      <p>CTN: <span className="font-medium text-slate-800">{formatNumber(row.carton_qty)}</span></p>
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
                      {["Mode", "Order", "Material", "Article", "Category", "Color", "Size", "CTN", "QTY/CTN", "Qty", "Unit", "Rate", "Amount", "Creditor", "Received", "Damaged", "Short", "Remaining", "Supplier", "Container", "Note", "Status"].map((heading) => (
                        <th key={heading} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedReceivedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusBadge tone={row.mode === "Test" ? "warning" : "success"}>{row.mode}</StatusBadge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">{row.order_number}</td>
                        <td className="min-w-[180px] px-3 py-3 text-slate-700">{row.material_name}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.article_code || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.category || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.color || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.size || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.carton_qty)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.qty_per_carton)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.ordered_qty)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(row.unit_price, row.price_currency)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(row.total_price, row.price_currency)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.creditor || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700">{formatNumber(row.received_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.damaged_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.short_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(row.remaining_qty)} {row.unit}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.supplier_name || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.container_number}</td>
                        <td className="min-w-[140px] px-3 py-3 text-slate-600">{row.notes || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusBadge tone={row.remaining_qty > 0 ? "warning" : "success"}>{row.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {receivedPageCount > 1 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-500">
                    Showing {formatNumber(paginatedReceivedRows.length)} of {formatNumber(receivedRows.length)} received rows · Page {formatNumber(receivedPage)} of {formatNumber(receivedPageCount)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReceivedRowsPage((page) => Math.max(1, page - 1))}
                      disabled={receivedPage <= 1}
                    >
                      Previous
                    </Button>
                    {receivedPageNumbers.map((page, index) => {
                      const previousPage = receivedPageNumbers[index - 1];
                      const showGap = previousPage && page - previousPage > 1;

                      return (
                        <div key={page} className="flex items-center gap-2">
                          {showGap ? <span className="text-sm text-slate-400">...</span> : null}
                          <button
                            type="button"
                            onClick={() => setReceivedRowsPage(page)}
                            className={`h-9 min-w-9 rounded-xl px-3 text-sm font-semibold transition ${
                              page === receivedPage
                                ? "bg-indigo-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReceivedRowsPage((page) => Math.min(receivedPageCount, page + 1))}
                      disabled={receivedPage >= receivedPageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : receivedRows.length ? (
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
                  Showing {formatNumber(receivedRows.length)} received row{receivedRows.length === 1 ? "" : "s"}.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No received materials yet. Use Record received on a slip first.
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
                  Showing {formatNumber(paginatedViewingItems.length)} of {formatNumber(viewingItems.length)} items.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" icon="download" onClick={() => exportOrderSlip(viewingOrder)}>
                  Export Excel
                </Button>
                <Button variant="secondary" onClick={() => setViewingOrder(null)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="max-h-[72vh] overflow-auto p-4">
              <div className="space-y-3 md:hidden">
                {paginatedViewingItems.map((item) => {
                  const itemStatus = getItemStockStatus(item);
                  const isTest = Number(viewingOrder.is_test ?? 1) === 1;
                  const canReceiveItem = itemStatus.remaining > 0;
                  const isReceivingItem = receivingItemIds.includes(item.id);

                  return (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.material_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.category || "-"} · {item.color || "-"} · {item.size || "-"}</p>
                        </div>
                        <StatusBadge tone={itemStatus.tone}>{itemStatus.label}</StatusBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <p>Ordered: <span className="font-medium text-slate-800">{formatNumber(item.ordered_qty)} {item.unit || ""}</span></p>
                        <p>Size: <span className="font-medium text-slate-800">{item.size || "-"}</span></p>
                        <p>CTN: <span className="font-medium text-slate-800">{formatNumber(item.carton_qty || 0)}</span></p>
                        <p>QTY/CTN: <span className="font-medium text-slate-800">{formatNumber(item.qty_per_carton || 0)}</span></p>
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
                          disabled={!canReceiveItem || !canEditImport || isReceivingItem}
                          onClick={() => quickReceiveItem(viewingOrder, item)}
                        >
                          {isReceivingItem ? "Saving..." : isTest ? "Mark received" : "Record received"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canEditImport}
                          onClick={() => openSplitModal(viewingOrder, item)}
                        >
                          Split by article
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
                      {["Material", "Article", "Category", "Color", "Size", "CTN", "QTY/CTN", "Qty", "Unit", "Rate", "Amount", "Creditor", "Note", "Received", "Damaged", "Short", "Remaining", "Status", "Material Link", "Action"].map((heading) => (
                        <th key={heading} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedViewingItems.map((item) => {
                      const itemStatus = getItemStockStatus(item);
                      const isTest = Number(viewingOrder.is_test ?? 1) === 1;
                      const canReceiveItem = itemStatus.remaining > 0;
                      const isReceivingItem = receivingItemIds.includes(item.id);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="min-w-[180px] px-3 py-3 font-medium text-slate-900">{item.material_name}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.article_code || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.category || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.color || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.size || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.carton_qty || 0)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.qty_per_carton || 0)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatNumber(item.ordered_qty)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.unit || ""}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(item.unit_price || 0, item.price_currency)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatMoney(Number(item.ordered_qty || 0) * Number(item.unit_price || 0), item.price_currency)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.creditor || "-"}</td>
                          <td className="min-w-[120px] px-3 py-3 text-slate-600">{item.notes || "-"}</td>
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
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={canReceiveItem ? "primary" : "secondary"}
                                icon="check"
                                disabled={!canReceiveItem || !canEditImport || isReceivingItem}
                                onClick={() => quickReceiveItem(viewingOrder, item)}
                              >
                                {isReceivingItem ? "Saving..." : isTest ? "Mark received" : "Record received"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!canEditImport}
                                onClick={() => openSplitModal(viewingOrder, item)}
                              >
                                Split
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {viewingPageCount > 1 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-500">
                    Page {formatNumber(viewingPage)} of {formatNumber(viewingPageCount)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setViewingItemsPage((page) => Math.max(1, page - 1))}
                      disabled={viewingPage <= 1}
                    >
                      Previous
                    </Button>
                    {viewingPageNumbers.map((page, index) => {
                      const previousPage = viewingPageNumbers[index - 1];
                      const showGap = previousPage && page - previousPage > 1;

                      return (
                        <div key={page} className="flex items-center gap-2">
                          {showGap ? <span className="text-sm text-slate-400">...</span> : null}
                          <button
                            type="button"
                            onClick={() => setViewingItemsPage(page)}
                            className={`h-9 min-w-9 rounded-xl px-3 text-sm font-semibold transition ${
                              page === viewingPage
                                ? "bg-indigo-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setViewingItemsPage((page) => Math.min(viewingPageCount, page + 1))}
                      disabled={viewingPage >= viewingPageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {splitModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <p className="text-base font-semibold text-slate-900">Split {splitModal.item.material_name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Each row creates or links its own raw material. Total {formatNumber(splitTotalQty)} / {formatNumber(splitMaxQty)} {splitModal.item.unit || ""}.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setSplitModal(null)}>
                Close
              </Button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
              <div className={`rounded-xl border p-3 text-sm ${
                splitTotalQty > splitMaxQty ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}>
                Remaining to assign: <span className="font-bold">{formatNumber(splitRemainingQty)} {splitModal.item.unit || ""}</span>
              </div>

              <div className="space-y-3">
                {splitRows.map((row, index) => (
                  <div key={row.client_id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_0.8fr_0.8fr_0.8fr_auto]">
                    <Field label="Product article">
                      <TextInput
                        value={row.product_article}
                        onChange={(event) => updateSplitRow(index, "product_article", event.target.value)}
                        placeholder="NK-201"
                      />
                    </Field>
                    <Field label="Product name">
                      <TextInput
                        value={row.product_name}
                        onChange={(event) => updateSplitRow(index, "product_name", event.target.value)}
                        placeholder="NK-201_Black raw material name"
                      />
                    </Field>
                    <Field label="Color">
                      <TextInput
                        value={row.color}
                        onChange={(event) => updateSplitRow(index, "color", event.target.value)}
                      />
                    </Field>
                    <Field label="Size">
                      <TextInput
                        value={row.size}
                        onChange={(event) => updateSplitRow(index, "size", event.target.value)}
                      />
                    </Field>
                    <Field label={`Qty (${splitModal.item.unit || "pcs"})`}>
                      <TextInput
                        type="number"
                        min="0"
                        value={row.quantity}
                        onChange={(event) => updateSplitRow(index, "quantity", event.target.value)}
                      />
                    </Field>
                    <div className="flex flex-col items-stretch justify-end gap-2">
                      {row.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={row.stock_added_at ? "secondary" : "primary"}
                          disabled={Boolean(row.stock_added_at) || addingSplitStockIds.includes(row.id)}
                          onClick={() => addSplitStockToRawMaterial(row)}
                        >
                          {row.stock_added_at
                            ? "Added to raw material"
                            : addingSplitStockIds.includes(row.id)
                              ? "Adding..."
                              : `Add ${formatNumber(row.quantity)} to raw material`}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={splitRows.length <= 1}
                        onClick={() => removeSplitRow(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="md:col-span-6">
                      <Field label="Note">
                        <TextInput
                          value={row.note}
                          onChange={(event) => updateSplitRow(index, "note", event.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5">
              <Button type="button" variant="secondary" onClick={addSplitRow}>
                Add split row
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setSplitModal(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={savingSplits || splitTotalQty > splitMaxQty}
                  onClick={saveSplitRows}
                >
                  {savingSplits ? "Saving..." : "Save split"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
