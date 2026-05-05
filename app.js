const cors = require("cors");
require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const stockRoutes = require("./routes/stockRoute");
const rawmaterialRoutes = require("./routes/rawmaterialRoutes");
const { fgRouter, consumptionRouter, auditRouter } = require("./routes/miscRoutes");
const formulaRoutes = require("./routes/formulaRoutes");
const productionRoutes = require("./routes/productionRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

/* ─────────────────────────────
   BODY PARSER
──────────────────────────── */
app.use(express.json());

/* ─────────────────────────────
   CORS CONFIG (FIXED PRODUCTION)
──────────────────────────── */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://nepchawarehouse.com",
      "http://localhost:5173",
      "http://localhost:5174"
    ];

    // allow tools like Postman or server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("❌ CORS blocked:", origin);
    return callback(null, false);
  },

  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ─────────────────────────────
   HEALTH CHECK
──────────────────────────── */
app.get("/api/health", (req, res) => {
  res.send("API Running...");
});

/* ─────────────────────────────
   DB TEST
──────────────────────────── */
(async () => {
  try {
    const rows = await db.query("SELECT NOW() AS now");
    console.log("DB Connected:", rows[0]);
  } catch (err) {
    console.error("DB Error:", err);
  }
})();

/* ─────────────────────────────
   ROUTES
──────────────────────────── */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/raw-materials", rawmaterialRoutes);
app.use("/api/finished-goods", fgRouter);
app.use("/api/consumption", consumptionRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/formulas", formulaRoutes);
app.use("/api/productions", productionRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/orders", orderRoutes);

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
  res.status(500).json({
    success: false,
    message: err.message,
  }); 
});

/* ─────────────────────────────
   START SERVER
──────────────────────────── */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});