import { formatDate } from "../utils/format";
import EmptyState from "./EmptyState";

export default function DataTable({ columns, rows, emptyTitle, emptyDescription }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:hidden">
        Swipe horizontally to see every column, or use the card layout below for quick scanning.
      </div>
      <div className="sm:hidden">
        <div className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <article key={row.id || index} className="space-y-3 px-4 py-4">
              {columns.map((column) => (
                <div key={column.key} className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {column.label}
                  </p>
                  <div className="text-sm text-slate-700">
                    {column.render
                      ? column.render(row)
                      : column.type === "date"
                        ? formatDate(row[column.key])
                        : row[column.key] ?? "-"}
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, index) => (
              <tr key={row.id || index} className="align-top hover:bg-slate-50/60">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-4 text-slate-700">
                    {column.render
                      ? column.render(row)
                      : column.type === "date"
                        ? formatDate(row[column.key])
                        : row[column.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
