export default function NextStepCard({ title = "What to do next", description, steps = [] }) {
  if (!description && !steps.length) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">{title}</p>
      {description ? <p className="mt-2 text-sm text-amber-900">{description}</p> : null}
      {steps.length ? (
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={`${step}-${index}`} className="rounded-2xl border border-amber-200/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
