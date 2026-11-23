const numeric = (value) => Number(value || 0);

const excelDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date;
};

const safeFilenamePart = (value) =>
  String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "report";

const border = {
  top: { style: "thin", color: { rgb: "D9E2F3" } },
  bottom: { style: "thin", color: { rgb: "D9E2F3" } },
  left: { style: "thin", color: { rgb: "D9E2F3" } },
  right: { style: "thin", color: { rgb: "D9E2F3" } },
};

const tableSheet = (XLSX, { title, metadata, columns, rows, totalRow }) => {
  const values = [
    [title],
    ["Selection", metadata.selection, "Level", metadata.level],
    ["Period", metadata.period, "Generated", metadata.generated],
    [],
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key] ?? "")),
  ];
  if (totalRow) values.push(columns.map((column) => totalRow[column.key] ?? ""));

  const sheet = XLSX.utils.aoa_to_sheet(values, { cellDates: true });
  const lastColumn = Math.max(columns.length - 1, 0);
  const dataStartRow = 5;
  const dataEndRow = dataStartRow + rows.length - 1;
  const totalRowIndex = totalRow ? values.length - 1 : -1;

  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }];
  sheet["!cols"] = columns.map((column) => ({ wch: column.width || 14 }));
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 21 }, { hpt: 21 }, { hpt: 8 }, { hpt: 24 }];
  sheet["!freeze"] = { xSplit: 0, ySplit: 5 };
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: Math.max(dataEndRow, 4), c: lastColumn } }),
  };
  sheet["!pageSetup"] = {
    orientation: columns.length > 7 ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
  };

  for (let columnIndex = 0; columnIndex <= lastColumn; columnIndex += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    if (!sheet[address]) sheet[address] = { t: "s", v: "" };
    sheet[address].s = {
      fill: { fgColor: { rgb: "3730A3" } },
      font: { color: { rgb: "FFFFFF" }, bold: true, sz: 16 },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }

  [1, 2].forEach((rowIndex) => {
    for (let columnIndex = 0; columnIndex <= Math.min(lastColumn, 3); columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      if (!cell) continue;
      cell.s = {
        fill: { fgColor: { rgb: columnIndex % 2 === 0 ? "E0E7FF" : "F8FAFC" } },
        font: { bold: columnIndex % 2 === 0, color: { rgb: "1E293B" } },
        alignment: { vertical: "center" },
        border,
      };
      if (cell.v instanceof Date) cell.z = "dd-mmm-yyyy hh:mm";
    }
  });

  columns.forEach((column, columnIndex) => {
    const headerAddress = XLSX.utils.encode_cell({ r: 4, c: columnIndex });
    sheet[headerAddress].s = {
      fill: { fgColor: { rgb: "4F46E5" } },
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
    };

    rows.forEach((row, rowOffset) => {
      const rowIndex = dataStartRow + rowOffset;
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: rowOffset % 2 === 0 ? "FFFFFF" : "F8FAFC" } },
        font: { color: { rgb: "1E293B" } },
        alignment: {
          horizontal: column.type === "number" ? "right" : "left",
          vertical: "top",
          wrapText: true,
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
      const cell = sheet[address];
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: "E0E7FF" } },
        font: { bold: true, color: { rgb: "1E1B4B" } },
        alignment: { horizontal: column.type === "number" || column.type === "integer" ? "right" : "left" },
        border,
      };
      if (column.type === "number") cell.z = column.format || "#,##0.00";
      if (column.type === "integer") cell.z = "#,##0";
    });
  }

  return sheet;
};

const aggregateUserArticles = (orderDetails) => {
  const groups = new Map();
  orderDetails.forEach((row) => {
    const key = `${row.user_id ?? row.user_name ?? "unknown"}:${row.finished_good_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        finished_good_id: row.finished_good_id,
        user_name: row.user_name || "Unknown user",
        user_email: row.user_email || "",
        user_role: row.user_role || "UNKNOWN",
        article_code: row.article_code || row.product_name || "",
        product_name: row.product_name || "",
        series: row.series || "",
        color: row.color || "",
        size: row.size || "",
        order_ids: new Set(),
        ordered_pairs: 0,
        ordered_cartons: 0,
        cancelled_pairs: 0,
        pending_pairs: 0,
        confirmed_pairs: 0,
        packed_pairs: 0,
        delivered_pairs: 0,
      });
    }
    const group = groups.get(key);
    group.order_ids.add(row.order_id);
    const status = String(row.status || "").toUpperCase();
    if (status !== "CANCELLED") {
      group.ordered_pairs += numeric(row.included_ordered_pairs);
      group.ordered_cartons += numeric(row.ordered_cartons);
    }
    group.cancelled_pairs += numeric(row.cancelled_pairs);
    const statusKey = `${status.toLowerCase()}_pairs`;
    if (Object.prototype.hasOwnProperty.call(group, statusKey)) {
      group[statusKey] += numeric(row.ordered_pairs);
    }
  });
  return [...groups.values()]
    .map((group) => ({ ...group, order_count: group.order_ids.size, order_ids: undefined }))
    .sort((left, right) =>
      left.user_name.localeCompare(right.user_name, undefined, { numeric: true }) ||
      left.article_code.localeCompare(right.article_code, undefined, { numeric: true })
    );
};

const aggregateArticles = (productRows, orderDetails) => {
  const groups = new Map();
  productRows.forEach((row) => {
    const key = String(row.article_code || row.name || row.id || "Unassigned");
    if (!groups.has(key)) {
      groups.set(key, {
        article_code: row.article_code || row.name || "Unassigned",
        series_values: new Set(),
        product_names: new Set(),
        product_variants: 0,
        produced_pairs: 0,
        produced_cartons: 0,
        ordered_pairs: 0,
        ordered_cartons: 0,
        production_minus_orders_pairs: 0,
        production_runs: 0,
        cancelled_pairs: 0,
        valid_order_ids: new Set(),
        valid_user_ids: new Set(),
      });
    }
    const group = groups.get(key);
    if (row.series) group.series_values.add(row.series);
    if (row.name) group.product_names.add(row.name);
    group.product_variants += 1;
    group.produced_pairs += numeric(row.produced_pairs);
    group.produced_cartons += numeric(row.produced_cartons);
    group.ordered_pairs += numeric(row.ordered_pairs);
    group.ordered_cartons += numeric(row.ordered_cartons);
    group.production_minus_orders_pairs += numeric(row.production_minus_orders_pairs);
    group.production_runs += numeric(row.production_runs);
    group.cancelled_pairs += numeric(row.cancelled_pairs);
  });

  orderDetails.forEach((row) => {
    if (String(row.status || "").toUpperCase() === "CANCELLED") return;
    const key = String(row.article_code || row.product_name || row.finished_good_id || "Unassigned");
    const group = groups.get(key);
    if (!group) return;
    group.valid_order_ids.add(row.order_id);
    group.valid_user_ids.add(row.user_id ?? row.user_name ?? "unknown");
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      series: [...group.series_values].join(", "),
      product_names: [...group.product_names].join(", "),
      order_count: group.valid_order_ids.size,
      user_count: group.valid_user_ids.size,
      series_values: undefined,
      valid_order_ids: undefined,
      valid_user_ids: undefined,
    }))
    .sort((left, right) => left.article_code.localeCompare(right.article_code, undefined, { numeric: true }));
};

const sumRows = (rows, keys) =>
  keys.reduce((result, key) => ({ ...result, [key]: rows.reduce((sum, row) => sum + numeric(row[key]), 0) }), {});

export async function exportProductionOrdersWorkbook(report) {
  if (!report) throw new Error("Create the report before exporting Excel.");

  const xlsxModule = await import("xlsx-js-style");
  const XLSX = xlsxModule.default || xlsxModule;
  const workbook = XLSX.utils.book_new();
  const summary = report.summary || {};
  const products = report.product_breakdown || [];
  const users = report.user_orders || [];
  const orderDetails = report.order_details || [];
  const productionRuns = report.production_runs || [];
  const userArticles = aggregateUserArticles(orderDetails);
  const metadata = {
    selection: report.selection?.label || "",
    level: report.selection?.level || "",
    period: report.period?.label || "All time",
    generated: new Date(),
  };

  const summaryColumns = [
    { key: "metric", label: "Metric", width: 34 },
    { key: "pairs", label: "Pairs", width: 18, type: "number" },
    { key: "cartons_or_count", label: "CTN / Count", width: 18, type: "number" },
  ];
  const summaryRows = [
    { metric: "Total production", pairs: numeric(summary.produced_pairs), cartons_or_count: numeric(summary.produced_cartons) },
    { metric: "Total orders (cancelled excluded)", pairs: numeric(summary.ordered_pairs), cartons_or_count: numeric(summary.ordered_cartons) },
    { metric: "Production minus orders", pairs: numeric(summary.production_minus_orders_pairs), cartons_or_count: "" },
    { metric: "Cancelled order quantity", pairs: numeric(summary.cancelled_pairs), cartons_or_count: "" },
    { metric: "Production runs", pairs: "", cartons_or_count: numeric(summary.production_runs) },
    { metric: "Valid orders", pairs: "", cartons_or_count: numeric(summary.order_count) },
    { metric: "Users who ordered", pairs: "", cartons_or_count: numeric(summary.user_count) },
    { metric: "Exact product variants", pairs: "", cartons_or_count: numeric(report.selection?.product_count) },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, { title: "PRODUCTION VS ORDERS SUMMARY", metadata, columns: summaryColumns, rows: summaryRows }),
    "Summary"
  );

  const productRows = products.map((row) => ({
    ...row,
    id: String(row.id ?? ""),
    produced_cartons: numeric(row.pairs_per_carton) > 0 ? numeric(row.produced_pairs) / numeric(row.pairs_per_carton) : 0,
    ordered_cartons: numeric(row.pairs_per_carton) > 0 ? numeric(row.ordered_pairs) / numeric(row.pairs_per_carton) : 0,
  }));
  const articleRows = aggregateArticles(productRows, orderDetails);
  const articleColumns = [
    { key: "article_code", label: "Article", width: 16 },
    { key: "product_names", label: "Product Name(s)", width: 28 },
    { key: "series", label: "Series", width: 14 },
    { key: "product_variants", label: "Variants", width: 11, type: "integer" },
    { key: "produced_pairs", label: "Produced Pairs", width: 16, type: "number" },
    { key: "produced_cartons", label: "Produced CTN", width: 15, type: "number" },
    { key: "ordered_pairs", label: "Ordered Pairs", width: 16, type: "number" },
    { key: "ordered_cartons", label: "Ordered CTN", width: 15, type: "number" },
    { key: "production_minus_orders_pairs", label: "Difference Pairs", width: 17, type: "number" },
    { key: "production_runs", label: "Production Runs", width: 16, type: "integer" },
    { key: "order_count", label: "Orders", width: 11, type: "integer" },
    { key: "user_count", label: "Users", width: 10, type: "integer" },
    { key: "cancelled_pairs", label: "Cancelled Pairs", width: 16, type: "number" },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "ARTICLE SUMMARY",
      metadata,
      columns: articleColumns,
      rows: articleRows,
      totalRow: {
        article_code: "TOTAL",
        product_variants: numeric(report.selection?.product_count),
        ...sumRows(articleRows, ["produced_pairs", "produced_cartons", "ordered_pairs", "ordered_cartons", "production_minus_orders_pairs", "production_runs", "cancelled_pairs"]),
        order_count: numeric(summary.order_count),
        user_count: numeric(summary.user_count),
      },
    }),
    "Article Summary"
  );

  const productColumns = [
    { key: "id", label: "FG.ID", width: 10, type: "id" },
    { key: "article_code", label: "Article", width: 16 },
    { key: "name", label: "Product Name", width: 25 },
    { key: "series", label: "Series", width: 14 },
    { key: "color", label: "Color", width: 15 },
    { key: "size", label: "Size", width: 12 },
    { key: "pairs_per_carton", label: "Pairs / CTN", width: 13, type: "number" },
    { key: "produced_pairs", label: "Produced Pairs", width: 16, type: "number" },
    { key: "produced_cartons", label: "Produced CTN", width: 15, type: "number" },
    { key: "ordered_pairs", label: "Ordered Pairs", width: 16, type: "number" },
    { key: "ordered_cartons", label: "Ordered CTN", width: 15, type: "number" },
    { key: "production_minus_orders_pairs", label: "Difference Pairs", width: 17, type: "number" },
    { key: "production_runs", label: "Production Runs", width: 16, type: "integer" },
    { key: "order_count", label: "Orders", width: 11, type: "integer" },
    { key: "user_count", label: "Users", width: 10, type: "integer" },
    { key: "cancelled_pairs", label: "Cancelled Pairs", width: 16, type: "number" },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "EXACT PRODUCT VARIANTS",
      metadata,
      columns: productColumns,
      rows: productRows,
      totalRow: {
        article_code: "TOTAL",
        ...sumRows(productRows, ["produced_pairs", "produced_cartons", "ordered_pairs", "ordered_cartons", "production_minus_orders_pairs", "production_runs", "cancelled_pairs"]),
      },
    }),
    "Product Variants"
  );

  const userColumns = [
    { key: "user_name", label: "User", width: 24 },
    { key: "user_email", label: "Email", width: 28 },
    { key: "user_role", label: "Role", width: 14 },
    { key: "order_count", label: "Orders", width: 10, type: "integer" },
    { key: "ordered_cartons", label: "Ordered CTN", width: 14, type: "number" },
    { key: "ordered_pairs", label: "Ordered Pairs", width: 15, type: "number" },
    { key: "pending_pairs", label: "Pending", width: 13, type: "number" },
    { key: "confirmed_pairs", label: "Confirmed", width: 13, type: "number" },
    { key: "packed_pairs", label: "Packed", width: 13, type: "number" },
    { key: "delivered_pairs", label: "Delivered", width: 13, type: "number" },
    { key: "cancelled_pairs", label: "Cancelled", width: 13, type: "number" },
    { key: "last_order_at", label: "Last Order", width: 20, type: "date" },
  ];
  const userRows = users.map((row) => ({ ...row, last_order_at: excelDate(row.last_order_at) }));
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "ORDERS BY USER",
      metadata,
      columns: userColumns,
      rows: userRows,
      totalRow: { user_name: "TOTAL", ...sumRows(userRows, ["order_count", "ordered_cartons", "ordered_pairs", "pending_pairs", "confirmed_pairs", "packed_pairs", "delivered_pairs", "cancelled_pairs"]) },
    }),
    "User Summary"
  );

  const userArticleColumns = [
    { key: "user_name", label: "User", width: 24 },
    { key: "user_email", label: "Email", width: 27 },
    { key: "user_role", label: "Role", width: 13 },
    { key: "finished_good_id", label: "FG.ID", width: 10, type: "id" },
    { key: "article_code", label: "Article", width: 16 },
    { key: "product_name", label: "Product Name", width: 24 },
    { key: "series", label: "Series", width: 13 },
    { key: "color", label: "Color", width: 14 },
    { key: "size", label: "Size", width: 11 },
    { key: "order_count", label: "Orders", width: 10, type: "integer" },
    { key: "ordered_cartons", label: "Ordered CTN", width: 14, type: "number" },
    { key: "ordered_pairs", label: "Ordered Pairs", width: 15, type: "number" },
    { key: "pending_pairs", label: "Pending", width: 12, type: "number" },
    { key: "confirmed_pairs", label: "Confirmed", width: 12, type: "number" },
    { key: "packed_pairs", label: "Packed", width: 12, type: "number" },
    { key: "delivered_pairs", label: "Delivered", width: 12, type: "number" },
    { key: "cancelled_pairs", label: "Cancelled", width: 13, type: "number" },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "EACH USER BY ARTICLE",
      metadata,
      columns: userArticleColumns,
      rows: userArticles.map((row) => ({ ...row, finished_good_id: String(row.finished_good_id ?? "") })),
      totalRow: { user_name: "TOTAL", ...sumRows(userArticles, ["ordered_cartons", "ordered_pairs", "pending_pairs", "confirmed_pairs", "packed_pairs", "delivered_pairs", "cancelled_pairs"]) },
    }),
    "User Article"
  );

  const orderColumns = [
    { key: "order_id", label: "Order ID", width: 11, type: "integer" },
    { key: "ordered_at", label: "Order Date", width: 20, type: "date" },
    { key: "user_name", label: "Ordered By", width: 23 },
    { key: "user_email", label: "User Email", width: 27 },
    { key: "user_role", label: "Role", width: 13 },
    { key: "customer_name", label: "Customer", width: 28 },
    { key: "customer_phone", label: "Phone", width: 16 },
    { key: "customer_address", label: "Address", width: 28 },
    { key: "transport_name", label: "Transport", width: 20 },
    { key: "delivery_note_number", label: "Delivery Note", width: 17 },
    { key: "status", label: "Status", width: 13 },
    { key: "finished_good_id", label: "FG.ID", width: 10, type: "id" },
    { key: "article_code", label: "Article", width: 16 },
    { key: "product_name", label: "Product Name", width: 24 },
    { key: "series", label: "Series", width: 13 },
    { key: "color", label: "Color", width: 14 },
    { key: "size", label: "Size", width: 11 },
    { key: "ordered_cartons", label: "Line CTN", width: 14, type: "number" },
    { key: "ordered_pairs", label: "Line Pairs", width: 14, type: "number" },
    { key: "included_ordered_pairs", label: "Valid Ordered Pairs", width: 18, type: "number" },
    { key: "cancelled_pairs", label: "Cancelled Pairs", width: 16, type: "number" },
  ];
  const detailedOrders = orderDetails.map((row) => ({
    ...row,
    finished_good_id: String(row.finished_good_id ?? ""),
    ordered_at: excelDate(row.ordered_at),
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "INDIVIDUAL ORDER LINES",
      metadata,
      columns: orderColumns,
      rows: detailedOrders,
      totalRow: { order_id: "TOTAL", ...sumRows(detailedOrders, ["ordered_cartons", "ordered_pairs", "included_ordered_pairs", "cancelled_pairs"]) },
    }),
    "Order Details"
  );

  const productionColumns = [
    { key: "production_id", label: "Production ID", width: 14, type: "integer" },
    { key: "produced_at", label: "Production Date", width: 20, type: "date" },
    { key: "finished_good_id", label: "FG.ID", width: 10, type: "id" },
    { key: "article_code", label: "Article", width: 16 },
    { key: "product_name", label: "Product Name", width: 25 },
    { key: "series", label: "Series", width: 13 },
    { key: "color", label: "Color", width: 14 },
    { key: "size", label: "Size", width: 11 },
    { key: "produced_cartons", label: "Produced CTN", width: 15, type: "number" },
    { key: "produced_pairs", label: "Produced Pairs", width: 16, type: "number" },
    { key: "produced_by_name", label: "Produced By", width: 23 },
    { key: "produced_by_email", label: "Producer Email", width: 27 },
    { key: "notes", label: "Notes", width: 36 },
  ];
  const detailedProduction = productionRuns.map((row) => ({
    ...row,
    finished_good_id: String(row.finished_good_id ?? ""),
    produced_at: excelDate(row.produced_at),
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    tableSheet(XLSX, {
      title: "PRODUCTION RUN DETAILS",
      metadata,
      columns: productionColumns,
      rows: detailedProduction,
      totalRow: { production_id: "TOTAL", ...sumRows(detailedProduction, ["produced_cartons", "produced_pairs"]) },
    }),
    "Production Runs"
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `production-vs-orders-${safeFilenamePart(report.selection?.label)}-${date}.xlsx`;
  XLSX.writeFile(workbook, filename, { cellStyles: true, cellDates: true });
  return filename;
}
