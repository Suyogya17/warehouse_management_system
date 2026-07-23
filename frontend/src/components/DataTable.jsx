import { useEffect, useRef, useState } from "react";
import { formatDate, formatNumber } from "../utils/format";
import EmptyState from "./EmptyState";

const toExportValue = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDate(value);
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(toExportValue).filter(Boolean).join(" ");
  if (value?.props?.children !== undefined) return toExportValue(value.props.children);
  return "";
};

const normalizeFilename = (value = "data-table") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "data-table";

export default function DataTable({
  columns,
  rows = [],
  emptyTitle,
  emptyDescription,
  exportFilename = "data-table",
  summaryColumns = [],
  showToolbar = true,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchKey, setSearchKey] = useState("all");
  const tableContainerRef = useRef(null);
  const rowsPerPage = 10;

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return undefined;

    const handleWheel = (event) => {
      if (event.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        event.preventDefault();
        container.scrollLeft += event.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchKey, rows]);

  function getExportCellValue(row, column, rowIndex) {
    if (typeof column.exportValue === "function") {
      return toExportValue(column.exportValue(row, rowIndex));
    }
    if (column.type === "date") return row[column.key] ? formatDate(row[column.key]) : "";
    if (row[column.key] !== undefined && row[column.key] !== null) {
      return toExportValue(row[column.key]);
    }
    if (typeof column.render === "function") {
      return toExportValue(column.render(row, rowIndex));
    }
    return "";
  }

  const searchableColumns = columns.filter((column) => column.searchable !== false);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredData = normalizedSearch
    ? rows.filter((row, rowIndex) => {
        const columnsToSearch =
          searchKey === "all"
            ? searchableColumns
            : searchableColumns.filter((column) => column.key === searchKey);

        return columnsToSearch.some((column) => {
          const value =
            typeof column.searchValue === "function"
              ? column.searchValue(row, rowIndex)
              : getExportCellValue(row, column, rowIndex);
          return String(toExportValue(value)).toLowerCase().includes(normalizedSearch);
        });
      })
    : rows;

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedRows = filteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const renderCell = (row, column, rowIndex) => {
    if (column.render) return column.render(row, rowIndex);
    if (column.type === "date") return row[column.key] ? formatDate(row[column.key]) : "-";
    return row[column.key] ?? "-";
  };

  const summaryItems = summaryColumns
    .map((summary) => {
      const total = filteredData.reduce((sum, row) => {
        const value =
          typeof summary.value === "function" ? summary.value(row) : row[summary.key];
        const number = Number(value || 0);
        return Number.isFinite(number) ? sum + number : sum;
      }, 0);

      return {
        label:
          summary.label ||
          columns.find((column) => column.key === summary.key)?.label ||
          summary.key,
        total,
        suffix: summary.suffix || "",
      };
    })
    .filter((item) => item.label);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push("...");
    }
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < totalPages) {
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const handleExport = async () => {
    const XLSX = await import("xlsx");
    const exportRows = filteredData.map((row, rowIndex) =>
      columns.reduce((result, column) => {
        result[column.label || column.key] = getExportCellValue(row, column, rowIndex);
        return result;
      }, {})
    );
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${normalizeFilename(exportFilename)}.xlsx`);
  };

  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {showToolbar ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search table..."
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 sm:w-72"
            />
            <select
              value={searchKey}
              onChange={(event) => setSearchKey(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 sm:w-auto"
            >
              <option value="all">All columns</option>
              {searchableColumns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 sm:w-auto"
          >
            Export Excel
          </button>
        </div>
      ) : null}

      {paginatedRows.length ? (
        <>
          <div className="divide-y divide-slate-100 md:hidden">
            {paginatedRows.map((row, rowIndex) => (
              <article
                key={row.id || rowIndex}
                className="space-y-1 px-3 py-4 odd:bg-white even:bg-slate-50/60"
              >
                {columns.map((column, columnIndex) => (
                  <div
                    key={column.key}
                    className="grid grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] gap-3 rounded-lg px-1 py-1.5"
                  >
                    <p className="text-xs font-semibold uppercase leading-5 tracking-wide text-slate-500">
                      {column.label}
                    </p>
                    <div
                      className={`min-w-0 break-words text-right text-sm leading-5 ${
                        columnIndex === 0 ? "font-semibold text-slate-950" : "text-slate-700"
                      }`}
                    >
                      {renderCell(row, column, rowIndex)}
                    </div>
                  </div>
                ))}
              </article>
            ))}
          </div>

          <div
            ref={tableContainerRef}
            className="touch-scroll hidden overflow-x-auto md:block"
          >
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-indigo-50">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRows.map((row, rowIndex) => (
                  <tr
                    key={row.id || rowIndex}
                    className="group transition-colors hover:bg-slate-50"
                  >
                    {columns.map((column, columnIndex) => (
                      <td
                        key={column.key}
                        className={`px-4 py-4 align-top text-sm text-slate-600 ${
                          columnIndex === 0
                            ? "sticky left-0 z-10 bg-white font-semibold text-slate-900 group-hover:bg-slate-50"
                            : ""
                        }`}
                      >
                        {renderCell(row, column, rowIndex)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyState
          title="No matching records"
          description="Try a different search term or table column."
        />
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="text-center text-sm text-slate-500 sm:text-left">
          Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}–
          {Math.min(currentPage * rowsPerPage, filteredData.length)} of {filteredData.length}
        </div>
        <div className="flex max-w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:justify-end sm:gap-2 sm:pb-0">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            disabled={currentPage === 1}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-2 text-sm font-medium text-slate-600 sm:hidden">
            {currentPage} / {Math.max(totalPages, 1)}
          </span>
          {getPageNumbers().map((page, index) =>
            typeof page === "number" ? (
              <button
                type="button"
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`hidden shrink-0 rounded-lg px-3 py-1.5 text-sm sm:inline-flex ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "border text-slate-700 hover:bg-indigo-50"
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={`${page}-${index}`} className="hidden px-1 text-slate-400 sm:inline">
                {page}
              </span>
            )
          )}
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {summaryItems.length ? (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-4 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total {item.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatNumber(item.total)}
                  {item.suffix ? ` ${item.suffix}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
