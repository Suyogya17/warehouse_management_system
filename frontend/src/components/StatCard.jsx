import Icon from "./Icon";

export default function StatCard({ label, value, tone = "default", icon = "spark" }) {
  const tones = {
    default: "bg-white",
    alert: "bg-amber-50/70",
    calm: "bg-emerald-50/70",
    bold: "bg-slate-950 text-white",
  };

  return (
    <div className={`rounded-2xl border border-slate-200/80 p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-medium ${tone === "bold" ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${tone === "bold" ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-4 text-3xl font-semibold tracking-tight ${tone === "bold" ? "text-white" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}
