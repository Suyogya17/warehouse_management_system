import Icon from "./Icon";

export default function PageHeader({ eyebrow, title, description, actions, children, icon = "spark" }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-[linear-gradient(135deg,rgba(99,102,241,0.08),rgba(255,255,255,0))] px-4 py-5 sm:px-6 sm:py-6 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-5">
          <div className="min-w-0 max-w-3xl">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>
            ) : null}
            <div className="mt-2 flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 sm:h-11 sm:w-11 sm:rounded-2xl">
                <Icon name={icon} className="h-5 w-5" />
              </span>
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl md:text-[2rem]">{title}</h1>
            </div>
            {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 md:text-[15px]">{description}</p> : null}
          </div>
          {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:gap-3 md:w-auto">{actions}</div> : null}
        </div>
      </div>
      {children ? <div className="border-t border-slate-100 px-4 py-4 sm:px-6">{children}</div> : null}
    </div>
  );
}
