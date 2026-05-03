import { formatDate } from "../utils/format";
import EmptyState from "./EmptyState";

export default function DataTable({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}) {
  if (!rows.length) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
      
      {/* Mobile hint */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:hidden">
        Tap cards to view details. Scroll for more data.
      </div>

      {/* MOBILE CARD VIEW */}
      <div className="sm:hidden">
        <div className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <div
              key={row.id || index}
              className="p-4 active:bg-slate-50 transition"
            >
              <div className="space-y-3">
                {columns.map((col) => (
                  <div key={col.key} className="flex justify-between gap-4">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                      {col.label}
                    </span>

                    <span className="text-sm text-slate-700 text-right break-words">
                      {col.render
                        ? col.render(row)
                        : col.type === "date"
                        ? formatDate(row[col.key])
                        : row[col.key] ?? "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          
          {/* Sticky Header */}
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr
                key={row.id || index}
                className="hover:bg-slate-50 transition"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-4 text-slate-700">
                    <div className="max-w-[220px] truncate">
                      {col.render
                        ? col.render(row)
                        : col.type === "date"
                        ? formatDate(row[col.key])
                        : row[col.key] ?? "-"}
                    </div>
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