require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const stockRoutes = require("./routes/stockRoute");
const rawmaterialRoutes = require("./routes/rawmaterialRoutes");
const { fgRouter, consumptionRouter, auditRouter } = require("./routes/miscRoutes");
const formulaRoutes = require("./routes/formulaRoutes");
const productionRoutes = require("./routes/productionRoutes");
const path = require("path");
const app = express();

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Running...");
});

// TEST DATABASE CONNECTION
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.log("DB Error:", err);
  } else {
    console.log("DB Connected:", res.rows);
  }
});

// console.log("JWT_SECRET:", process.env.JWT_SECRET);

const PORT = process.env.PORT || 3000;

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/raw-materials", rawmaterialRoutes);
app.use("/api/finished-goods", fgRouter);
app.use("/api/consumption", consumptionRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/formulas", formulaRoutes);
app.use("/api/productions", productionRoutes);

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
