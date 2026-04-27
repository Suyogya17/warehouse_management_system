const tones = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  neutral: "bg-slate-100 text-slate-700 ring-slate-600/10",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

export default function StatusBadge({ children, tone = "neutral" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}
