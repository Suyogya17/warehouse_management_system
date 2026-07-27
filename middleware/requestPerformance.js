const crypto = require("crypto");

const REQUEST_LOGGING_ENABLED =
  String(process.env.REQUEST_LOGGING_ENABLED || "true").toLowerCase() !==
  "false";
const LOG_ALL_REQUESTS =
  String(process.env.LOG_ALL_REQUESTS || "false").toLowerCase() === "true";
const SLOW_REQUEST_MS = Math.max(
  1,
  Number(process.env.SLOW_REQUEST_MS || 800)
);

const requestPerformance = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId =
    String(req.headers["x-request-id"] || "").trim() ||
    crypto.randomUUID().slice(0, 12);

  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHeadWithTiming(...args) {
    if (!res.headersSent) {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      res.setHeader("X-Response-Time", `${durationMs.toFixed(1)}ms`);
      res.setHeader("Server-Timing", `app;dur=${durationMs.toFixed(1)}`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const roundedDuration = Number(durationMs.toFixed(1));
    const isSlow = durationMs >= SLOW_REQUEST_MS;

    if (!REQUEST_LOGGING_ENABLED || (!LOG_ALL_REQUESTS && !isSlow)) return;

    const log = {
      type: isSlow ? "slow_request" : "request",
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: roundedDuration,
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
      ip: req.ip,
    };

    const output = JSON.stringify(log);
    if (isSlow) console.warn(output);
    else console.info(output);
  });

  next();
};

module.exports = { requestPerformance };
