import Icon from "./Icon";

export default function SectionCard({ title, subtitle, children, actions, icon = "spark" }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-1 py-3 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-2 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Icon name={icon} className="h-4 w-4" />
            </span>
            <h2 className="min-w-0 break-words text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
          </div>
          {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 md:w-auto">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
