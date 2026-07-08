export const PRODUCT_VISIBILITY_PAGE_KEY = "product_visibility";

export const canManageProductVisibility = (user) => {
  if (user?.role === "ADMIN") return true;

  const permission = user?.page_permissions?.[PRODUCT_VISIBILITY_PAGE_KEY];

  return user?.role === "CO_ADMIN" && Boolean(permission?.can_edit);
};
