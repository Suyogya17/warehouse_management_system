import { Eye, EyeOff, Globe2, PackageCheck } from "lucide-react";
import { formatNumber } from "../utils/format";

const cards = (summary) => [
  {
    label: "Available articles",
    value: summary.totalAvailableArticles,
    help: "All article cards with stock above zero",
    icon: PackageCheck,
    tone: "border-slate-200 bg-white text-slate-700",
  },
  {
    label: "Open in both",
    value: summary.openInEveryCountryArticles,
    help: "Accessible in Nepal and India",
    icon: Globe2,
    tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  {
    label: "Open in any country",
    value: summary.openInAnyCountryArticles,
    help: "Accessible in Nepal, India, or both",
    icon: Eye,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    label: "Nepal only",
    value: summary.nepalOnlyArticles,
    help: "Open in Nepal but held in India",
    icon: Eye,
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    label: "India only",
    value: summary.indiaOnlyArticles,
    help: "Open in India but held in Nepal",
    icon: Eye,
    tone: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    label: "No country access",
    value: summary.noCountryAccessArticles,
    help: "On hold in both Nepal and India",
    icon: EyeOff,
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
];

export default function VisibilitySummary({ summary, className = "" }) {
  if (!summary) return null;

  const nepal = summary.byCountry?.NP || {};
  const india = summary.byCountry?.IN || {};

  return (
    <section className={`space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">Product visibility totals</h2>
          <p className="text-sm text-slate-500">
            Article-card totals based only on products with available stock.
          </p>
        </div>
        <p className="text-xs font-medium text-slate-400">
          Nepal and India are compared; their totals are not added together.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {cards(summary).map(({ label, value, help, icon: CardIcon, tone }) => (
          <div key={label} className={`rounded-xl border p-3 ${tone}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                {label}
              </p>
              <CardIcon size={16} />
            </div>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {formatNumber(value)}
            </p>
            <p className="mt-1 text-[11px] leading-snug opacity-80">{help}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="font-semibold text-slate-700">
            Nepal · {formatNumber(nepal.userCount)} customers
          </span>
          <span className="text-slate-500">
            <strong className="text-emerald-700">{formatNumber(nepal.openArticles)}</strong> open ·{" "}
            <strong className="text-amber-700">{formatNumber(nepal.onHoldArticles)}</strong> on hold
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="font-semibold text-slate-700">
            India · {formatNumber(india.userCount)} customers
          </span>
          <span className="text-slate-500">
            <strong className="text-emerald-700">{formatNumber(india.openArticles)}</strong> open ·{" "}
            <strong className="text-amber-700">{formatNumber(india.onHoldArticles)}</strong> on hold
          </span>
        </div>
      </div>
    </section>
  );
}
