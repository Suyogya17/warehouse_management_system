import Icon from "./Icon";

export default function EmptyState({ title = "No data yet", description = "There are no records to show right now.", icon = "box" }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
