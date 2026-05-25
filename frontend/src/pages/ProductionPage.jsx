  import { useCallback, useEffect, useMemo, useState } from "react";
  import Button from "../components/Button";
  import SectionCard from "../components/SectionCard";
  import DataTable from "../components/DataTable";
  import EntitySummaryCard from "../components/EntitySummaryCard";
  import { Field, SelectInput, TextInput } from "../components/Field";
  import NextStepCard from "../components/NextStepCard";
  import PageHeader from "../components/PageHeader";
  import { useAuth } from "../context/AuthContext";
  import { useToast } from "../context/ToastContext";
  import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
  import { api } from "../services/api";
  import Select from "react-select";
  import { formatNumber } from "../utils/format";

  export default function ProductionPage() {
    const [search, setSearch] = useState("");
    const { token, user } = useAuth();
    const { showToast } = useToast();
    const canRun = ["ADMIN", "CO_ADMIN"].includes(user.role);
    const [formulas, setFormulas] = useState([]);
    const [history, setHistory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [checkResult, setCheckResult] = useState(null);
    const [nextStep, setNextStep] = useState(null);
    const [form, setForm] = useState({ formula_id: "", qty_to_produce: "", notes: "" });  
    const [warehouseAllocations, setWarehouseAllocations] = useState([{ warehouse_id: "", quantity: "" }]);
    const [editingHistory, setEditingHistory] = useState(null);
    const [deleteHistoryId, setDeleteHistoryId] = useState(null);

    const load = useCallback(async () => {
      const [formulasResult, historyResult, warehousesResult] = await Promise.all([
        api.getFormulas(token),
        api.getProductionHistory(token),
        api.getWarehouses(token),
      ]);
      setFormulas(formulasResult.data || []);
      setHistory(historyResult.data || []);
      setWarehouses(warehousesResult.data || []);
    }, [token]);

    useEffect(() => {
      load().catch(console.error);
    }, [load]);

    useDataRefresh(load, "production");

    const hasValidProductionInput = Number(form.formula_id) > 0 && Number(form.qty_to_produce) > 0;
    const isSplitWarehouseAllocation = warehouseAllocations.length > 1;
    const normalizedWarehouseAllocations = useMemo(
      () =>
        warehouseAllocations
          .map((item) => ({
            warehouse_id: Number(item.warehouse_id),
            quantity:
              warehouseAllocations.length === 1
                ? Number(form.qty_to_produce)
                : Number(item.quantity),
          }))
          .filter((item) => item.warehouse_id > 0 && item.quantity > 0),
      [form.qty_to_produce, warehouseAllocations]
    );
    const allocatedQty = normalizedWarehouseAllocations.reduce((sum, item) => sum + item.quantity, 0);
    const hasValidWarehouseAllocation =
      Number(form.qty_to_produce) > 0 &&
      normalizedWarehouseAllocations.length > 0 &&
      Math.abs(allocatedQty - Number(form.qty_to_produce)) < 0.001;


    const selectedFormula = formulas.find((item) => String(item.id) === String(form.formula_id));
    const canSubmitProduction =
      hasValidProductionInput &&
      checkResult?.can_produce &&
      Number(checkResult?.qty_to_produce) === Number(form.qty_to_produce) &&
      String(form.formula_id) === String(checkResult?.formula_id || form.formula_id) &&
      hasValidWarehouseAllocation;

    const updateWarehouseAllocation = (index, key, value) => {
      setWarehouseAllocations((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item))
      );
    };

    const addWarehouseAllocation = () => {
      setWarehouseAllocations((current) => [
        ...current.map((item, index) =>
          current.length === 1 && index === 0 && !item.quantity
            ? { ...item, quantity: form.qty_to_produce }
            : item
        ),
        { warehouse_id: "", quantity: "" },
      ]);
    };

    const removeWarehouseAllocation = (index) => {
      setWarehouseAllocations((current) => {
        const next = current.filter((_, itemIndex) => itemIndex !== index);
        return next.length ? next : [{ warehouse_id: "", quantity: "" }];
      });
    };

    const checkStock = async () => {
      if (!hasValidProductionInput) {
        showToast({ tone: "error", title: "Stock check needed", message: "Please select a formula and enter a quantity greater than 0." });
        setCheckResult(null);
        return;
      }

      try {
        const result = await api.checkProduction(
          {
            formula_id: Number(form.formula_id),
            qty_to_produce: Number(form.qty_to_produce),
          },
          token
        );
        setCheckResult({ ...result, formula_id: Number(form.formula_id) });
        showToast({
          tone: result.can_produce ? "success" : "error",
          title: result.can_produce ? "Stock is sufficient" : "Stock is short",
          message: result.can_produce ? "Stock is sufficient. You can run production now." : "Stock is short. Review the required materials below.",
        });
        setNextStep({
          description: result.can_produce
            ? "Stock is ready for this production run."
            : "Stock is not ready yet for this production run.",
          steps: result.can_produce
            ? [
                "Review the required quantities below one more time.",
                "Click Run production to convert raw materials into finished goods.",
                "After production, check Raw materials and Finished goods to confirm the new balances.",
              ]
            : [
                "Review which material is short in the stock check list.",
                "Add or receive more raw material stock before running production again.",
                "Run Check stock again after the stock is updated.",
              ],
        });
      } catch (err) {
        setCheckResult(null);
        showToast({ tone: "error", title: "Stock check failed", message: err.message });
      }
    };
    

    const runProduction = async (event) => {
      event.preventDefault();
      if (!hasValidProductionInput) {
        showToast({ tone: "error", title: "Production not ready", message: "Please select a formula and enter a quantity greater than 0." });
        return;
      }

      if (!canSubmitProduction) {
        showToast({
          tone: "error",
          title: hasValidWarehouseAllocation ? "Check stock first" : "Warehouse allocation needed",
          message: hasValidWarehouseAllocation
            ? "Run Check stock first, then run production while the checked quantity is still selected."
            : "Warehouse allocation total must equal the quantity you are producing.",
        });
        return;
      }

      try {
        const result = await api.runProduction(
          {
            formula_id: Number(form.formula_id),
            qty_to_produce: Number(form.qty_to_produce),
            notes: form.notes,
            warehouse_allocations: normalizedWarehouseAllocations,
          },
          token
        );
        showToast({ tone: "success", title: "Production complete", message: result.message });
        setCheckResult(null);
        setNextStep({
          description: "Production is complete and stock has been updated.",
          steps: [
            "Open Finished goods to confirm the produced quantity increased.",
            "Open Raw materials to confirm the upper and sole quantities decreased correctly.",
            "If this product is ready for users, use Finished goods to display or hide it.",
          ],
        });
        setForm({ formula_id: "", qty_to_produce: "", notes: "" });
        setWarehouseAllocations([{ warehouse_id: "", quantity: "" }]);
        await load();
        announceDataRefresh("production");
      } catch (err) {
        showToast({ tone: "error", title: "Production failed", message: err.message });
      }
    };

    const deleteBatch = async (id) => {
    try {
      await api.deleteStockBatch(id, token);
      showToast({ tone: "success", title: "Batch deleted" });
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Delete failed", message: err.message });
    }
  };

  const startEditHistory = (row) => {
  setEditingHistory({
    production_id: row.production_id,
    notes: row.notes || "",
  });
};

const saveHistoryEdit = async () => {
  try {
    await api.updateProductionHistory(
      editingHistory.production_id,
      {
        notes: editingHistory.notes,
      },
      token
    );

    showToast({
      tone: "success",
      title: "Production updated",
    });

    setEditingHistory(null);

    await load();
  } catch (err) {
    showToast({
      tone: "error",
      title: "Update failed",
      message: err.message,
    });
  }
};

const deleteHistory = async (id) => {
  try {
    await api.deleteProductionHistory(id, token);

    showToast({
      tone: "success",
      title: "Production deleted",
    });

    setDeleteHistoryId(null);

    await load();
  } catch (err) {
    showToast({
      tone: "error",
      title: "Delete failed",
      message: err.message,
    });
  }
};
const filteredHistory = history.filter((row) => {
  const term = search.toLowerCase();

  return (
    row.production_id?.toString().includes(term) ||
    row.formula_name?.toLowerCase().includes(term) ||
    row.finished_good_name?.toLowerCase().includes(term) ||
    row.warehouse_names?.toLowerCase().includes(term) ||
    row.produced_by_name?.toLowerCase().includes(term) ||
    row.status?.toLowerCase().includes(term)
  );
});

    return (
      <div className="space-y-6">
        {/* <PageHeader
          eyebrow="Execution"
          title="Production"
          description="Validate stock before production, execute conversion runs, and keep a clean operational history."
          icon="production"
        /> */}

        <NextStepCard
          description={nextStep?.description || "Production is the final conversion step. First check stock, then run production, and finally verify that raw materials decreased while finished goods increased."}
          steps={
            nextStep?.steps || [
              "Select a formula that already contains both the matching upper and sole.",
              "Enter the quantity to produce and click Check stock first.",
              "When stock is sufficient, run production and review the updated inventory.",
            ]
          }
        />

        {canRun ? (
          <SectionCard className="height-auto" title="Production run" subtitle="Check stock first, then convert uppers, soles, and compound materials into finished shoe pairs." icon="production">
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={runProduction}>
              <Field label="Formula">
              <Select
  options={formulas.map((item) => ({
    value: String(item.id),
    label: item.name,
  }))}

  value={
    formulas
      .map((item) => ({
        value: String(item.id),
        label: item.name,
      }))
      .find((opt) => opt.value === String(form.formula_id)) || null
  }

  onChange={(selected) => {
    const value = selected?.value || "";
    setForm((prev) => ({
      ...prev,
      formula_id: value,
    }));
    setCheckResult(null);
  }}

  placeholder="Search formula..."
  isClearable

  menuPortalTarget={document.body}
  menuPosition="fixed"

  styles={{
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
  }}
/>
              </Field>
              <Field label="Pairs to produce">
                <TextInput
                  type="number"
                  min="1"
                  value={form.qty_to_produce}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, qty_to_produce: event.target.value }));
                    setCheckResult(null);
                  }}
                  required
                />
              </Field>
              <div className="xl:col-span-2">
              <Field label="Notes">
                <TextInput
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </Field>
              </div>
              <div className="md:col-span-2 xl:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">Warehouse allocation</p>
                  {isSplitWarehouseAllocation ? (
                    <div className="text-sm font-semibold text-slate-700">
                      {formatNumber(allocatedQty)} / {formatNumber(form.qty_to_produce || 0)}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {warehouseAllocations.map((allocation, index) => (
                    <div
                      key={index}
                      className={`grid gap-2 ${isSplitWarehouseAllocation ? "md:grid-cols-[1fr_120px_auto]" : "md:grid-cols-[1fr_auto]"}`}
                    >
                      <Field label={index === 0 ? "Warehouse" : ""}>
                        <SelectInput
                          value={allocation.warehouse_id}
                          onChange={(event) => updateWarehouseAllocation(index, "warehouse_id", event.target.value)}
                          required
                        >
                          <option value="">Select warehouse</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      {isSplitWarehouseAllocation ? (
                        <Field label={index === 0 ? "Qty" : ""}>
                          <TextInput
                            type="number"
                            min="1"
                            step="0.01"
                            value={allocation.quantity}
                            onChange={(event) => updateWarehouseAllocation(index, "quantity", event.target.value)}
                            required
                          />
                        </Field>
                      ) : null}
                      <div className={index === 0 ? "flex items-end" : "flex items-center"}>
                        {isSplitWarehouseAllocation ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            icon="delete"
                            onClick={() => removeWarehouseAllocation(index)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button type="button" size="sm" variant="secondary" icon="plus" onClick={addWarehouseAllocation}>
                    Split to another warehouse
                  </Button>
                  {!hasValidWarehouseAllocation && Number(form.qty_to_produce) > 0 ? (
                    <span className="text-sm font-medium text-red-600">
                      {isSplitWarehouseAllocation
                        ? "Split total must equal pairs to produce."
                        : "Select a warehouse."}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" icon="stock" onClick={checkStock} disabled={!hasValidProductionInput}>
                  Check stock
                </Button>
                <Button type="submit" icon="check" disabled={!canSubmitProduction}>
                  Run production
                </Button>
              </div>
            </form>

            {selectedFormula ? (
              <div className="mt-5">
                <EntitySummaryCard
                  title={selectedFormula.name}
                  subtitle={`Selected production formula for ${selectedFormula.finished_good_name}`}
                  metrics={[
                    { label: "Finished good", value: selectedFormula.finished_good_name || "-" },
                    { label: "Output qty", value: formatNumber(selectedFormula.output_qty) },
                    { label: "Upper code", value: selectedFormula.article_code || "-" },
                    { label: "Sole code", value: selectedFormula.sole_code || "-" },
                    { label: "Inner boxes/pair", value: formatNumber(selectedFormula.inner_box_per_pair || 1) },
                    { label: "Inner boxes/outer", value: selectedFormula.inner_boxes_per_outer_box || "-" },
                  ]}
                  description="Check this summary before running stock check so you know the recipe and packaging rule being used."
                />
              </div>
            ) : null}

            {checkResult ? (
              <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
                <p className="font-semibold text-ink">
                  {checkResult.can_produce ? "Stock is sufficient for this run." : "Stock is not sufficient for this run."}
                </p>
                {checkResult.packaging ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Inner boxes</p>
                      <p className="mt-1 font-semibold">{formatNumber(checkResult.packaging.inner_boxes_needed)}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Outer boxes</p>
                      <p className="mt-1 font-semibold">{formatNumber(checkResult.packaging.outer_boxes_needed)}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Pack size</p>
                      <p className="mt-1 font-semibold">{checkResult.packaging.inner_boxes_per_outer_box || "-"} inner/outer</p>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {checkResult.stock_check.map((item) => (
                    <div key={item.raw_material_id} className={`rounded-2xl border bg-white px-4 py-3 ${item.sufficient ? "border-emerald-200" : "border-red-200"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{item.name}</p>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.sufficient ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {!item.sufficient ? "Short" : item.consumption_basis === "PER_OUTER_BOX" ? "Per outer box" : "Ready"}
                        </span>
                      </div>
                      <p className="text-sm text-slate/70">
                        Need {formatNumber(item.needed)} {item.unit} | Available {formatNumber(item.available)} {item.unit} | After {formatNumber(item.after_production)} {item.unit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

       <SectionCard
  title="Production history"
  subtitle="Completed production activity and outputs."
  icon="stock"
>
  <div className="mb-4">
  <input
    type="text"
    placeholder="Search production history..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-1/2 rounded-xl border border-black bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
  />
</div>
  <DataTable
    columns={[
      { key: "production_id", label: "ID" },

      { key: "formula_name", label: "Formula" },

      { key: "finished_good_name", label: "Finished Good" },

      {
        key: "qty_produced",
        label: "Pairs Produced",
      },

      { key: "produced_by_name", label: "Produced By" },

      { key: "status", label: "Status" },
   {
  key: "warehouse_names",
  label: "Warehouse",
  render: (row) => row.warehouse_names || "-",
}

      // {
      //   key: "actions",
      //   label: "Actions",
      //   render: (row) => (
      //     <div className="flex gap-2">
      //       {editingHistory?.production_id === row.production_id ? (
      //         <>
      //           <Button
      //             size="sm"
      //             icon="check"
      //             onClick={saveHistoryEdit}
      //           >
      //             Save
      //           </Button>

      //           <Button
      //             size="sm"
      //             variant="secondary"
      //             onClick={() => setEditingHistory(null)}
      //           >
      //             Cancel
      //           </Button>
      //         </>
      //       ) : (
      //         <>
      //           <Button
      //             size="sm"
      //             variant="secondary"
      //             icon="edit"
      //             onClick={() => startEditHistory(row)}
      //           >
      //             Edit
      //           </Button>

      //           {/* <Button
      //             size="sm"
      //             variant="danger"
      //             icon="delete"
      //             onClick={() =>
      //               setDeleteHistoryId(row.production_id)
      //             }
      //           >
      //             Delete
      //           </Button> */}
      //         </>
      //       )}
      //     </div>
      //   ),
      // },
    ]}
    rows={filteredHistory}
  />
</SectionCard>
{/* {deleteHistoryId && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h2 className="text-lg font-semibold text-slate-900">
        Delete production history?
      </h2>

      <p className="mt-2 text-sm text-slate-600">
        Are you sure you want to delete this production record?
      </p>

      <div className="mt-6 flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => setDeleteHistoryId(null)}
        >
          No
        </Button>

        <Button
          variant="danger"
          onClick={() => deleteHistory(deleteHistoryId)}
        >
          Yes, Delete
        </Button>
      </div>
    </div>
  </div>
)} */}
      </div>
    );
  }
