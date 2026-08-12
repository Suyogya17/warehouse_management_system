const toUniqueUrls = (urls = []) =>
  [...new Set(urls.filter((url) => typeof url === "string" && url.trim()))];

export const preloadImages = (urls = []) => {
  if (typeof window === "undefined" || typeof window.Image !== "function") return;

  toUniqueUrls(urls).forEach((url) => {
    const image = new window.Image();
    image.decoding = "async";
    image.src = url;
  });
};

export const getNeighborImageUrls = (
  items = [],
  selectedIndex = 0,
  getUrl = (item) => item?.image_url
) => {
  if (!items.length) return [];

  const normalizedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
  const indexes = [
    normalizedIndex,
    (normalizedIndex - 1 + items.length) % items.length,
    (normalizedIndex + 1) % items.length,
  ];

  return indexes.map((index) => getUrl(items[index]));
};
