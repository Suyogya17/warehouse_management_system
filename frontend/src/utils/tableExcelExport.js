const border = {
  top: { style: "thin", color: { rgb: "D9E2F3" } },
  bottom: { style: "thin", color: { rgb: "D9E2F3" } },
  left: { style: "thin", color: { rgb: "D9E2F3" } },
  right: { style: "thin", color: { rgb: "D9E2F3" } },
};

const cleanSheetName = (value = "Data") =>
  String(value || "Data").replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || "Data";

const displayLength = (value) => {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 20;
  return String(value).length;
};

const getColumnWidth = (column, rows, columnIndex) => {
  if (column.width) return column.width;
  const longestValue = rows.reduce(
    (longest, row) => Math.max(longest, displayLength(row[columnIndex])),
    displayLength(column.label)
  );
  return Math.min(Math.max(longestValue + 2, column.type === "number" ? 13 : 10), 36);
};

export async function exportStyledTableExcel({
  title,
  filename,
  sheetName = "Data",
  columns,
  rows,
  totalRow = null,
}) {
  const xlsxModule = await import("xlsx-js-style");
  const XLSX = xlsxModule.default || xlsxModule;
  const generatedAt = new Date();
  const values = [
    [title],
    ["Generated", generatedAt],
    ["Rows", rows.length],
    [],
    columns.map((column) => column.label),
    ...rows,
  ];
  if (totalRow) values.push(totalRow);

  const worksheet = XLSX.utils.aoa_to_sheet(values, { cellDates: true });
  const lastColumn = Math.max(columns.length - 1, 0);
  const dataStartRow = 5;
  const dataEndRow = dataStartRow + rows.length - 1;
  const totalRowIndex = totalRow ? values.length - 1 : -1;

  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }];
  worksheet["!cols"] = columns.map((column, index) => ({
    wch: getColumnWidth(column, rows, index),
  }));
  worksheet["!rows"] = [{ hpt: 25 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 24 }];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 5 };
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 4, c: 0 },
      e: { r: Math.max(dataEndRow, 4), c: lastColumn },
    }),
  };
  worksheet["!pageSetup"] = {
    orientation: columns.length > 7 ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const titleCell = worksheet.A1;
  titleCell.s = {
    font: { name: "Arial", bold: true, color: { rgb: "1E1B4B" }, sz: 15 },
    alignment: { vertical: "center" },
  };

  [1, 2].forEach((rowIndex) => {
    [0, 1].forEach((columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: columnIndex === 0 ? "E0E7FF" : "F8FAFC" } },
        font: { name: "Arial", bold: columnIndex === 0, color: { rgb: "1E293B" }, sz: 10 },
        alignment: { vertical: "center" },
        border,
      };
      if (cell.v instanceof Date) cell.z = "dd-mmm-yyyy hh:mm";
    });
  });

  columns.forEach((column, columnIndex) => {
    const headerAddress = XLSX.utils.encode_cell({ r: 4, c: columnIndex });
    worksheet[headerAddress].s = {
      fill: { fgColor: { rgb: "4F46E5" } },
      font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
    };

    rows.forEach((row, rowOffset) => {
      const address = XLSX.utils.encode_cell({ r: dataStartRow + rowOffset, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: rowOffset % 2 === 0 ? "FFFFFF" : "F8FAFC" } },
        font: { name: "Arial", color: { rgb: "1E293B" }, sz: 10 },
        alignment: {
          horizontal: column.type === "number" ? "right" : "left",
          vertical: "center",
          wrapText: column.wrap === true,
        },
        border,
      };
      if (column.type === "number") cell.z = column.format || "#,##0.00";
      if (column.type === "integer") cell.z = "#,##0";
      if (column.type === "date") cell.z = "dd-mmm-yyyy hh:mm";
      if (column.type === "id") cell.z = "@";
    });
  });

  if (totalRowIndex >= 0) {
    columns.forEach((column, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: totalRowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: "E0E7FF" } },
        font: { name: "Arial", bold: true, color: { rgb: "1E1B4B" }, sz: 10 },
        alignment: { horizontal: column.type === "number" ? "right" : "left", vertical: "center" },
        border,
      };
      if (column.type === "number") cell.z = column.format || "#,##0.00";
      if (column.type === "integer") cell.z = "#,##0";
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName(sheetName));
  XLSX.writeFile(workbook, filename, { cellStyles: true, cellDates: true });
}

export const getFinishedGoodId = (row = {}) =>
  row.finished_good_id ?? row.finishedGoodId ?? row.fg_id ?? null;

export const hasFinishedGoodIdColumn = (columns = []) =>
  columns.some((column) => {
    const normalizedKey = String(column.key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedLabel = String(column.label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return ["finishedgoodid", "fgid"].includes(normalizedKey) ||
      ["finishedgoodid", "fgid"].includes(normalizedLabel);
  });
