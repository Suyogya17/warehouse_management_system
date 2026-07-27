import SectionCard from "../../components/SectionCard";
import { formatNumber } from "../../utils/format";

export const statusTone = {
  DELIVERED: "success",
  FULFILLED: "success",
  PACKED: "info",
  CONFIRMED: "info",
  PENDING: "warning",
  CANCELLED: "danger",
};

export const numberTooltip = (value) => formatNumber(value);

export const productName = (row) =>
  [row.article_code || row.name, row.color, row.size].filter(Boolean).join(" / ");

export const shortLabel = (value = "", maxLength = 18) => {
  const text = String(value || "Unknown").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
};

export const getSeriesName = (soleCode = "") =>
  String(soleCode || "Unassigned")
    .replace(/[-_\s]*sole$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Unassigned";

export const SERIES_COLORS = [
  "#4f46e5",
  "#0f766e",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0284c7",
  "#65a30d",
  "#db2777",
  "#64748b",
];

export const getSeriesColor = (index) =>
  SERIES_COLORS[index] || `hsl(${Math.round((index * 137.508) % 360)} 68% 46%)`;

export const getProductLineColor = (color = "") => {
  const value = String(color).toLowerCase();
  if (value.includes("red") || value.includes("maroon")) return "#dc2626";
  if (value.includes("blue")) return "#2563eb";
  if (value.includes("green")) return "#059669";
  if (value.includes("orange")) return "#ea580c";
  if (value.includes("pink")) return "#db2777";
  if (value.includes("yellow") || value.includes("gold")) return "#ca8a04";
  if (value.includes("black")) return "#0f172a";
  if (value.includes("grey") || value.includes("gray") || value.includes("white")) return "#64748b";
  return "#4f46e5";
};

export function ChartFrame({ children, height = 300 }) {
  return <div className="h-[300px] w-full px-2 py-4 md:px-6" style={{ height }}>{children}</div>;
}

export function ChartSummary({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export const sumRows = (rows = [], key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

export function WorkflowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const title = row.tooltip_label || row.user_name || row.product_name || row.product_label || row.status || label;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg shadow-slate-900/10">
      <p className="font-semibold text-slate-900">{title}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-900">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
      {row.reason ? <p className="mt-2 max-w-xs text-xs text-slate-500">{row.reason}</p> : null}
    </div>
  );
}

export function SeriesSalesTooltip({ active, payload, totalQuantity }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const percentage = totalQuantity > 0
    ? (Number(row.total_quantity || 0) / totalQuantity) * 100
    : 0;

  return (
    <div className="min-w-52 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg shadow-slate-900/10">
      <p className="font-bold text-slate-950">{row.series}</p>
      <div className="mt-2 space-y-1.5 text-slate-600">
        <p className="flex justify-between gap-6"><span>Quantity</span><strong className="text-slate-950">{formatNumber(row.total_quantity)} pairs</strong></p>
        <p className="flex justify-between gap-6"><span>Sales share</span><strong className="text-slate-950">{percentage.toFixed(1)}%</strong></p>
        <p className="flex justify-between gap-6"><span>Orders</span><strong className="text-slate-950">{formatNumber(row.order_count)}</strong></p>
        <p className="flex justify-between gap-6"><span>Products</span><strong className="text-slate-950">{formatNumber(row.product_count)}</strong></p>
      </div>
    </div>
  );
}

