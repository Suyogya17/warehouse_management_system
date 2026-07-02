import * as XLSX from "xlsx";
import { useState, useRef, useEffect } from "react";
import { formatDate, formatNumber } from "../utils/format";
import EmptyState from "./EmptyState";

const toExportValue = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toExportValue).filter(Boolean).join(" ");
  }
  if (value?.props?.children !== undefined) {
    return toExportValue(value.props.children);
  }

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
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchKey, setSearchKey] = useState("all");
  const tableContainerRef = useRef(null);
  const rowsPerPage = 10;

  // ✅ 1. PUT useEffect HERE (always runs first)
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchKey, rows]);

  // ✅ 2. THEN do early return
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  // ✅ 3. rest of your logic
  const searchableColumns = columns.filter((col) => col.searchable !== false);

  const getCellSearchValue = (row, col, rowIndex) => {
    if (typeof col.searchValue === "function") {
      return toExportValue(col.searchValue(row, rowIndex));
    }

    return getExportCellValue(row, col, rowIndex);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredData = normalizedSearch
    ? rows.filter((row, rowIndex) => {
        const columnsToSearch =
          searchKey === "all"
            ? searchableColumns
            : searchableColumns.filter((col) => col.key === searchKey);

        return columnsToSearch.some((col) =>
          String(getCellSearchValue(row, col, rowIndex) || "")
            .toLowerCase()
            .includes(normalizedSearch)
        );
      })
    : rows;

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  const paginatedRows = filteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  function getExportCellValue(row, col, rowIndex) {
    if (typeof col.exportValue === "function") {
      return toExportValue(col.exportValue(row, rowIndex));
    }

    if (col.type === "date") {
      return row[col.key] ? formatDate(row[col.key]) : "";
    }

    if (row[col.key] !== undefined && row[col.key] !== null) {
      return toExportValue(row[col.key]);
    }

    if (typeof col.render === "function") {
      const rendered = col.render(row, rowIndex);
      return toExportValue(rendered);
    }

    return "";
  }

  const handleExport = () => {
    const exportRows = filteredData.map((row, rowIndex) =>
      columns.reduce((acc, col) => {
        acc[col.label || col.key] = getExportCellValue(row, col, rowIndex);
        return acc;
      }, {})
    );

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${normalizeFilename(exportFilename)}.xlsx`);
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
        label: summary.label || columns.find((col) => col.key === summary.key)?.label || summary.key,
        total,
        suffix: summary.suffix || "",
      };
    })
    .filter((item) => item.label);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push("...");
    }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages) {
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
                <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search table..."
                        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 sm:w-72"
                      />
                      <select
                        value={searchKey}
                        onChange={(event) => setSearchKey(event.target.value)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                      >
                        <option value="all">All columns</option>
                        {searchableColumns.map((col) => (
                          <option key={col.key} value={col.key}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      Export Excel
                    </button>
                  </div>

                  {/* MOBILE TABLE VIEW */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
              <tr className="bg-slate-50 border-b border-slate-200 bg-indigo-50">
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedRows.map((row, rowIndex) => (
                  <tr key={row.id || rowIndex} className="hover:bg-slate-50/50 transition-colors group">
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key}
                        className={`px-4 py-4 whitespace-nowrap text-sm text-slate-600 ${
                          colIndex === 0
                            ? " left-0 bg-white font-semibold text-slate-900 z-10 group-hover:bg-slate-50"
                            : ""
                        }`}
                      >
                        {col.render
                          ? col.render(row, rowIndex)
                          : col.type === "date"
                          ? formatDate(row[col.key])
                          : row[col.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        
      

      {/* DESKTOP TABLE VIEW (Simplified for briefness, apply same filter logic) */}
      <div className="hidden sm:block overflow-x-auto">
         {/* ... (Desktop table code remains largely same, but use paginatedRows) ... */}
      </div>

      {/* PAGINATION */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-white">
        <div className="text-sm text-slate-500">
          Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}–
          {Math.min(currentPage * rowsPerPage, filteredData.length)} of {filteredData.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            Prev
          </button>
          {getPageNumbers().map((page, i) => (
            <button
              key={i}
              onClick={() => typeof page === "number" && setCurrentPage(page)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                currentPage === page
                  ? "bg-indigo-600 text-white"
                  : "border hover:bg-indigo-50 text-slate-700"
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {summaryItems.length ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total {item.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatNumber(item.total)}{item.suffix ? ` ${item.suffix}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
