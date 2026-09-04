export default function NClassificationFilter({
  value = "all",
  onChange,
  className = "",
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Filter products by N classification"
      className={`h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${className}`.trim()}
    >
      <option value="all">All N classes</option>
      <option value="N1">N1 products</option>
      <option value="N2">N2 products</option>
      <option value="unclassified">Not classified</option>
    </select>
  );
}
