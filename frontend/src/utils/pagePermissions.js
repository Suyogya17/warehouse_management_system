export const PRODUCT_VISIBILITY_PAGE_KEY = "product_visibility";
export const DASHBOARD_PRODUCTS_PAGE_KEY = "dashboard_products";
export const WAREHOUSE_BILLING_PAGE_KEY = "warehouse_billing";

export const canManageProductVisibility = (user) => {
  if (user?.role === "ADMIN") return true;

  const permission = user?.page_permissions?.[PRODUCT_VISIBILITY_PAGE_KEY];

  return user?.role === "CO_ADMIN" && Boolean(permission?.can_edit);
};

export const canViewDashboardProducts = (user) => {
  if (user?.role === "ADMIN") return true;
  if (user?.role !== "CO_ADMIN") return false;

  const dashboardPermission = user?.page_permissions?.[DASHBOARD_PRODUCTS_PAGE_KEY];

  // An explicit dashboard choice wins. Existing product managers retain access
  // until an admin makes that dashboard choice for them.
  if (dashboardPermission) return Boolean(dashboardPermission.can_view);

  return canManageProductVisibility(user);
};

export const canAccessWarehouseBilling = (user) => {
  if (user?.role === "ADMIN") return true;
  const permission = user?.page_permissions?.[WAREHOUSE_BILLING_PAGE_KEY];
  return user?.role === "CO_ADMIN" && Boolean(permission?.can_view);
};
