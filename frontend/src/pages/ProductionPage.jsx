import { useCallback, useEffect, useState } from "react";
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
import { formatNumber } from "../utils/format";

export default function ProductionPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canRun = ["ADMIN", "STORE_KEEPER"].includes(user.role);
  const [formulas, setFormulas] = useState([]);
  const [history, setHistory] = useState([]);
  const [checkResult, setCheckResult] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const [form, setForm] = useState({ formula_id: "", qty_to_produce: "", notes: "" });

  const load = useCallback(async () => {
    const [formulasResult, historyResult] = await Promise.all([api.getFormulas(token), api.getProductionHistory(token)]);
    setFormulas(formulasResult.data || []);
    setHistory(historyResult.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "production");

  const hasValidProductionInput = Number(form.formula_id) > 0 && Number(form.qty_to_produce) > 0;
  const selectedFormula = formulas.find((item) => String(item.id) === String(form.formula_id));
  const canSubmitProduction =
    hasValidProductionInput &&
    checkResult?.can_produce &&
    Number(checkResult?.qty_to_produce) === Number(form.qty_to_produce) &&
    String(form.formula_id) === String(checkResult?.formula_id || form.formula_id);

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
      showToast({ tone: "error", title: "Check stock first", message: "Run Check stock first, then run production while the checked quantity is still selected." });
      return;
    }

    try {
      const result = await api.runProduction(
        {
          formula_id: Number(form.formula_id),
          qty_to_produce: Number(form.qty_to_produce),
          notes: form.notes,
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
      await load();
      announceDataRefresh("production");
    } catch (err) {
      showToast({ tone: "error", title: "Production failed", message: err.message });
    }
  };

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
        <SectionCard title="Production run" subtitle="Check stock first, then convert uppers, soles, and compound materials into finished shoe pairs." icon="production">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={runProduction}>
            <Field label="Formula">
              <SelectInput
                value={form.formula_id}
                onChange={(event) => {
                  setForm((current) => ({ ...current, formula_id: event.target.value }));
                  setCheckResult(null);
                }}
                required
              >
                <option value="">Select formula</option>
                {formulas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
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

      <SectionCard title="Production history" subtitle="Completed production activity and outputs." icon="stock">
        <DataTable
          columns={[
            { key: "production_id", label: "ID" },
            { key: "formula_name", label: "Formula" },
            { key: "finished_good_name", label: "Finished Good" },
            { key: "qty_produced", label: "Pairs Produced", render: (row) => formatNumber(row.qty_produced) },
            { key: "produced_by_name", label: "Produced By" },
            { key: "status", label: "Status" },
            { key: "produced_at", label: "Created", type: "date" },
          ]}
          rows={history}
        />
      </SectionCard>
    </div>
  );
}
