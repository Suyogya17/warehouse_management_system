import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, TextAreaInput, TextInput } from "../components/Field";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";
import Select from "react-select";

const emptyWarehouseForm = { name: "" };
const emptyAdjustForm = {
  finished_good_id: "",
  warehouse_id: "",
  quantity: "",
  movement_type: "ADJUSTMENT_IN",
  notes: "",
};
const emptyTransferForm = {
  finished_good_id: "",
  from_warehouse_id: "",
  to_warehouse_id: "",
  quantity: "",
  notes: "",
};
const emptyTransferReportFilters = {
  search: "",
  from_warehouse_id: "",
  to_warehouse_id: "",
  date_from: "",
  date_to: "",
};

const selectStyles = {
  control: (base) => ({
    ...base,
    minHeight: "44px",
    borderRadius: "12px",
    borderColor: "#d1d5db",
    boxShadow: "none",
    fontSize: "14px",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

const escapeExcelCell = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const noScroll = (e) => e.target.blur();
const transferPairWindowMs = 60 * 1000;

const getMovementTime = (movement) => {
  const time = new Date(movement.created_at || "").getTime();
  return Number.isFinite(time) ? time : 0;
};

const sameMovementValue = (left, right, key) => String(left?.[key] ?? "") === String(right?.[key] ?? "");

const getCartons = (quantity, item) => {
  const pairs = Number(quantity || 0);
  const pairsPerCarton = Number(item.inner_boxes_per_outer_box || 0);

  return pairsPerCarton > 0 ? Math.floor(pairs / pairsPerCarton) : 0;
};

export default function WareHousePage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManage = ["ADMIN", "CO_ADMIN"].includes(user?.role);

  const [search, setSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [transferReportFilters, setTransferReportFilters] = useState(emptyTransferReportFilters);
  const [warehouses, setWarehouses] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouseForm);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);

  const activeWarehouses = useMemo(
    () => warehouses.filter((item) => Number(item.is_active) === 1 && !item.deleted_at),
    [warehouses]
  );

  const load = useCallback(async () => {
    const [warehouseResult, finishedResult, stockResult, movementResult] = await Promise.all([
      api.getWarehouses(token, true),
      api.getFinishedGoods(token),
      api.getWarehouseStock(token, search),
      api.getWarehouseMovements(token, { limit: 10000, include_total: 0 }),
    ]);

    setWarehouses(warehouseResult.data || []);
    setFinishedGoods(finishedResult.data || []);
    setStockRows((stockResult.data || []).filter((row) => Number(row.quantity) > 0));
    setMovements(movementResult.data || []);
  }, [search, token]);

  useEffect(() => {
    load().catch((err) => {
      showToast({
        tone: "error",
        title: "Warehouse data failed",
        message: err.message,
      });
    });
  }, [load, showToast]);

  // Merge TRANSFER_IN / TRANSFER_OUT pairs into a single row
  const mergedMovements = useMemo(() => {
    const out = [];
    const seen = new Set();

    for (const m of movements) {
      if (seen.has(m.id)) continue;

      if (m.movement_type === "TRANSFER_OUT" || m.movement_type === "TRANSFER_IN") {
        const partnerType =
          m.movement_type === "TRANSFER_OUT" ? "TRANSFER_IN" : "TRANSFER_OUT";

        const partner = movements.find((p) => {
          if (p.id === m.id || seen.has(p.id) || p.movement_type !== partnerType) return false;
          if (!sameMovementValue(p, m, "finished_good_id")) return false;
          if (Number(p.quantity || 0) !== Number(m.quantity || 0)) return false;
          if (!sameMovementValue(p, m, "created_by")) return false;
          if (!sameMovementValue(p, m, "notes")) return false;

          if (
            m.reference_type === "transfer" &&
            p.reference_type === "transfer" &&
            m.reference_id &&
            p.reference_id &&
            String(m.reference_id) === String(p.reference_id)
          ) {
            return true;
          }

          return Math.abs(getMovementTime(p) - getMovementTime(m)) <= transferPairWindowMs;
        });

        if (partner) {
          const outRow = m.movement_type === "TRANSFER_OUT" ? m : partner;
          const inRow = m.movement_type === "TRANSFER_IN" ? m : partner;
          seen.add(m.id);
          seen.add(partner.id);
          out.push({
            ...m,
            movement_type: "TRANSFER",
            from_warehouse_id: outRow.warehouse_id,
            from_warehouse_name: outRow.warehouse_name,
            to_warehouse_id: inRow.warehouse_id,
            to_warehouse_name: inRow.warehouse_name,
            _merged: true,
          });
          continue;
        }
      }

      seen.add(m.id);
      out.push(m);
    }

    return out;
  }, [movements]);

  // Filter merged movements by search query
  const filteredMovements = useMemo(() => {
    if (!movementSearch.trim()) return mergedMovements;
    const q = movementSearch.toLowerCase();
    return mergedMovements.filter((row) => {
      const warehouse = row._merged
        ? `${row.from_warehouse_name ?? ""} ${row.to_warehouse_name ?? ""}`.toLowerCase()
        : (row.warehouse_name ?? "").toLowerCase();
      return (
        (row.product_name ?? "").toLowerCase().includes(q) ||
        (row.movement_type ?? "").toLowerCase().includes(q) ||
        (row.created_by_name ?? "").toLowerCase().includes(q) ||
        warehouse.includes(q) ||
        (row.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [mergedMovements, movementSearch]);

  const transferReportRows = useMemo(() => {
    const q = transferReportFilters.search.trim().toLowerCase();
    const fromDate = transferReportFilters.date_from
      ? new Date(`${transferReportFilters.date_from}T00:00:00`)
      : null;
    const toDate = transferReportFilters.date_to
      ? new Date(`${transferReportFilters.date_to}T23:59:59`)
      : null;

    return mergedMovements.filter((row) => {
      if (row.movement_type !== "TRANSFER" || !row._merged) return false;

      if (
        transferReportFilters.from_warehouse_id &&
        String(row.from_warehouse_id || "") !== String(transferReportFilters.from_warehouse_id)
      ) {
        return false;
      }

      if (
        transferReportFilters.to_warehouse_id &&
        String(row.to_warehouse_id || "") !== String(transferReportFilters.to_warehouse_id)
      ) {
        return false;
      }

      const createdAt = row.created_at ? new Date(row.created_at) : null;
      if (fromDate && createdAt && createdAt < fromDate) return false;
      if (toDate && createdAt && createdAt > toDate) return false;

      if (!q) return true;

      return (
        (row.product_name ?? "").toLowerCase().includes(q) ||
        (row.article_code ?? "").toLowerCase().includes(q) ||
        (row.color ?? "").toLowerCase().includes(q) ||
        (row.from_warehouse_name ?? "").toLowerCase().includes(q) ||
        (row.to_warehouse_name ?? "").toLowerCase().includes(q) ||
        (row.created_by_name ?? "").toLowerCase().includes(q) ||
        (row.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [mergedMovements, transferReportFilters]);

  const saveWarehouse = async (event) => {
    event.preventDefault();

    try {
      if (editingWarehouse) {
        await api.updateWarehouse(editingWarehouse.id, warehouseForm, token);
        showToast({ tone: "success", title: "Warehouse updated" });
      } else {
        await api.createWarehouse(warehouseForm, token);
        showToast({ tone: "success", title: "Warehouse created" });
      }

      setWarehouseForm(emptyWarehouseForm);
      setEditingWarehouse(null);
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Save failed", message: err.message });
    }
  };

  const startEditWarehouse = (warehouse) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({ name: warehouse.name || "" });
  };

  const deactivateWarehouse = async (warehouse) => {
    try {
      await api.deleteWarehouse(warehouse.id, token);
      showToast({ tone: "success", title: "Warehouse deactivated" });
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Deactivate failed", message: err.message });
    }
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();

    try {
      await api.adjustWarehouseStock(
        {
          ...adjustForm,
          finished_good_id: Number(adjustForm.finished_good_id),
          warehouse_id: Number(adjustForm.warehouse_id),
          quantity: Number(adjustForm.quantity),
        },
        token
      );

      showToast({ tone: "success", title: "Stock adjusted" });
      setAdjustForm(emptyAdjustForm);
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Adjustment failed", message: err.message });
    }
  };

  const submitTransfer = async (event) => {
    event.preventDefault();

    try {
      await api.transferWarehouseStock(
        {
          ...transferForm,
          finished_good_id: Number(transferForm.finished_good_id),
          from_warehouse_id: Number(transferForm.from_warehouse_id),
          to_warehouse_id: Number(transferForm.to_warehouse_id),
          quantity: Number(transferForm.quantity),
        },
        token
      );

      showToast({ tone: "success", title: "Stock transferred" });
      setTransferForm(emptyTransferForm);
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Transfer failed", message: err.message });
    }
  };

  const productOptions = finishedGoods.map((item) => ({
    value: String(item.id),
    label: `${item.name}${item.article_code ? ` (${item.article_code})` : ""}`,
  }));

  const warehouseOptions = activeWarehouses.map((item) => ({
    value: String(item.id),
    label: item.name,
  }));

  const movementTypeOptions = [
    { value: "ADJUSTMENT_IN", label: "Add stock" },
    { value: "ADJUSTMENT_OUT", label: "Remove stock" },
  ];

  const findOption = (options, value) =>
    options.find((option) => option.value === String(value)) || null;

  const selectedTransferStock = useMemo(() => {
    if (!transferForm.finished_good_id || !transferForm.from_warehouse_id) {
      return null;
    }

    return stockRows.find(
      (row) =>
        String(row.finished_good_id) === String(transferForm.finished_good_id) &&
        String(row.warehouse_id) === String(transferForm.from_warehouse_id)
    );
  }, [stockRows, transferForm.finished_good_id, transferForm.from_warehouse_id]);

  const exportWarehouseStock = () => {
    if (!stockRows.length) {
      showToast({
        tone: "error",
        title: "Nothing to export",
        message: "No warehouse stock rows are available for the current filter.",
      });
      return;
    }

    const columns = [
      ["Product", "product_name"],
      ["Article", "article_code"],
      ["Color", "color"],
      ["Size", "size"],
      ["Warehouse", "warehouse_name"],
      ["Qty", "quantity"],
      ["CTN", "ctn"],
      ["Unit", "unit"],
      ["Total Stock", "total_product_quantity"],
      ["Updated By", "updated_by_name"],
      ["Updated At", "updated_at"],
    ];

    const headerHtml = columns
      .map(([label]) => `<th>${escapeExcelCell(label)}</th>`)
      .join("");
    const rowsHtml = stockRows
      .map((row) => {
        const cells = columns
          .map(([, key]) => {
            const value =
              key === "updated_at"
                ? formatDate(row[key])
                : key === "ctn"
                ? getCartons(row.quantity, row)
                : row[key];
            return `<td>${escapeExcelCell(value)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const workbookHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            table { border-collapse: collapse; }
            th, td { border: 1px solid #d9d9d9; padding: 6px; }
            th { background: #f3f4f6; font-weight: 700; }
          </style>
        </head>
        <body>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([workbookHtml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `warehouse-stock-${today}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast({
      tone: "success",
      title: "Excel exported",
      message: `${stockRows.length} warehouse stock row${stockRows.length === 1 ? "" : "s"} exported.`,
    });
  };

  const exportTransferReport = () => {
    if (!transferReportRows.length) {
      showToast({
        tone: "error",
        title: "Nothing to export",
        message: "No warehouse transfer rows match the current report filters.",
      });
      return;
    }

    const columns = [
      ["Date", "created_at"],
      ["Product", "product_name"],
      ["Article", "article_code"],
      ["Color", "color"],
      ["From Warehouse", "from_warehouse_name"],
      ["To Warehouse", "to_warehouse_name"],
      ["Quantity", "quantity"],
      ["Unit", "unit"],
      ["Transferred By", "created_by_name"],
      ["Notes", "notes"],
    ];

    const headerHtml = columns.map(([label]) => `<th>${escapeExcelCell(label)}</th>`).join("");
    const rowsHtml = transferReportRows
      .map((row) => {
        const cells = columns
          .map(([, key]) => {
            const value = key === "created_at" ? formatDate(row.created_at) : row[key];
            return `<td>${escapeExcelCell(value)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const workbookHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            table { border-collapse: collapse; }
            th, td { border: 1px solid #d9d9d9; padding: 6px; }
            th { background: #f3f4f6; font-weight: 700; }
          </style>
        </head>
        <body>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([workbookHtml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `warehouse-transfer-report-${today}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast({
      tone: "success",
      title: "Transfer report exported",
      message: `${transferReportRows.length} transfer row${transferReportRows.length === 1 ? "" : "s"} exported.`,
    });
  };

  const totalWarehouseStock = stockRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalWarehouseCartons = stockRows.reduce((sum, row) => sum + getCartons(row.quantity, row), 0);
  const transferReportTotalQty = transferReportRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Warehouse stock"
        subtitle="Find each product location and quantity by warehouse."
        icon="stock"
      >
        <div className="space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Field label="Search product or warehouse">
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ABC, article code, color, size, or warehouse..."
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" icon="download" onClick={exportWarehouseStock}>
                Export Excel
              </Button>
              <Button variant="secondary" icon="stock" onClick={load}>
                Refresh
              </Button>
            </div>
          </div>

          <DataTable
            columns={[
              { key: "product_name", label: "Product" },
              { key: "article_code", label: "Article" },
              { key: "color", label: "Color" },
              { key: "size", label: "Size" },
              { key: "warehouse_name", label: "Warehouse" },
              {
                key: "quantity",
                label: "Qty",
                render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
              },
              {
                key: "ctn",
                label: "CTN",
                render: (row) => formatNumber(getCartons(row.quantity, row)),
              },
              {
                key: "total_product_quantity",
                label: "Total Stock",
                render: (row) => `${formatNumber(row.total_product_quantity)} ${row.unit || "pairs"}`,
              },
              { key: "updated_by_name", label: "Updated By" },
            ]}
            rows={stockRows}
            showToolbar={false}
            emptyTitle="No warehouse stock found"
            emptyDescription="Run the SQL migration first, then add stock through production or manual adjustment."
          />
          <div className="mt-3 flex justify-center px-2 pb-2">
            <span className="text-sm text-slate-500">
              Total stock:{" "}
              <span className="font-medium text-green-700">{formatNumber(totalWarehouseStock)}</span>
            </span>
            <span className="ml-6 text-sm text-slate-500">
              CTN:{" "}
              <span className="font-medium text-green-700">{formatNumber(totalWarehouseCartons)}</span>
            </span>
          </div>
        </div>
      </SectionCard>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title={editingWarehouse ? "Edit warehouse" : "Create warehouse"}
            subtitle="Add physical locations where finished goods are kept."
            icon="box"
          >
            <div className="space-y-5 border-t border-slate-100 p-5">
              <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={saveWarehouse}>
                <Field label="Warehouse name">
                  <TextInput
                    value={warehouseForm.name}
                    onChange={(event) =>
                      setWarehouseForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Main warehouse, Store room, Branch A..."
                    required
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="submit" icon={editingWarehouse ? "check" : "plus"}>
                    {editingWarehouse ? "Update" : "Create"}
                  </Button>
                  {editingWarehouse ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditingWarehouse(null);
                        setWarehouseForm(emptyWarehouseForm);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>

              <DataTable
                columns={[
                  { key: "name", label: "Warehouse" },
                  {
                    key: "is_active",
                    label: "Status",
                    render: (row) => (Number(row.is_active) === 1 ? "Active" : "Inactive"),
                  },
                  { key: "created_by_name", label: "Created By" },
                  {
                    key: "actions",
                    label: "Actions",
                    render: (row) => (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" icon="edit" onClick={() => startEditWarehouse(row)}>
                          Edit
                        </Button>
                        {Number(row.is_active) === 1 ? (
                          <Button size="sm" variant="danger" icon="delete" onClick={() => deactivateWarehouse(row)}>
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                rows={warehouses}
                showToolbar={false}
                emptyTitle="No warehouses"
                emptyDescription="Create your first warehouse to start tracking product locations."
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Manual adjustment"
            subtitle="Use this for correction, opening balance, damaged stock, or physical stock count differences."
            icon="edit"
          >
            <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={submitAdjustment}>
              <Field label="Product">
                <Select
                  options={productOptions}
                  value={findOption(productOptions, adjustForm.finished_good_id)}
                  onChange={(selected) =>
                    setAdjustForm((current) => ({ ...current, finished_good_id: selected?.value || "" }))
                  }
                  placeholder="Search product..."
                  isClearable
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={selectStyles}
                />
              </Field>
              <Field label="Warehouse">
                <Select
                  options={warehouseOptions}
                  value={findOption(warehouseOptions, adjustForm.warehouse_id)}
                  onChange={(selected) =>
                    setAdjustForm((current) => ({ ...current, warehouse_id: selected?.value || "" }))
                  }
                  placeholder="Search warehouse..."
                  isClearable
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={selectStyles}
                />
              </Field>
              <Field label="Type">
                <Select
                  options={movementTypeOptions}
                  value={findOption(movementTypeOptions, adjustForm.movement_type)}
                  onChange={(selected) =>
                    setAdjustForm((current) => ({ ...current, movement_type: selected?.value || "ADJUSTMENT_IN" }))
                  }
                  placeholder="Select type..."
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={selectStyles}
                />
              </Field>
              <Field label="Quantity">
                <TextInput
                  type="number"
                  min="1"
                  step="0.01"
                  value={adjustForm.quantity}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, quantity: event.target.value }))}
                  onWheel={noScroll}
                  required
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Reason">
                  <TextAreaInput
                    value={adjustForm.notes}
                    onChange={(event) => setAdjustForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Opening balance, damaged stock, counting correction..."
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" icon="check">
                  Save adjustment
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {canManage ? (
        <SectionCard
          title="Transfer stock"
          subtitle="Move finished goods from one warehouse to another without changing total product stock."
          icon="arrowRight"
        >
          <form className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5" onSubmit={submitTransfer}>
            <Field label="Product">
              <Select
                options={productOptions}
                value={findOption(productOptions, transferForm.finished_good_id)}
                onChange={(selected) =>
                  setTransferForm((current) => ({ ...current, finished_good_id: selected?.value || "" }))
                }
                placeholder="Search product..."
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
            </Field>
            <Field label="From">
              <Select
                options={warehouseOptions}
                value={findOption(warehouseOptions, transferForm.from_warehouse_id)}
                onChange={(selected) =>
                  setTransferForm((current) => ({ ...current, from_warehouse_id: selected?.value || "" }))
                }
                placeholder="Source warehouse..."
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
            </Field>
            <Field label="To">
              <Select
                options={warehouseOptions}
                value={findOption(warehouseOptions, transferForm.to_warehouse_id)}
                onChange={(selected) =>
                  setTransferForm((current) => ({ ...current, to_warehouse_id: selected?.value || "" }))
                }
                placeholder="Destination warehouse..."
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
            </Field>
            <Field label="Quantity">
              <TextInput
                type="number"
                min="1"
                step="0.01"
                value={transferForm.quantity}
                onChange={(event) => setTransferForm((current) => ({ ...current, quantity: event.target.value }))}
                onWheel={noScroll}
                required
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={transferForm.notes}
                onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>

            {selectedTransferStock && (
              <div className="text-sm text-slate-600 -mt-2">
                Available stock:{" "}
                <span className="font-semibold text-slate-900">
                  {formatNumber(selectedTransferStock.quantity)}{" "}
                  {selectedTransferStock.unit || "pairs"}
                </span>
              </div>
            )}

            <div className="md:col-span-2 xl:col-span-5">
              <Button type="submit" icon="arrowRight">
                Transfer stock
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Warehouse to warehouse report"
        subtitle="Track transfers from one warehouse to another by product, date, and user."
        icon="ledger"
      >
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_160px_160px_auto]">
            <Field label="Search transfer">
              <TextInput
                value={transferReportFilters.search}
                onChange={(event) =>
                  setTransferReportFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Product, article, warehouse, by, notes..."
              />
            </Field>
            <Field label="From warehouse">
              <Select
                options={warehouseOptions}
                value={findOption(warehouseOptions, transferReportFilters.from_warehouse_id)}
                onChange={(selected) =>
                  setTransferReportFilters((current) => ({ ...current, from_warehouse_id: selected?.value || "" }))
                }
                placeholder="Any source..."
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
            </Field>
            <Field label="To warehouse">
              <Select
                options={warehouseOptions}
                value={findOption(warehouseOptions, transferReportFilters.to_warehouse_id)}
                onChange={(selected) =>
                  setTransferReportFilters((current) => ({ ...current, to_warehouse_id: selected?.value || "" }))
                }
                placeholder="Any destination..."
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
            </Field>
            <Field label="From date">
              <TextInput
                type="date"
                value={transferReportFilters.date_from}
                onChange={(event) =>
                  setTransferReportFilters((current) => ({ ...current, date_from: event.target.value }))
                }
              />
            </Field>
            <Field label="To date">
              <TextInput
                type="date"
                value={transferReportFilters.date_to}
                onChange={(event) =>
                  setTransferReportFilters((current) => ({ ...current, date_to: event.target.value }))
                }
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button variant="secondary" icon="download" onClick={exportTransferReport}>
                Export
              </Button>
              <Button
                variant="ghost"
                onClick={() => setTransferReportFilters(emptyTransferReportFilters)}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span>
              Transfers: <span className="font-semibold text-slate-900">{formatNumber(transferReportRows.length)}</span>
            </span>
            <span>
              Total quantity: <span className="font-semibold text-slate-900">{formatNumber(transferReportTotalQty)}</span>
            </span>
          </div>

          <DataTable
            columns={[
              { key: "created_at", label: "Date", render: (row) => formatDate(row.created_at) },
              { key: "product_name", label: "Product" },
              { key: "article_code", label: "Article" },
              { key: "color", label: "Color" },
              { key: "from_warehouse_name", label: "From" },
              { key: "to_warehouse_name", label: "To" },
              {
                key: "quantity",
                label: "Qty",
                render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
              },
              { key: "created_by_name", label: "By" },
              { key: "notes", label: "Notes" },
            ]}
            rows={transferReportRows}
            showToolbar={false}
            emptyTitle="No warehouse transfers found"
            emptyDescription="Transfer stock between warehouses to build this report."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Movement history"
        subtitle="Every warehouse add, remove, transfer, and production entry."
        icon="ledger"
      >
        <div className="p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Field label="Search movements">
              <TextInput
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                placeholder="Search by product, type, created by, warehouse, or notes..."
              />
            </Field>
            {movementSearch && (
              <Button variant="secondary" onClick={() => setMovementSearch("")}>
                Clear
              </Button>
            )}
          </div>

          {movementSearch && (
            <p className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-medium text-slate-700">{filteredMovements.length}</span>{" "}
              of {mergedMovements.length} movements
            </p>
          )}

          <DataTable
            columns={[
              { key: "created_at", label: "Date", render: (row) => formatDate(row.created_at) },
              { key: "product_name", label: "Product" },
              {
                key: "warehouse_name",
                label: "Warehouse",
                render: (row) =>
                  row._merged
                    ? `${row.from_warehouse_name} → ${row.to_warehouse_name}`
                    : row.warehouse_name,
              },
              { key: "movement_type", label: "Type" },
              {
                key: "quantity",
                label: "Qty",
                render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
              },
              { key: "created_by_name", label: "By" },
              { key: "notes", label: "Notes" },
            ]}
            rows={filteredMovements}
            showToolbar={false}
            emptyTitle="No movements found"
            emptyDescription={
              movementSearch
                ? "No movements match your search. Try a different term."
                : "Warehouse changes will appear here after production, adjustment, or transfer."
            }
          />
        </div>
      </SectionCard>
    </div>
  );
}
