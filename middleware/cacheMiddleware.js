const DEFAULT_TTL_MS = 10000;
const MAX_CACHE_ENTRIES = 300;

const cache = new Map();

const getUserKey = (req) => {
  const user = req.user || {};
  return `${user.id || "anon"}:${user.role || ""}`;
};

const getCacheKey = (req) => `${req.method}:${req.originalUrl}:${getUserKey(req)}`;

const pruneCache = () => {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

const cacheResponse = (ttlMs = DEFAULT_TTL_MS) => (req, res, next) => {
  if (req.method !== "GET") return next();

  pruneCache();

  const key = getCacheKey(req);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    res.set("X-Cache", "HIT");
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, {
        body,
        status: res.statusCode,
        expiresAt: Date.now() + ttlMs,
      });
    }

    res.set("X-Cache", "MISS");
    return originalJson(body);
  };

  return next();
};

const clearCache = () => cache.clear();

module.exports = {
  cacheResponse,
  clearCache,
};
