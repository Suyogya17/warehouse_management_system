import { useEffect, useState } from "react";
import Button from "../components/Button";
import EntitySummaryCard from "../components/EntitySummaryCard";
import { Field, SelectInput, TextInput } from "../components/Field";
import NextStepCard from "../components/NextStepCard";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

const initialForm = {
  name: "",
  finished_good_id: "",
  output_qty: 1,
  notes: "",
  inputs: [{ raw_material_id: "", quantity_needed: 1 }],
};

const buildMaterialOptionLabel = (item) =>
  `${item.name} (${item.article_code})${item.color ? ` - ${item.color}` : ""} [${item.category}]`;

const pickMatchingMaterial = (materials, { category, articleCode, color }) => {
  if (!articleCode) return null;

  return (
    materials.find(
      (item) =>
        item.category === category &&
        item.article_code === articleCode &&
        (!color || item.color === color)
    ) ||
    materials.find((item) => item.category === category && item.article_code === articleCode) ||
    null
  );
};

const hasMatchingMaterialInput = (inputs, materials, { category, articleCode, color }) => {
  if (!articleCode) return false;

  return inputs.some((input) => {
    const material = materials.find((item) => String(item.id) === String(input.raw_material_id));

    if (!material || material.category !== category || material.article_code !== articleCode) {
      return false;
    }

    if (category === "Upper" && color) {
      return material.color === color;
    }

    return true;
  });
};

export default function FormulasPage() {
  const { token } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [nextStep, setNextStep] = useState(null);

  const load = async () => {
    const [materialsResult, goodsResult, formulasResult] = await Promise.all([
      api.getRawMaterials(token),
      api.getFinishedGoods(token),
      api.getFormulas(token),
    ]);
    setMaterials(materialsResult.data || []);
    setFinishedGoods(goodsResult.data || []);
    setFormulas(formulasResult.data || []);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  const selectedFinishedGood = finishedGoods.find((item) => String(item.id) === String(form.finished_good_id));
  const selectedInputMaterials = form.inputs
    .map((input) => materials.find((item) => String(item.id) === String(input.raw_material_id)))
    .filter(Boolean);

  const suggestedUpper = selectedFinishedGood
    ? pickMatchingMaterial(materials, {
        category: "Upper",
        articleCode: selectedFinishedGood.article_code,
        color: selectedFinishedGood.color,
      })
    : null;

  const suggestedSole = selectedFinishedGood
    ? pickMatchingMaterial(materials, {
        category: "Sole",
        articleCode: selectedFinishedGood.sole_code,
      })
    : null;

  const useSuggestedInputs = (finishedGood) => {
    if (!finishedGood) {
      setForm((current) => ({ ...current, inputs: initialForm.inputs }));
      return;
    }

    const upper = pickMatchingMaterial(materials, {
      category: "Upper",
      articleCode: finishedGood.article_code,
      color: finishedGood.color,
    });

    const sole = pickMatchingMaterial(materials, {
      category: "Sole",
      articleCode: finishedGood.sole_code,
    });

    const nextInputs = [];

    if (upper) {
      nextInputs.push({ raw_material_id: String(upper.id), quantity_needed: 1 });
    }

    if (sole) {
      nextInputs.push({ raw_material_id: String(sole.id), quantity_needed: 1 });
    }

    setForm((current) => ({
      ...current,
      name: current.name || `${finishedGood.name} Formula`,
      notes:
        current.notes ||
        `Formula for ${finishedGood.name}${finishedGood.color ? ` (${finishedGood.color})` : ""}`,
      inputs: nextInputs.length ? nextInputs : initialForm.inputs,
    }));
  };

  const handleFinishedGoodChange = (value) => {
    const finishedGood = finishedGoods.find((item) => String(item.id) === value);

    setForm((current) => ({
      ...current,
      finished_good_id: value,
      name: finishedGood ? `${finishedGood.name} Formula` : current.name,
      notes:
        finishedGood
          ? `Formula for ${finishedGood.name}${finishedGood.color ? ` (${finishedGood.color})` : ""}`
          : current.notes,
    }));

    useSuggestedInputs(finishedGood);
  };

  const updateInput = (index, key, value) => {
    setForm((current) => ({
      ...current,
      inputs: current.inputs.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!selectedFinishedGood) {
      setMessage("Please select a finished good.");
      return;
    }

    const hasUpper = hasMatchingMaterialInput(form.inputs, materials, {
      category: "Upper",
      articleCode: selectedFinishedGood.article_code,
      color: selectedFinishedGood.color,
    });
    const hasSole = hasMatchingMaterialInput(form.inputs, materials, {
      category: "Sole",
      articleCode: selectedFinishedGood.sole_code,
    });

    if (!hasUpper || !hasSole) {
      setMessage("Formula must include both the matching upper and sole for the selected finished good.");
      return;
    }

    try {
      await api.createFormula(
        {
          ...form,
          finished_good_id: Number(form.finished_good_id),
          output_qty: Number(form.output_qty),
          inputs: form.inputs.map((item) => ({
            raw_material_id: Number(item.raw_material_id),
            quantity_needed: Number(item.quantity_needed),
          })),
        },
        token
      );
      setMessage("Formula created and list refreshed immediately.");
      setNextStep({
        description: "The recipe is ready. You can now use Production to check whether enough raw materials are available and then run the conversion.",
        steps: [
          "Open Production and select this formula.",
          "Click Check stock first to confirm the upper and sole quantities are enough.",
          "If stock is sufficient, run production and then review the finished goods stock.",
        ],
      });
      setForm(initialForm);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.deactivateFormula(id, token);
      setMessage("Formula archived.");
      setNextStep({
        description: "This formula is no longer available for new production runs.",
        steps: [
          "Create a new formula if the product should still be produced with a different material setup.",
          "Use Production only with active formulas.",
        ],
      });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Production setup"
        title="Formulas"
        description="Define repeatable recipes that map finished goods to the right upper, sole, and supporting materials."
        icon="formulas"
      />

      <NextStepCard
        description={nextStep?.description || "A formula tells the system what materials to consume when production runs. For shoes, make sure the matching upper and sole are both included before saving."}
        steps={
          nextStep?.steps || [
            "Select the finished good you want to produce.",
            "Use the suggested materials so both the matching upper and sole are added.",
            "Save the formula, then open Production to check stock and run it.",
          ]
        }
      />

      <SectionCard title="Create production formula" subtitle="Define how uppers, soles, powder, foam, optional trims, and packing inputs become one finished shoe pair." icon="formulas">
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Formula name">
              <TextInput
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Field>
            <Field label="Finished good">
              <SelectInput
                value={form.finished_good_id}
                onChange={(event) => handleFinishedGoodChange(event.target.value)}
                required
              >
                <option value="">Select finished good</option>
                {finishedGoods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.article_code})
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Output quantity">
              <TextInput
                type="number"
                min="1"
                value={form.output_qty}
                onChange={(event) => setForm((current) => ({ ...current, output_qty: event.target.value }))}
                required
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>
          </div>

          {selectedFinishedGood ? (
            <EntitySummaryCard
              title={selectedFinishedGood.name}
              subtitle={`Prepare a formula for ${selectedFinishedGood.article_code || "-"} / ${selectedFinishedGood.sole_code || "-"}`}
              imageUrl={selectedFinishedGood.image_url ? `${APP_BASE_URL}${selectedFinishedGood.image_url}` : null}
              metrics={[
                { label: "Upper code", value: selectedFinishedGood.article_code || "-" },
                { label: "Sole code", value: selectedFinishedGood.sole_code || "-" },
                { label: "Color", value: selectedFinishedGood.color || "-" },
                { label: "Size", value: selectedFinishedGood.size || "-" },
              ]}
              description="Use the suggestions below, then confirm both upper and sole are present before saving."
              action={
                  <Button type="button" variant="secondary" size="sm" icon="spark" onClick={() => useSuggestedInputs(selectedFinishedGood)}>
                    Use suggested materials
                  </Button>
              }
            />
          ) : null}

          {selectedFinishedGood && (suggestedUpper || suggestedSole) ? (
            <div className="grid gap-3 md:grid-cols-2">
              {suggestedUpper ? (
                <button
                  type="button"
                  onClick={() => updateInput(0, "raw_material_id", String(suggestedUpper.id))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/60"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested upper</p>
                  <p className="mt-2 font-semibold text-slate-900">{buildMaterialOptionLabel(suggestedUpper)}</p>
                  <p className="mt-1 text-sm text-slate-600">Click to put this upper into the first material line.</p>
                </button>
              ) : null}
              {suggestedSole ? (
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => {
                      const nextInputs = [...current.inputs];
                      const targetIndex = nextInputs[1] ? 1 : nextInputs.length;
                      if (nextInputs[targetIndex]) {
                        nextInputs[targetIndex] = { ...nextInputs[targetIndex], raw_material_id: String(suggestedSole.id) };
                      } else {
                        nextInputs.push({ raw_material_id: String(suggestedSole.id), quantity_needed: 1 });
                      }
                      return { ...current, inputs: nextInputs };
                    })
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/60"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested sole</p>
                  <p className="mt-2 font-semibold text-slate-900">{buildMaterialOptionLabel(suggestedSole)}</p>
                  <p className="mt-1 text-sm text-slate-600">Click to put this sole into the next material line.</p>
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {form.inputs.map((input, index) => (
              <div key={index} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_auto]">
                <SelectInput
                  value={input.raw_material_id}
                  onChange={(event) => updateInput(index, "raw_material_id", event.target.value)}
                  required
                >
                  <option value="">Select raw material</option>
                  {materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {buildMaterialOptionLabel(item)}
                    </option>
                  ))}
                </SelectInput>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={input.quantity_needed}
                  onChange={(event) => updateInput(index, "quantity_needed", event.target.value)}
                  placeholder="Qty needed"
                  required
                />
                <Button
                  type="button"
                  variant="danger"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      inputs: current.inputs.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          {selectedInputMaterials.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedInputMaterials.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">{buildMaterialOptionLabel(item)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Current stock: {formatNumber(item.quantity)} {item.unit}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              icon="plus"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  inputs: [...current.inputs, { raw_material_id: "", quantity_needed: 1 }],
                }))
              }
            >
              Add material input
            </Button>
            <Button type="submit" icon="check">
              Save formula
            </Button>
            {message ? <p className={`rounded-xl border px-4 py-3 text-sm ${message.toLowerCase().includes("cannot") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</p> : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Saved formulas" subtitle="Recipes currently available for production runs." icon="box">
        <div className="space-y-4">
          {formulas.map((formula) => (
            <div key={formula.id} className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-display text-2xl text-ink">{formula.name}</h3>
                  <p className="text-sm text-slate/75">
                    {formula.finished_good_name} • output {formatNumber(formula.output_qty)}
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" icon="eyeOff" onClick={() => remove(formula.id)}>
                  Archive
                </Button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {formula.inputs.map((input) => (
                  <div key={input.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="font-semibold">{input.material_name}</p>
                    <p className="text-sm text-slate/70">
                      {formatNumber(input.quantity_needed)} {input.unit} needed
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
