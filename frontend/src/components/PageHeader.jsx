import Icon from "./Icon";

export default function PageHeader({ eyebrow, title, description, actions, children, icon = "spark" }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[linear-gradient(135deg,rgba(99,102,241,0.08),rgba(255,255,255,0))] px-6 py-6 md:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Icon name={icon} className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">{title}</h1>
            </div>
            {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 md:text-[15px]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
      {children ? <div className="border-t border-slate-100 px-6 py-4">{children}</div> : null}
    </div>
  );
}
