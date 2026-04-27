export default function EntitySummaryCard({ title, subtitle, imageUrl, metrics = [], description, action }) {
  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
      <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white">
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="h-[120px] w-full object-cover" />
          ) : (
            <div className="flex h-[120px] items-center justify-center text-sm text-slate-500">
              No image
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected item</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{title}</h3>
              {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>

          {metrics.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{metric.value || "-"}</p>
                </div>
              ))}
            </div>
          ) : null}

          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}
