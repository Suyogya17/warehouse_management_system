import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

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

export default function WareHousePage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManage = ["ADMIN", "CO_ADMIN"].includes(user?.role);

  const [search, setSearch] = useState("");
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
      api.getWarehouseMovements(token, { limit: 100 }),
    ]);

    setWarehouses(warehouseResult.data || []);
    setFinishedGoods(finishedResult.data || []);
    setStockRows(stockResult.data || []);
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

  const productOptions = finishedGoods.map((item) => (
    <option key={item.id} value={item.id}>
      {item.name} {item.article_code ? `(${item.article_code})` : ""}
    </option>
  ));

  const warehouseOptions = activeWarehouses.map((item) => (
    <option key={item.id} value={item.id}>
      {item.name}
    </option>
  ));

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
            <Button variant="secondary" icon="stock" onClick={load}>
              Refresh
            </Button>
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
                key: "total_product_quantity",
                label: "Total Stock",
                render: (row) => `${formatNumber(row.total_product_quantity)} ${row.unit || "pairs"}`,
              },
              { key: "updated_by_name", label: "Updated By" },
            ]}
            rows={stockRows}
            emptyTitle="No warehouse stock found"
            emptyDescription="Run the SQL migration first, then add stock through production or manual adjustment."
          />
        </div>
      </SectionCard>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title={editingWarehouse ? "Edit warehouse" : "Create warehouse"}
            subtitle="Add physical locations where finished goods are kept."
            icon="box"
          >
            <form className="space-y-4 p-5" onSubmit={saveWarehouse}>
              <Field label="Warehouse name">
                <TextInput
                  value={warehouseForm.name}
                  onChange={(event) => setWarehouseForm({ name: event.target.value })}
                  placeholder="Warehouse 1"
                  required
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" icon="check">
                  {editingWarehouse ? "Save warehouse" : "Create warehouse"}
                </Button>
                {editingWarehouse ? (
                  <Button
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

            <div className="border-t border-slate-100 p-5">
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
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                rows={warehouses}
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
                <SelectInput
                  value={adjustForm.finished_good_id}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, finished_good_id: event.target.value }))}
                  required
                >
                  <option value="">Select product</option>
                  {productOptions}
                </SelectInput>
              </Field>
              <Field label="Warehouse">
                <SelectInput
                  value={adjustForm.warehouse_id}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, warehouse_id: event.target.value }))}
                  required
                >
                  <option value="">Select warehouse</option>
                  {warehouseOptions}
                </SelectInput>
              </Field>
              <Field label="Type">
                <SelectInput
                  value={adjustForm.movement_type}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, movement_type: event.target.value }))}
                >
                  <option value="ADJUSTMENT_IN">Add stock</option>
                  <option value="ADJUSTMENT_OUT">Remove stock</option>
                </SelectInput>
              </Field>
              <Field label="Quantity">
                <TextInput
                  type="number"
                  min="1"
                  step="0.01"
                  value={adjustForm.quantity}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, quantity: event.target.value }))}
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
              <SelectInput
                value={transferForm.finished_good_id}
                onChange={(event) => setTransferForm((current) => ({ ...current, finished_good_id: event.target.value }))}
                required
              >
                <option value="">Select product</option>
                {productOptions}
              </SelectInput>
            </Field>
            <Field label="From">
              <SelectInput
                value={transferForm.from_warehouse_id}
                onChange={(event) => setTransferForm((current) => ({ ...current, from_warehouse_id: event.target.value }))}
                required
              >
                <option value="">Source warehouse</option>
                {warehouseOptions}
              </SelectInput>
            </Field>
            <Field label="To">
              <SelectInput
                value={transferForm.to_warehouse_id}
                onChange={(event) => setTransferForm((current) => ({ ...current, to_warehouse_id: event.target.value }))}
                required
              >
                <option value="">Destination warehouse</option>
                {warehouseOptions}
              </SelectInput>
            </Field>
            <Field label="Quantity">
              <TextInput
                type="number"
                min="1"
                step="0.01"
                value={transferForm.quantity}
                onChange={(event) => setTransferForm((current) => ({ ...current, quantity: event.target.value }))}
                required
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={transferForm.notes}
                onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>
            <div className="md:col-span-2 xl:col-span-5">
              <Button type="submit" icon="arrowRight">
                Transfer stock
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Movement history"
        subtitle="Every warehouse add, remove, transfer, and production entry."
        icon="ledger"
      >
        <div className="p-5">
          <DataTable
            columns={[
              { key: "created_at", label: "Date", type: "date", render: (row) => formatDate(row.created_at) },
              { key: "product_name", label: "Product" },
              { key: "warehouse_name", label: "Warehouse" },
              { key: "movement_type", label: "Type" },
              {
                key: "quantity",
                label: "Qty",
                render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
              },
              { key: "created_by_name", label: "By" },
              { key: "notes", label: "Notes" },
            ]}
            rows={movements}
            emptyTitle="No movement history"
            emptyDescription="Warehouse changes will appear here after production, adjustment, or transfer."
          />
        </div>
      </SectionCard>
    </div>
  );
}
