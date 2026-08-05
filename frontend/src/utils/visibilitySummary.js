const CUSTOMER_ROLES = new Set(["USER", "MEMBER", "ELDER"]);

export const getVisibilityArticleKey = (product = {}) =>
  product.article_code ||
  product.name?.split("_")?.slice(0, -1)?.join("_") ||
  product.name ||
  `product-${product.id}`;

const defaultAvailableQuantity = (product = {}) =>
  Number(product.available_qty ?? product.quantity ?? 0);

export const buildVisibilitySummary = ({
  products = [],
  users = [],
  permissions = [],
  getAvailableQuantity = defaultAvailableQuantity,
  countryCodes = ["NP", "IN"],
} = {}) => {
  const availableProducts = products.filter(
    (product) => Number(getAvailableQuantity(product) || 0) > 0
  );
  const availableArticleKeys = new Set(
    availableProducts.map(getVisibilityArticleKey)
  );
  const customerUsers = users.filter((item) =>
    CUSTOMER_ROLES.has(String(item.role || "").toUpperCase())
  );
  const deniedKeys = new Set(
    permissions
      .filter((permission) => Number(permission.can_view) === 0)
      .map(
        (permission) =>
          `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
      )
  );
  const grantedKeys = new Set(
    permissions
      .filter((permission) => Number(permission.can_view) === 1)
      .map(
        (permission) =>
          `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
      )
  );

  const byCountry = {};
  countryCodes.forEach((countryCode) => {
    const normalizedCode = String(countryCode || "NP").toUpperCase();
    const countryUsers = customerUsers.filter(
      (item) => String(item.country_code || "NP").toUpperCase() === normalizedCode
    );
    const openArticleKeys = new Set();

    availableProducts.forEach((product) => {
      if (Number(product.is_visible) !== 1) return;
      const hasAccess = countryUsers.some((countryUser) => {
        const permissionKey = `${Number(countryUser.id)}:${Number(product.id)}`;
        return grantedKeys.has(permissionKey) && !deniedKeys.has(permissionKey);
      });
      if (hasAccess) openArticleKeys.add(getVisibilityArticleKey(product));
    });

    byCountry[normalizedCode] = {
      countryCode: normalizedCode,
      userCount: countryUsers.length,
      openArticleKeys,
      openArticles: openArticleKeys.size,
      onHoldArticles: [...availableArticleKeys].filter(
        (key) => !openArticleKeys.has(key)
      ).length,
    };
  });

  const primaryCountryKeys = countryCodes.map(
    (code) =>
      byCountry[String(code || "NP").toUpperCase()]?.openArticleKeys || new Set()
  );
  const openInEveryCountryKeys = new Set(
    [...availableArticleKeys].filter((key) =>
      primaryCountryKeys.every((countryKeys) => countryKeys.has(key))
    )
  );
  const openInAnyCountryKeys = new Set(
    [...availableArticleKeys].filter((key) =>
      primaryCountryKeys.some((countryKeys) => countryKeys.has(key))
    )
  );
  const noCountryAccessKeys = new Set(
    [...availableArticleKeys].filter((key) => !openInAnyCountryKeys.has(key))
  );
  const nepalKeys = byCountry.NP?.openArticleKeys || new Set();
  const indiaKeys = byCountry.IN?.openArticleKeys || new Set();

  return {
    totalAvailableArticles: availableArticleKeys.size,
    openInEveryCountryArticles: openInEveryCountryKeys.size,
    openInAnyCountryArticles: openInAnyCountryKeys.size,
    onHoldInAnyCountryArticles:
      availableArticleKeys.size - openInEveryCountryKeys.size,
    noCountryAccessArticles: noCountryAccessKeys.size,
    nepalOnlyArticles: [...nepalKeys].filter((key) => !indiaKeys.has(key)).length,
    indiaOnlyArticles: [...indiaKeys].filter((key) => !nepalKeys.has(key)).length,
    byCountry,
  };
};
