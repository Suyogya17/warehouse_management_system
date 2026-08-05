const API_BASE_URL = import.meta.env.VITE_API_URL || "https://back.nepchawarehouse.com/api";
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000);

export const APP_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

const activeLoadingRequests = {
  overlay: 0,
  progress: 0,
};

const announceApiLoading = (mode) => {
  window.dispatchEvent(
    new CustomEvent(
      mode === "overlay" ? "nepcha:api-loading" : "nepcha:api-progress",
      {
        detail: { loading: activeLoadingRequests[mode] > 0 },
      }
    )
  );
};

const beginApiLoading = (mode) => {
  if (!mode) return;
  activeLoadingRequests[mode] += 1;
  announceApiLoading(mode);
};

const endApiLoading = (mode) => {
  if (!mode) return;
  activeLoadingRequests[mode] = Math.max(0, activeLoadingRequests[mode] - 1);
  announceApiLoading(mode);
};

const getLoadingMode = (showLoader) => {
  if (showLoader === false) return null;
  if (showLoader === true) return "overlay";
  return "progress";
};

const buildQueryString = (params = {}) =>
  new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();

const buildHeaders = (token, isJson = true) => {
  const headers = {};

  if (isJson) headers["Content-Type"] = "application/json";

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");

    error.status = response.status;
    error.data = data;

    if (response.status === 401) {
      localStorage.removeItem("store-management-auth");

      window.dispatchEvent(new Event("store-management:auth-expired"));
    }

    throw error;
  }

  return data;
};

export const apiRequest = async (path, options = {}, token) => {
  const isFormData = options.body instanceof FormData;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || API_TIMEOUT_MS);
  const loadingMode = getLoadingMode(options.showLoader);

  beginApiLoading(loadingMode);

  try {
    const { timeoutMs, showLoader, ...fetchOptions } = options;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...buildHeaders(token, options.body !== undefined && !isFormData),
        ...(options.headers || {}),
      },
    });

    return parseResponse(response);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
    endApiLoading(loadingMode);
  }
};

const downloadApiFile = async (path, token) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: buildHeaders(token, false),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        localStorage.removeItem("store-management-auth");
        window.dispatchEvent(new Event("store-management:auth-expired"));
      }
      throw new Error(data.message || "Download failed");
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);

    return {
      blob: await response.blob(),
      filename: filenameMatch?.[1] || "nepcha-product-gallery.pdf",
      cacheStatus: response.headers.get("X-Catalogue-Cache") || "",
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The catalogue is taking too long to prepare. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

const downloadProtectedFile = async (path, token) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(token, false),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Could not download the attachment.");
  }
  return {
    blob: await response.blob(),
    contentDisposition: response.headers.get("Content-Disposition") || "",
  };
};

export const api = {
  login: (payload) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      showLoader: true,
    }),

  registerUser: (payload, token) =>
    apiRequest(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  getUsers: (token) => apiRequest("/auth/users", {}, token),

  getPagePermissions: (token) => apiRequest("/auth/page-permissions", {}, token),

  setProductVisibilityPermission: (id, enabled, token) =>
    apiRequest(
      `/auth/users/${id}/product-visibility-permission`,
      { method: "PUT", body: JSON.stringify({ enabled }) },
      token
    ),

  getAdvertisements: (token) => apiRequest("/advertisements", {}, token),

  getNotifications: (token) =>
    apiRequest("/notifications", { showLoader: false }, token),

  getChatUnreadCount: (token) =>
    apiRequest("/chat/unread-count", { showLoader: false }, token),

  getMyChatPresence: (token) =>
    apiRequest("/chat/presence/me", { showLoader: false }, token),

  updateMyChatPresence: (enabled, token) =>
    apiRequest(
      "/chat/presence/me",
      { method: "PUT", body: JSON.stringify({ enabled }), showLoader: false },
      token
    ),

  sendChatPresenceHeartbeat: (token) =>
    apiRequest(
      "/chat/presence/heartbeat",
      { method: "POST", showLoader: false },
      token
    ),

  getMyChat: (token, afterId, changedAfter) => {
    const query = buildQueryString({ after_id: afterId, changed_after: changedAfter });
    return apiRequest(`/chat/me${query ? `?${query}` : ""}`, { showLoader: false }, token);
  },

  sendMyChatMessage: (message, token) =>
    apiRequest(
      "/chat/me/messages",
      { method: "POST", body: JSON.stringify({ message }), showLoader: false },
      token
    ),

  getChatReferenceOptions: (type, search, token, conversationId) => {
    const query = buildQueryString({ type, search, conversation_id: conversationId });
    return apiRequest(`/chat/reference-options?${query}`, { showLoader: false }, token);
  },

  sendMyChatReference: (payload, token) =>
    apiRequest(
      "/chat/me/references",
      { method: "POST", body: JSON.stringify(payload), showLoader: false },
      token
    ),

  sendAdminChatReference: (id, payload, token) =>
    apiRequest(
      `/chat/conversations/${id}/references`,
      { method: "POST", body: JSON.stringify(payload), showLoader: false },
      token
    ),

  sendMyChatAttachment: (file, message, token) => {
    const body = new FormData();
    body.append("file", file);
    if (message) body.append("message", message);
    return apiRequest(
      "/chat/me/attachments",
      { method: "POST", body, showLoader: false, timeoutMs: 60000 },
      token
    );
  },

  sendAdminChatAttachment: (id, file, message, token) => {
    const body = new FormData();
    body.append("file", file);
    if (message) body.append("message", message);
    return apiRequest(
      `/chat/conversations/${id}/attachments`,
      { method: "POST", body, showLoader: false, timeoutMs: 60000 },
      token
    );
  },

  getChatAttachment: (attachmentId, token, variant) => {
    const query = buildQueryString({ variant });
    return downloadProtectedFile(
      `/chat/attachments/${attachmentId}${query ? `?${query}` : ""}`,
      token
    );
  },

  markMyChatRead: (token) =>
    apiRequest("/chat/me/read", { method: "PUT", showLoader: false }, token),

  getChatConversations: (token, params = {}) => {
    const query = buildQueryString(params);
    return apiRequest(
      `/chat/conversations${query ? `?${query}` : ""}`,
      { showLoader: false },
      token
    );
  },

  getChatUsers: (token, params = {}) => {
    const query = buildQueryString(params);
    return apiRequest(
      `/chat/users${query ? `?${query}` : ""}`,
      { showLoader: false },
      token
    );
  },

  startAdminChat: (userId, token) =>
    apiRequest(
      "/chat/conversations",
      { method: "POST", body: JSON.stringify({ user_id: userId }), showLoader: false },
      token
    ),

  getStaffChatUsers: (token, params = {}) => {
    const query = buildQueryString(params);
    return apiRequest(
      `/chat/staff/users${query ? `?${query}` : ""}`,
      { showLoader: false },
      token
    );
  },

  getStaffChatConversations: (token) =>
    apiRequest("/chat/staff/conversations", { showLoader: false }, token),

  startStaffChat: (userId, token) =>
    apiRequest(
      "/chat/staff/conversations",
      { method: "POST", body: JSON.stringify({ user_id: userId }), showLoader: false },
      token
    ),

  getStaffChatConversation: (id, token, afterId, changedAfter) => {
    const query = buildQueryString({ after_id: afterId, changed_after: changedAfter });
    return apiRequest(
      `/chat/staff/conversations/${id}${query ? `?${query}` : ""}`,
      { showLoader: false },
      token
    );
  },

  sendStaffChatMessage: (id, message, token) =>
    apiRequest(
      `/chat/staff/conversations/${id}/messages`,
      { method: "POST", body: JSON.stringify({ message }), showLoader: false },
      token
    ),

  sendStaffChatReference: (id, payload, token) =>
    apiRequest(
      `/chat/staff/conversations/${id}/references`,
      { method: "POST", body: JSON.stringify(payload), showLoader: false },
      token
    ),

  sendStaffChatAttachment: (id, file, message, token) => {
    const body = new FormData();
    body.append("file", file);
    if (message) body.append("message", message);
    return apiRequest(
      `/chat/staff/conversations/${id}/attachments`,
      { method: "POST", body, showLoader: false, timeoutMs: 60000 },
      token
    );
  },

  markStaffChatRead: (id, token) =>
    apiRequest(
      `/chat/staff/conversations/${id}/read`,
      { method: "PUT", showLoader: false },
      token
    ),

  getChatConversation: (id, token, afterId, changedAfter) => {
    const query = buildQueryString({ after_id: afterId, changed_after: changedAfter });
    return apiRequest(
      `/chat/conversations/${id}${query ? `?${query}` : ""}`,
      { showLoader: false },
      token
    );
  },

  sendAdminChatMessage: (id, message, token) =>
    apiRequest(
      `/chat/conversations/${id}/messages`,
      { method: "POST", body: JSON.stringify({ message }), showLoader: false },
      token
    ),

  editChatMessage: (messageId, message, token) =>
    apiRequest(
      `/chat/messages/${messageId}`,
      { method: "PUT", body: JSON.stringify({ message }), showLoader: false },
      token
    ),

  deleteChatMessage: (messageId, token) =>
    apiRequest(
      `/chat/messages/${messageId}`,
      { method: "DELETE", showLoader: false },
      token
    ),

  markAdminChatRead: (id, token) =>
    apiRequest(`/chat/conversations/${id}/read`, { method: "PUT", showLoader: false }, token),

  updateChatStatus: (id, status, token) =>
    apiRequest(
      `/chat/conversations/${id}/status`,
      { method: "PUT", body: JSON.stringify({ status }), showLoader: false },
      token
    ),

  createNotification: (payload, token) =>
    apiRequest("/notifications", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),

  markNotificationsRead: (token) =>
    apiRequest("/notifications/read", { method: "PUT" }, token),

  createAdvertisement: (payload, token) =>
    apiRequest("/advertisements", { method: "POST", body: payload }, token),

  updateAdvertisement: (id, payload, token) =>
    apiRequest(`/advertisements/${id}`, { method: "PUT", body: payload }, token),

  reorderAdvertisements: (orderedIds, token) =>
    apiRequest("/advertisements/reorder", {
      method: "PUT",
      body: JSON.stringify({ ordered_ids: orderedIds }),
    }, token),

  deleteAdvertisement: (id, token) =>
    apiRequest(`/advertisements/${id}`, { method: "DELETE" }, token),

  updateUser: (id, payload, token) =>
    apiRequest(
      `/auth/users/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteUser: (id, token) =>
    apiRequest(`/auth/users/${id}`, { method: "DELETE" }, token),

  getProfile: (token) => apiRequest("/auth/profile", {}, token),

  getStockSummary: (token) => apiRequest("/stock/summary", {}, token),

  getBatches: (id, token) =>
    apiRequest(`/stock/batches/${id}`, {}, token),

  receiveStock: (payload, token) =>
    apiRequest(
      "/stock/receive",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  getRawMaterials: (token) => apiRequest("/raw-materials", {}, token),

  getRawMaterialAvailability: (id, token) =>
    apiRequest(`/raw-materials/${id}/availability`, {}, token),

  createRawMaterial: (payload, token) =>
    apiRequest(
      "/raw-materials",
      { method: "POST", body: payload },
      token
    ),

  updateRawMaterial: (id, payload, token) =>
    apiRequest(
      `/raw-materials/${id}`,
      { method: "PUT", body: payload },
      token
    ),

  deleteRawMaterial: (id, token) =>
    apiRequest(`/raw-materials/${id}`, { method: "DELETE" }, token),

  getFinishedGoods: (token, options = {}) => {
    const query = buildQueryString(options);
    return apiRequest(
      `/finished-goods${query ? `?${query}` : ""}`,
      {},
      token
    );
  },
  getFinishedGoodFilters: (token) =>
    apiRequest("/finished-goods/filters", {}, token),

  createFinishedGood: (payload, token) =>
    apiRequest(
      "/finished-goods",
      { method: "POST", body: payload },
      token
    ),

  updateFinishedGood: (id, payload, token) =>
    apiRequest(
      `/finished-goods/${id}`,
      { method: "PUT", body: payload },
      token
    ),

  setFinishedGoodVisibility: (id, payload, token) =>
    apiRequest(
      `/finished-goods/${id}/visibility`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  updateFinishedGoodDisplayOrder: (orderedIds, token) =>
    apiRequest(
      "/finished-goods/display-order",
      { method: "PUT", body: JSON.stringify({ ordered_ids: orderedIds }) },
      token
    ),

  updateDashboardFeaturedProducts: (orderedIds, token) =>
    apiRequest(
      "/finished-goods/dashboard-featured",
      { method: "PUT", body: JSON.stringify({ ordered_ids: orderedIds }) },
      token
    ),

  updateFinishedGoodDisplayQuantity: (id, displayQuantity, token) =>
    apiRequest(
      `/finished-goods/${id}/display-quantity`,
      { method: "PUT", body: JSON.stringify({ display_quantity: displayQuantity }) },
      token
    ),

  updateFinishedGoodPrice: (id, prices, token) =>
    apiRequest(
      `/finished-goods/${id}/price`,
      {
        method: "PUT",
        body: JSON.stringify(
          typeof prices === "object" && prices !== null
            ? prices
            : { price: prices }
        ),
      },
      token
    ),

  updateFinishedGoodOffer: (id, payload, token) =>
    apiRequest(
      `/finished-goods/${id}/offer`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteFinishedGood: (id, token) =>
    apiRequest(`/finished-goods/${id}`, { method: "DELETE" }, token),

  getFormulas: (token) => apiRequest("/formulas", {}, token),

  createFormula: (payload, token) =>
    apiRequest(
      "/formulas",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateFormula: (id, payload, token) =>
    apiRequest(
      `/formulas/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deactivateFormula: (id, token) =>
    apiRequest(`/formulas/${id}/deactivate`, { method: "PUT" }, token),

  deleteFormula: (id, token) =>
    apiRequest(`/formulas/${id}`, { method: "DELETE" }, token),

  getProductionHistory: (token, options = {}) => {
    const query = buildQueryString(options);

    return apiRequest(`/productions${query ? `?${query}` : ""}`, {}, token);
  },

  checkProduction: (payload, token) =>
    apiRequest(
      "/productions/check",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  runProduction: (payload, token) =>
    apiRequest(
      "/productions/run",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  getConsumptionLogs: (token, options = {}) => {
    const query = buildQueryString(options);

    return apiRequest(`/consumption${query ? `?${query}` : ""}`, {}, token);
  },

  logConsumption: (payload, token) =>
    apiRequest(
      "/consumption",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  grantPermission: (payload, token) =>
    apiRequest(
      "/permissions/grant",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  revokePermission: (payload, token) =>
    apiRequest(
      "/permissions/revoke",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  getPermissions: (token, options = {}) => {
    const query = buildQueryString(options);
    return apiRequest(`/permissions${query ? `?${query}` : ""}`, {}, token);
  },
  getProductPercentageAllocations: (token) =>
    apiRequest("/permissions/percentage-allocations", {}, token),
  getProductPercentageAllocationHistory: (token) =>
    apiRequest("/permissions/percentage-allocation-history", {}, token),
  saveProductPercentageAllocations: (id, targets, token) =>
    apiRequest(
      `/permissions/percentage-allocations/${id}`,
      { method: "PUT", body: JSON.stringify({ targets }) },
      token
    ),

  getOrders: (token, options = {}) => {
    const query = buildQueryString(options);

    return apiRequest(`/orders${query ? `?${query}` : ""}`, {}, token);
  },

  getAvailability: (token, options = {}) => {
    const query = buildQueryString(options);
    return apiRequest(`/orders/availability${query ? `?${query}` : ""}`, {}, token);
  },

  downloadCatalogue: (options, token) => {
    const query = buildQueryString(options);
    return downloadApiFile(`/catalogues/download${query ? `?${query}` : ""}`, token);
  },

  getOfferPurchases: (token) => apiRequest("/orders/offer-purchases", {}, token),

  createOrder: (payload, token) =>
    apiRequest(
      "/orders",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateOrderStatus: (id, payload, token) =>
    apiRequest(
      `/orders/${id}/status`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  assignOrderDeliveryNote: (id, token) =>
    apiRequest(`/orders/${id}/delivery-note`, { method: "PUT" }, token),

  prepareOrderDeliveryNote: (id, token) =>
    apiRequest(
      `/orders/${id}/delivery-note/prepare`,
      { method: "POST" },
      token
    ),

  correctOrderItems: (id, payload, token) =>
    apiRequest(
      `/orders/${id}/items`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  reopenOrderPacking: (id, reason, token) =>
    apiRequest(
      `/orders/${id}/reopen-packing`,
      { method: "PUT", body: JSON.stringify({ reason }) },
      token
    ),

  logOrderPrint: (id, token, payload = { print_type: "delivery_note" }) =>
    apiRequest(
      `/orders/${id}/print`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateStockBatch: (id, data, token) =>
    apiRequest(
      `/stock/batch/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token
    ),

  deleteStockBatch: (id, token) =>
    apiRequest(`/stock/batch/${id}`, { method: "DELETE" }, token),

  updateProductionHistory: (id, payload, token) =>
    apiRequest(
      `/productions/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteProductionHistory: (id, token) =>
    apiRequest(`/productions/${id}`, { method: "DELETE" }, token),

  getOrderById: (id, token) =>
    apiRequest(`/orders/${id}`, { method: "GET" }, token),

  deleteOrder: (id, token) =>
    apiRequest(`/orders/${id}`, { method: "DELETE" }, token),

  getStockAdjustments: (token, finished_good_id, options = {}) => {
    const query = buildQueryString({ finished_good_id, ...options });

    return apiRequest(`/stock-adjustments${query ? `?${query}` : ""}`, {}, token);
  },

createStockAdjustment: (token, payload) =>
  apiRequest(
    '/stock-adjustments',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  ),

deleteStockAdjustment: (id, token) =>
  apiRequest(`/stock-adjustments/${id}`, { method: 'DELETE' }, token),

  getWarehouses: (token, includeInactive = false) =>
    apiRequest(`/warehouses${includeInactive ? "?include_inactive=1" : ""}`, {}, token),

  createWarehouse: (payload, token) =>
    apiRequest(
      "/warehouses",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateWarehouse: (id, payload, token) =>
    apiRequest(
      `/warehouses/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteWarehouse: (id, token) =>
    apiRequest(`/warehouses/${id}`, { method: "DELETE" }, token),

  getWarehouseStock: (token, search = "") =>
    apiRequest(
      `/warehouses/stock${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      {},
      token
    ),

  adjustWarehouseStock: (payload, token) =>
    apiRequest(
      "/warehouses/adjust",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  transferWarehouseStock: (payload, token) =>
    apiRequest(
      "/warehouses/transfer",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  getWarehouseMovements: (token, params = {}) => {
    const query = buildQueryString(params);

    return apiRequest(`/warehouses/movements${query ? `?${query}` : ""}`, {}, token);
  },

  getAnalytics: (section, token) => apiRequest(`/analytics/${section}`, {}, token),
  getProductIntelligence: (params, token) => {
    const query = buildQueryString(params);
    return apiRequest(
      `/analytics/products${query ? `?${query}` : ""}`,
      {},
      token
    );
  },
  getProductSalesAnalytics: (id, token) =>
    apiRequest(`/analytics/sales/product/${id}`, {}, token),
  getDealerAnalytics: (params, token) => {
    const query = buildQueryString(params);
    return apiRequest(`/analytics/dealers/detail${query ? `?${query}` : ""}`, {}, token);
  },
  getDealerProductOrders: (params, token) => {
    const query = buildQueryString(params);
    return apiRequest(
      `/analytics/dealers/product-orders${query ? `?${query}` : ""}`,
      {},
      token
    );
  },
  trackProductSearch: (payload, token) =>
    apiRequest(
      "/product-interest/search",
      { method: "POST", body: JSON.stringify(payload), showLoader: false },
      token
    ),
  trackProductInterest: (payload, token) =>
    apiRequest(
      "/product-interest/product",
      { method: "POST", body: JSON.stringify(payload), showLoader: false },
      token
    ),

  getActivityLogs: (token, params = {}) => {
    const query = buildQueryString(params);

    return apiRequest(`/activity-logs${query ? `?${query}` : ""}`, {}, token);
  },

  getImportOrders: (token, params = {}) => {
    const query = buildQueryString(params);

    return apiRequest(`/import-tracking${query ? `?${query}` : ""}`, {}, token);
  },

  getImportOrder: (id, token) => apiRequest(`/import-tracking/${id}`, {}, token),

  createImportOrder: (payload, token) =>
    apiRequest(
      "/import-tracking",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateImportOrder: (id, payload, token) =>
    apiRequest(
      `/import-tracking/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteImportOrder: (id, token) =>
    apiRequest(`/import-tracking/${id}`, { method: "DELETE" }, token),

  createRawMaterialFromImportItem: (orderId, itemId, token) =>
    apiRequest(
      `/import-tracking/${orderId}/items/${itemId}/create-raw-material`,
      { method: "POST" },
      token
    ),

  receiveImportItemStock: (orderId, itemId, payload, token) =>
    apiRequest(
      `/import-tracking/${orderId}/items/${itemId}/receive-stock`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateImportItemSplits: (orderId, itemId, payload, token) =>
    apiRequest(
      `/import-tracking/${orderId}/items/${itemId}/splits`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  addImportSplitToRawMaterial: (orderId, itemId, splitId, token) =>
    apiRequest(
      `/import-tracking/${orderId}/items/${itemId}/splits/${splitId}/add-to-raw-material`,
      { method: "POST" },
      token
    ),

  getImportReport: (token, params = {}) => {
    const query = buildQueryString(params);

    return apiRequest(`/import-tracking/report${query ? `?${query}` : ""}`, {}, token);
  },
};
