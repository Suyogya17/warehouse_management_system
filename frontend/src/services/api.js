const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
export const APP_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

const buildHeaders = (token, isJson = true) => {
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
};

export const apiRequest = async (path, options = {}, token) => {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token, options.body !== undefined && !isFormData),
      ...(options.headers || {}),
    },
  });

  return parseResponse(response);
};

export const api = {
  login: (payload) =>
    apiRequest("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  registerUser: (payload, token) =>
    apiRequest("/auth/register", { method: "POST", body: JSON.stringify(payload) }, token),
  getUsers: (token) => apiRequest("/auth/users", {}, token),
  getProfile: (token) => apiRequest("/auth/profile", {}, token),
  getStockSummary: (token) => apiRequest("/stock/summary", {}, token),
  getBatches: (id, token) => apiRequest(`/stock/batches/${id}`, {}, token),
  receiveStock: (payload, token) =>
    apiRequest("/stock/receive", { method: "POST", body: JSON.stringify(payload) }, token),
  getRawMaterials: (token) => apiRequest("/raw-materials", {}, token),
  createRawMaterial: (payload, token) =>
    apiRequest("/raw-materials", { method: "POST", body: payload }, token),
  updateRawMaterial: (id, payload, token) =>
    apiRequest(`/raw-materials/${id}`, { method: "PUT", body: payload }, token),
  deleteRawMaterial: (id, token) =>
    apiRequest(`/raw-materials/${id}`, { method: "DELETE" }, token),
  getFinishedGoods: (token) => apiRequest("/finished-goods", {}, token),
  createFinishedGood: (payload, token) =>
    apiRequest("/finished-goods", { method: "POST", body: payload }, token),
  updateFinishedGood: (id, payload, token) =>
    apiRequest(`/finished-goods/${id}`, { method: "PUT", body: payload }, token),
  setFinishedGoodVisibility: (id, payload, token) =>
    apiRequest(`/finished-goods/${id}/visibility`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteFinishedGood: (id, token) =>
    apiRequest(`/finished-goods/${id}`, { method: "DELETE" }, token),
  getFormulas: (token) => apiRequest("/formulas", {}, token),
  createFormula: (payload, token) =>
    apiRequest("/formulas", { method: "POST", body: JSON.stringify(payload) }, token),
  deactivateFormula: (id, token) =>
    apiRequest(`/formulas/${id}/deactivate`, { method: "PUT" }, token),
  deleteFormula: (id, token) =>
    apiRequest(`/formulas/${id}`, { method: "DELETE" }, token),
  getProductionHistory: (token) => apiRequest("/productions", {}, token),
  checkProduction: (payload, token) =>
    apiRequest("/productions/check", { method: "POST", body: JSON.stringify(payload) }, token),
  runProduction: (payload, token) =>
    apiRequest("/productions/run", { method: "POST", body: JSON.stringify(payload) }, token),
  getConsumptionLogs: (token) => apiRequest("/consumption", {}, token),
  logConsumption: (payload, token) =>
    apiRequest("/consumption", { method: "POST", body: JSON.stringify(payload) }, token),
};
