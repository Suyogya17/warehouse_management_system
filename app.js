require("dotenv").config();
const { validateEnvironment } = require("./config/env");

validateEnvironment();

const cors = require("cors");
const compression = require("compression");
const express = require("express");
const path = require("path");
const db = require("./config/db");
const { clearCache } = require("./middleware/cacheMiddleware");
const { requestPerformance } = require("./middleware/requestPerformance");
const { securityHeaders } = require("./middleware/securityHeaders");

const authRoutes = require("./routes/authRoutes");
const stockRoutes = require("./routes/stockRoute");
const rawmaterialRoutes = require("./routes/rawmaterialRoutes");
const { fgRouter, consumptionRouter, auditRouter } = require("./routes/miscRoutes");
const formulaRoutes = require("./routes/formulaRoutes");
const productionRoutes = require("./routes/productionRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const orderRoutes = require("./routes/orderRoutes");
const stockAdjustmentRoutes = require("./routes/stockAdjustments");
const warehouseRoutes = require("./routes/warehouseRoutes");
const advertisementRoutes = require("./routes/advertisementRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const importTrackingRoutes = require("./routes/importTrackingRoutes");
const catalogueRoutes = require("./routes/catalogueRoutes");
const productInterestRoutes = require("./routes/productInterestRoutes");
const chatRoutes = require("./routes/chatRoutes");
const fiscalYearRoutes = require("./routes/fiscalYearRoutes");

const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);

// Compress JSON and static responses. Product, order, and analytics payloads can
// be large, so this substantially reduces transfer time on slower connections.
app.use(compression());
app.use(requestPerformance);

/* ─────────────────────────────
   BODY PARSER
──────────────────────────── */
app.use(express.json());

/* ─────────────────────────────
   CORS CONFIG (FIXED PRODUCTION)
──────────────────────────── */
const configuredFrontendOrigins = String(process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([
  "https://nepchawarehouse.com",
  "https://www.nepchawarehouse.com",
  "http://localhost:5173",
  "http://localhost:5174",
  ...configuredFrontendOrigins,
]);

const corsOptions = {
  origin: function (origin, callback) {

    // allow tools like Postman or server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }

    console.log("❌ CORS blocked:", origin);
    return callback(null, false);
  },

  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: [
    "Content-Disposition",
    "X-Catalogue-Cache",
    "X-Cache",
    "X-Request-Id",
    "X-Response-Time",
    "Server-Timing",
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((req, res, next) => {
  const isTrackingEvent = req.path.startsWith("/api/product-interest");
  const isChatRequest = req.path.startsWith("/api/chat");
  if (!isTrackingEvent && !isChatRequest && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    clearCache();
  }

  next();
});

/* ─────────────────────────────
   HEALTH CHECK
──────────────────────────── */
app.get("/api/health", (req, res) => {
  res.setHeader(
    "X-App-Revision",
    process.env.APP_REVISION || "packed-dn-pairs-2026-11-03"
  );
  res.send("API Running...");
});

app.get("/api/ready", async (req, res) => {
  try {
    await db.query("SELECT 1 AS ready");
    return res.json({ success: true, status: "ready" });
  } catch (err) {
    console.error("Readiness check failed:", err.code || err.message);
    return res.status(503).json({
      success: false,
      status: "not_ready",
      message: "The database is unavailable.",
    });
  }
});

/* ─────────────────────────────
   DATABASE READINESS
──────────────────────────── */

/* ─────────────────────────────
   ROUTES
──────────────────────────── */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    etag: true,
    lastModified: true,
    maxAge: "1y",
    immutable: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/raw-materials", rawmaterialRoutes);
app.use("/api/finished-goods", fgRouter);
app.use("/api/consumption", consumptionRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/activity-logs", auditRouter);
app.use("/api/formulas", formulaRoutes);
app.use("/api/productions", productionRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/advertisements", advertisementRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/import-tracking", importTrackingRoutes);
app.use("/api/catalogues", catalogueRoutes);
app.use("/api/product-interest", productInterestRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/fiscal-years", fiscalYearRoutes);

/* ─────────────────────────────
   ROOT ENDPOINT
──────────────────────────── */
app.get("/", (req, res) => {
  res.send("API Running...");
});

/* ─────────────────────────────
   ERROR HANDLER
──────────────────────────── */
app.use((err, req, res, next) => {
  console.error(err);
  const databaseUnavailableCodes = new Set([
    "ETIMEDOUT",
    "ECONNREFUSED",
    "PROTOCOL_SEQUENCE_TIMEOUT",
    "PROTOCOL_CONNECTION_LOST",
    "ER_CON_COUNT_ERROR",
  ]);
  const databaseUnavailable = databaseUnavailableCodes.has(err.code);

  res.status(databaseUnavailable ? 503 : err.statusCode || 500).json({
    success: false,
    message: databaseUnavailable
      ? "The database is temporarily unavailable. Please try again shortly."
      : err.message || "Internal server error",
  }); 
});

/* ─────────────────────────────
   START SERVER
──────────────────────────── */
const startServer = async () => {
  const PORT = Number(process.env.PORT || 3000);

  // Refuse to accept traffic until the database is reachable. A process
  // manager can then retry startup instead of leaving a partially working API.
  const rows = await db.query("SELECT NOW() AS now");
  console.log("DB Connected:", rows[0]);

  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// LiteSpeed/CloudLinux's `lsnode` wrapper can load the configured startup file
// instead of executing it as Node's main module. In that environment
// `require.main === module` is false, so the old guard created a worker that
// never called listen() and the public API returned 503. Production is always
// an application runtime; tests and development imports still remain inert.
const shouldStartServer =
  require.main === module ||
  String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

if (shouldStartServer) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
