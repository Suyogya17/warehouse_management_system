export default function MultiSeriesFilter({
  options = [],
  values = [],
  onChange,
  label = "Series",
  className = "",
  buttonClassName = "",
}) {
  const selected = Array.isArray(values) ? values : [];

  const toggle = (series) => {
    onChange(
      selected.includes(series)
        ? selected.filter((value) => value !== series)
        : [...selected, series]
    );
  };

  return (
    <div className={`min-w-0 ${className}`}>
      {label ? (
        <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>
      ) : null}
      <details className="group relative">
        <summary
          aria-label="Filter by multiple series"
          className={`flex h-11 min-w-44 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm marker:content-none focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${buttonClassName}`}
        >
          <span className="min-w-0 truncate">
            {selected.length === 0
              ? "All series"
              : selected.length === 1
                ? selected[0]
                : `${selected.length} series selected`}
          </span>
          <span className="shrink-0 text-xs text-slate-500 transition group-open:rotate-180">▼</span>
        </summary>
        <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Select series
            </span>
            {selected.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Clear all
              </button>
            ) : null}
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {options.length ? options.map((series) => {
              const checked = selected.includes(series);
              return (
                <label
                  key={series}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50 ${
                    checked ? "bg-indigo-50 font-medium text-indigo-800" : "text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(series)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate">{series}</span>
                </label>
              );
            }) : (
              <p className="px-2.5 py-3 text-sm text-slate-500">No series available.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
