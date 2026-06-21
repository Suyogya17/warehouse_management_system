import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import SectionCard from "../components/SectionCard";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";
  import Select from "react-select";

const selectStyles = {
  control: (base) => ({
    ...base,
    minHeight: "44px",
    borderRadius: "12px",
    borderColor: "#d1d5db",
    boxShadow: "none",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

export default function ReceiveStockPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedFinishedHistoryId, setSelectedFinishedHistoryId] = useState("");
  const [batches, setBatches] = useState([]);
  const [finishedPurchaseHistory, setFinishedPurchaseHistory] = useState([]);
  const [form, setForm] = useState({ raw_material_id: "", qty_added: "", notes: "" });
  const [finishedForm, setFinishedForm] = useState({
    finished_good_id: "",
    warehouse_id: "",
    qty_added: "",
    notes: "",
  });
  const selectedMaterial = materials.find((item) => String(item.id) === String(form.raw_material_id));
  const selectedFinishedGood = finishedGoods.find((item) => String(item.id) === String(finishedForm.finished_good_id));
  const selectedWarehouse = warehouses.find((item) => String(item.id) === String(finishedForm.warehouse_id));
  const selectedWarehouseStockRows = warehouseStock.filter(
    (item) => String(item.finished_good_id) === String(finishedForm.finished_good_id)
  );
  const selectedWarehouseStock = selectedWarehouseStockRows.find(
    (item) => String(item.warehouse_id) === String(finishedForm.warehouse_id)
  );
  const selectedWarehouseTotal = selectedWarehouseStockRows.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const finishedGoodsQtyToAdd = Number(finishedForm.qty_added || 0);
  const selectedProductStock = Number(selectedFinishedGood?.quantity || 0);
  const selectedWarehouseQty = Number(selectedWarehouseStock?.quantity || 0);
  const stockMismatch = selectedWarehouseTotal - selectedProductStock;

  const loadPurchaseData = useCallback(async () => {
    const [materialsResult, finishedGoodsResult, warehousesResult, warehouseStockResult] = await Promise.all([
      api.getRawMaterials(token),
      api.getFinishedGoods(token),
      api.getWarehouses(token),
      api.getWarehouseStock(token),
    ]);

    setMaterials(materialsResult.data || []);
    setFinishedGoods(finishedGoodsResult.data || []);
    setWarehouses(warehousesResult.data || []);
    setWarehouseStock(warehouseStockResult.data || []);
  }, [token]);

  const loadBatches = useCallback(async (materialId) => {
    if (!materialId) {
      setBatches([]);
      return;
    }

    const result = await api.getBatches(materialId, token);
    setBatches(result.data || []);
  }, [token]);

  const loadFinishedPurchaseHistory = useCallback(async (finishedGoodId) => {
    const result = await api.getWarehouseMovements(token, {
      finished_good_id: finishedGoodId || "",
      movement_type: "ADJUSTMENT_IN",
      limit: 100,
    });

    setFinishedPurchaseHistory(
      (result.data || []).filter((row) =>
        String(row.notes || "").toLowerCase().startsWith("finished goods purchase")
      )
    );
  }, [token]);

  useEffect(() => {
    loadPurchaseData().catch(console.error);
  }, [loadPurchaseData]);

  useEffect(() => {
    loadBatches(selectedId).catch(console.error);
  }, [loadBatches, selectedId]);

  useEffect(() => {
    loadFinishedPurchaseHistory(selectedFinishedHistoryId).catch(console.error);
  }, [loadFinishedPurchaseHistory, selectedFinishedHistoryId]);

  useDataRefresh(loadPurchaseData, "receive-stock");

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.receiveStock(
        {
          raw_material_id: Number(form.raw_material_id),
          qty_added: Number(form.qty_added),
          notes: form.notes,
        },
        token
      );
      const materialId = form.raw_material_id;
      setSelectedId(materialId);
      await loadPurchaseData();
      await loadBatches(materialId);
      announceDataRefresh("receive-stock");
      showToast({ tone: "success", title: "Stock received", message: "Material stock and batch history were refreshed." });
      setForm({ raw_material_id: "", qty_added: "", notes: "" });
    } catch (error) {
      showToast({ tone: "error", title: "Receive stock failed", message: error.message });
    }
  };

  const submitFinishedGoodsPurchase = async (event) => {
    event.preventDefault();

    try {
      await api.adjustWarehouseStock(
        {
          finished_good_id: Number(finishedForm.finished_good_id),
          warehouse_id: Number(finishedForm.warehouse_id),
          quantity: Number(finishedForm.qty_added),
          movement_type: "ADJUSTMENT_IN",
          notes: finishedForm.notes
            ? `Finished goods purchase: ${finishedForm.notes}`
            : "Finished goods purchase",
        },
        token
      );

      const finishedGoodId = finishedForm.finished_good_id;
      setSelectedFinishedHistoryId(finishedGoodId);
      await loadPurchaseData();
      await loadFinishedPurchaseHistory(finishedGoodId);
      announceDataRefresh("receive-stock");
      announceDataRefresh("stock");
      showToast({
        tone: "success",
        title: "Finished goods received",
        message: "Finished goods stock and warehouse quantity were updated.",
      });
      setFinishedForm({ finished_good_id: "", warehouse_id: "", qty_added: "", notes: "" });
    } catch (error) {
      showToast({ tone: "error", title: "Finished goods purchase failed", message: error.message });
    }
  };

  const materialOptions = materials.map((item) => ({
    value: String(item.id),
    label: `${item.name} (${item.article_code})`,
  }));

  const finishedGoodOptions = finishedGoods.map((item) => ({
    value: String(item.id),
    label: `${item.name}${item.article_code ? ` (${item.article_code})` : ""}`,
  }));

  const warehouseOptions = warehouses
    .filter((item) => Number(item.is_active) === 1 && !item.deleted_at)
    .map((item) => ({
      value: String(item.id),
      label: item.name,
    }));

  const findOption = (options, value) =>
    options.find((option) => option.value === String(value)) || null;

  return (
    <div className="space-y-6">
      {/* <PageHeader
        eyebrow="Inbound stock"
        title="Purchase and receive stock"
        description="Capture incoming batches with quantities, notes, and material context to preserve FIFO stock accuracy."
        icon="purchase"
      /> */}

      <SectionCard title="Purchase and receive stock" subtitle="Record cartons of uppers, kg of sole compounds, finished soles, and packing materials." icon="purchase">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <Field label="Raw material">
           <Select
  options={materialOptions}

  value={findOption(materialOptions, form.raw_material_id)}

  onChange={(selected) =>
    setForm((current) => ({
      ...current,
      raw_material_id: selected?.value || "",
    }))
  }

  placeholder="Search material..."
  isClearable
  isSearchable
  className="text-sm"

  menuPortalTarget={document.body}
  menuPosition="fixed"

  styles={selectStyles}
/>
          </Field>
          <Field label="Quantity added">
            <TextInput
              type="number"
              min="1"
              value={form.qty_added}
              onChange={(event) => setForm((current) => ({ ...current, qty_added: event.target.value }))}
              required
            />
          </Field>
          <div className="xl:col-span-2">
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Supplier, invoice, or delivery note"
            />
          </Field>
          </div>
          {selectedMaterial ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
              <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
                <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white">
                  {selectedMaterial.image_url ? (
                    <img
                      src={`${APP_BASE_URL}${selectedMaterial.image_url}`}
                      alt={selectedMaterial.name}
                      className="h-[120px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[120px] items-center justify-center text-sm text-slate-500">
                      No image
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected material</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedMaterial.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Article code: <span className="font-medium text-slate-900">{selectedMaterial.article_code}</span>
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Category</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{selectedMaterial.category || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Color</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{selectedMaterial.color || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current stock</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {formatNumber(selectedMaterial.quantity)} {selectedMaterial.unit}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Receive in</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{selectedMaterial.unit}</p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600">
                    Receiving for <span className="font-semibold text-slate-900">{selectedMaterial.name}</span>.
                    Enter the new purchase quantity in <span className="font-semibold text-slate-900">{selectedMaterial.unit}</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
            <Button type="submit" icon="plus">
              Receive stock
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Purchase finished goods"
        subtitle="Receive ready products directly into a warehouse and increase finished-goods physical stock."
        icon="finishedGoods"
      >
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitFinishedGoodsPurchase}>
          <Field label="Finished good">
            <Select
              options={finishedGoodOptions}
              value={findOption(finishedGoodOptions, finishedForm.finished_good_id)}
              onChange={(selected) =>
                setFinishedForm((current) => ({ ...current, finished_good_id: selected?.value || "" }))
              }
              placeholder="Search finished good..."
              isClearable
              isSearchable
              className="text-sm"
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={selectStyles}
            />
          </Field>

          <Field label="Warehouse">
            <Select
              options={warehouseOptions}
              value={findOption(warehouseOptions, finishedForm.warehouse_id)}
              onChange={(selected) =>
                setFinishedForm((current) => ({ ...current, warehouse_id: selected?.value || "" }))
              }
              placeholder="Search warehouse..."
              isClearable
              isSearchable
              className="text-sm"
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={selectStyles}
            />
          </Field>

          <Field label="Quantity added">
            <TextInput
              type="number"
              min="1"
              value={finishedForm.qty_added}
              onChange={(event) =>
                setFinishedForm((current) => ({ ...current, qty_added: event.target.value }))
              }
              required
            />
          </Field>

          <Field label="Notes">
            <TextInput
              value={finishedForm.notes}
              onChange={(event) =>
                setFinishedForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Supplier, invoice, or delivery note"
            />
          </Field>

          {selectedFinishedGood ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected product</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{selectedFinishedGood.name}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Article</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{selectedFinishedGood.article_code || "-"}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Product stock</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatNumber(selectedFinishedGood.quantity)} {selectedFinishedGood.unit || "pairs"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Warehouse total</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatNumber(selectedWarehouseTotal)} {selectedFinishedGood.unit || "pairs"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected warehouse</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {selectedWarehouseStock?.warehouse_name || selectedWarehouse?.name || "Choose warehouse"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Current: {formatNumber(selectedWarehouseQty)} {selectedFinishedGood.unit || "pairs"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">After receive</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    Product: {formatNumber(selectedProductStock + finishedGoodsQtyToAdd)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Warehouse total: {formatNumber(selectedWarehouseTotal + finishedGoodsQtyToAdd)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current difference</p>
                  <p className={`mt-1 text-sm font-semibold ${stockMismatch === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {stockMismatch === 0
                      ? "Product and warehouse match"
                      : `${stockMismatch > 0 ? "+" : ""}${formatNumber(stockMismatch)} pairs`}
                  </p>
                </div>
              </div>

              {stockMismatch !== 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This form adds new stock to both product stock and the selected warehouse. If you are trying to fix a mismatch, do not add the difference here because it will also increase warehouse stock.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
            <Button type="submit" icon="plus">
              Receive finished goods
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Purchase batch history" subtitle="Review stock batches for any raw material." icon="stock">
        <div className="mb-5 max-w-sm">
          {/* <SelectInput
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Choose a raw material to view its batches</option>
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.article_code})
              </option>
            ))}
          </SelectInput> */}

           <Select
      options={materialOptions}

      value={findOption(materialOptions, selectedId)}

      onChange={(selected) => setSelectedId(selected?.value || "")}

      placeholder="Choose a raw material to view its batches"

      isClearable
      isSearchable
      className="text-sm"

      menuPortalTarget={document.body}
      menuPosition="fixed"

      styles={selectStyles}
    />
        </div>

        <DataTable
          columns={[
            { key: "name", label: "Material" },
            { key: "qty_added", label: "Added", render: (row) => `${formatNumber(row.qty_added)} ${row.unit}` },
            { key: "qty_remaining", label: "Remaining", render: (row) => `${formatNumber(row.qty_remaining)} ${row.unit}` },
            { key: "notes", label: "Notes" },
            { key: "purchased_at", label: "Purchased At", render: (row) => formatDate(row.purchased_at) },
          ]}
          rows={batches}
        />
      </SectionCard>

      <SectionCard
        title="Finished goods purchase history"
        subtitle="Review ready-product purchases added directly into warehouses."
        icon="finishedGoods"
      >
        <div className="mb-5 max-w-sm">
          <Select
            options={finishedGoodOptions}
            value={findOption(finishedGoodOptions, selectedFinishedHistoryId)}
            onChange={(selected) => setSelectedFinishedHistoryId(selected?.value || "")}
            placeholder="Choose a finished good to view purchases"
            isClearable
            isSearchable
            className="text-sm"
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={selectStyles}
          />
        </div>

        <DataTable
          columns={[
            { key: "product_name", label: "Finished Good" },
            { key: "warehouse_name", label: "Warehouse" },
            {
              key: "quantity",
              label: "Added",
              render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
            },
            { key: "created_by_name", label: "Added By" },
            { key: "notes", label: "How Added" },
            { key: "created_at", label: "Added At", render: (row) => formatDate(row.created_at) },
          ]}
          rows={finishedPurchaseHistory}
          emptyTitle="No finished goods purchases"
          emptyDescription="Finished goods added from the purchase form will appear here."
        />
      </SectionCard>
    </div>
  );
}
