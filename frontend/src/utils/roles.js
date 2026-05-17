export const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();

export const hasRole = (userRole, allowedRoles = []) => {
  const normalizedRole = normalizeRole(userRole);
  return allowedRoles.map(normalizeRole).includes(normalizedRole);
};
