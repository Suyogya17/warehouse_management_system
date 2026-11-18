const DEFAULT_MAX_ENTRIES = 10000;

const normalizeKey = (value) => String(value || "unknown").slice(0, 300);

const createRateLimiter = ({
  windowMs,
  max,
  keyGenerator = (req) => req.ip,
  message = "Too many requests. Please try again later.",
  maxEntries = DEFAULT_MAX_ENTRIES,
}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Rate limiter windowMs must be greater than zero.");
  }
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error("Rate limiter max must be a positive integer.");
  }

  const entries = new Map();

  const prune = (now) => {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }

    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const limiter = (req, res, next) => {
    const now = Date.now();
    prune(now);

    const key = normalizeKey(keyGenerator(req));
    const current = entries.get(key);
    const entry =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000)
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
      });
    }

    return next();
  };

  limiter.reset = () => entries.clear();
  limiter.size = () => entries.size;
  return limiter;
};

const loginIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.ip,
  message: "Too many login attempts from this connection. Try again in 15 minutes.",
});

const loginAccountLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) =>
    `${req.ip}:${String(req.body?.email || "").trim().toLowerCase()}`,
  message: "Too many login attempts for this account. Try again in 15 minutes.",
});

module.exports = {
  createRateLimiter,
  loginAccountLimiter,
  loginIpLimiter,
};
