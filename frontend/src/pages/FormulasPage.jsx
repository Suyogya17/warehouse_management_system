import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import EntitySummaryCard from "../components/EntitySummaryCard";
import { Field, SelectInput, TextInput } from "../components/Field";
import NextStepCard from "../components/NextStepCard";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";
import Select from "react-select";

const initialForm = {
  name: "",
  finished_good_id: "",
  output_qty: 1,
  notes: "",
  inputs: [{ raw_material_id: "", quantity_needed: 1, consumption_basis: "PER_PAIR" }],
};

const soleMakingCategories = ["Sole", "Sole Powder", "Sole Foam", "TPR"];

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
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
const [filterFinishedGood, setFilterFinishedGood] = useState("");
const [currentPage, setCurrentPage] = useState(1);

const ITEMS_PER_PAGE = 10;
  const [materials, setMaterials] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [nextStep, setNextStep] = useState(null);

  const load = useCallback(async () => {
    const [materialsResult, goodsResult, formulasResult] = await Promise.all([
      api.getRawMaterials(token),
      api.getFinishedGoods(token),
      api.getFormulas(token),
    ]);
    setMaterials(materialsResult.data || []);
    setFinishedGoods(goodsResult.data || []);
    setFormulas(formulasResult.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "formulas");

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
      nextInputs.push({ raw_material_id: String(upper.id), quantity_needed: 1, consumption_basis: "PER_PAIR" });
    }

    if (sole) {
      nextInputs.push({ raw_material_id: String(sole.id), quantity_needed: 1, consumption_basis: "PER_PAIR" });
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
      showToast({ tone: "error", title: "Formula incomplete", message: "Please select a finished good." });
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
    }) || form.inputs.some((input) => {
      const material = materials.find((item) => String(item.id) === String(input.raw_material_id));
      return material && soleMakingCategories.includes(material.category);
    });

    if (!hasUpper || !hasSole) {
      showToast({ tone: "error", title: "Formula incomplete", message: "Formula must include both the matching upper and sole for the selected finished good." });
      return;
    }

    try {
      const payload = {
        ...form,
        finished_good_id: Number(form.finished_good_id),
        output_qty: Number(form.output_qty),
        inputs: form.inputs.map((item) => ({
          raw_material_id: Number(item.raw_material_id),
          quantity_needed: Number(item.quantity_needed),
          consumption_basis: item.consumption_basis || "PER_PAIR",
        })),
      };

      if (editingId) {
        await api.updateFormula(editingId, payload, token);
        showToast({ tone: "success", title: "Formula updated", message: "Saved formulas were refreshed." });
      } else {
        await api.createFormula(payload, token);
        showToast({ tone: "success", title: "Formula created", message: "Saved formulas were refreshed." });
      }

      setNextStep({
        description: "The recipe is ready. You can now use Production to check whether enough raw materials are available and then run the conversion.",
        steps: [
          "Open Production and select this formula.",
          "Click Check stock first to confirm the upper and sole quantities are enough.",
          "If stock is sufficient, run production and then review the finished goods stock.",
        ],
      });
      setForm(initialForm);
      setEditingId(null);
      await load();
      announceDataRefresh("formulas");
    } catch (error) {
      showToast({ tone: "error", title: "Formula save failed", message: error.message });
    }
  };

  const remove = async (id) => {
    try {
      await api.deactivateFormula(id, token);
      showToast({ tone: "success", title: "Formula archived", message: "Saved formulas were refreshed." });
      setNextStep({
        description: "This formula is no longer available for new production runs.",
        steps: [
          "Create a new formula if the product should still be produced with a different material setup.",
          "Use Production only with active formulas.",
        ],
      });
      await load();
      announceDataRefresh("formulas");
    } catch (error) {
      showToast({ tone: "error", title: "Archive failed", message: error.message });
    }
  };

  const startEdit = (formula) => {
    setEditingId(formula.id);
    setForm({
      name: formula.name || "",
      finished_good_id: String(formula.finished_good_id || ""),
      output_qty: formula.output_qty || 1,
      notes: formula.notes || "",
      inputs: (formula.inputs || []).map((input) => ({
        raw_material_id: String(input.raw_material_id || ""),
        quantity_needed: input.quantity_needed || 1,
        consumption_basis: input.consumption_basis || "PER_PAIR",
      })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
  };

  const filteredFormulas = formulas.filter((formula) => {
  const matchSearch =
    !search ||
    formula.name?.toLowerCase().includes(search.toLowerCase()) ||
    formula.finished_good_name?.toLowerCase().includes(search.toLowerCase());

  const matchFinishedGood =
    !filterFinishedGood ||
    String(formula.finished_good_id) === filterFinishedGood;

  return matchSearch && matchFinishedGood;
});

const totalPages = Math.ceil(filteredFormulas.length / ITEMS_PER_PAGE) || 1;

const paginatedFormulas = filteredFormulas.slice(
  (currentPage - 1) * ITEMS_PER_PAGE,
  currentPage * ITEMS_PER_PAGE
);


  return (
    <div className="space-y-6">

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

      <SectionCard
        title={editingId ? "Edit production formula" : "Create production formula"}
        subtitle="Define how uppers, soles, powder, foam, optional trims, and packing inputs become one finished shoe pair."
        icon="formulas"
      >
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
              <Select
  options={finishedGoods.map((item) => ({
    value: String(item.id),
    label: `${item.name} (${item.article_code})`,
  }))}

  value={
    finishedGoods
      .map((item) => ({
        value: String(item.id),
        label: `${item.name} (${item.article_code})`,
      }))
      .find((opt) => opt.value === String(form.finished_good_id)) || null
  }

  onChange={(selected) =>
    handleFinishedGoodChange(selected?.value || "")
  }

  placeholder="Search finished good..."
  isClearable
  isSearchable

  menuPortalTarget={document.body}
  menuPosition="fixed"

  styles={{
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
  }}
/>
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
                { label: "Inner boxes/pair", value: formatNumber(selectedFinishedGood.inner_box_per_pair || 1) },
                { label: "Inner boxes/outer", value: selectedFinishedGood.inner_boxes_per_outer_box || "-" },
              ]}
              description="Use the suggestions below, then add powder, foam, TPR, laces, inner boxes, and outer boxes as needed."
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
                        nextInputs.push({ raw_material_id: String(suggestedSole.id), quantity_needed: 1, consumption_basis: "PER_PAIR" });
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
              <div key={index} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
                <Select
  options={materials.map((item) => ({
    value: String(item.id),
    label: buildMaterialOptionLabel(item),
  }))}

  value={
    materials
      .map((item) => ({
        value: String(item.id),
        label: buildMaterialOptionLabel(item),
      }))
      .find((opt) => opt.value === String(input.raw_material_id)) || null
  }

  onChange={(selected) =>
    updateInput(index, "raw_material_id", selected?.value || "")
  }

  placeholder="Search raw material..."
  isClearable
  isSearchable

  menuPortalTarget={document.body}
  menuPosition="fixed"

  styles={{
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
  }}
/>
                <TextInput
                  type="number"
                  min={0}
                  step="1"
                  value={input.quantity_needed}
                  onChange={(event) => updateInput(index, "quantity_needed", event.target.value)}
                  placeholder="Qty needed"
                  required
                />
                <SelectInput
                  value={input.consumption_basis || "PER_PAIR"}
                  onChange={(event) => updateInput(index, "consumption_basis", event.target.value)}
                >
                  <option value="PER_PAIR">Per pair</option>
                  <option value="PER_OUTER_BOX">Per outer box</option>
                </SelectInput>
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
                  inputs: [...current.inputs, { raw_material_id: "", quantity_needed: 1, consumption_basis: "PER_PAIR" }],
                }))
              }
            >
              Add material input
            </Button>
            <Button type="submit" icon="check">
              {editingId ? "Save changes" : "Save formula"}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </SectionCard>
<div>
   <SectionCard title="Saved formulas" subtitle="Recipes currently available for production runs." icon="box">
        <input
          type="text"
          placeholder="Search by formula or finished good..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex justify-end border rounded-lg px-3 py-2 text-sm w-full max-w-xs mb-4"
        />
        <div className="space-y-4">
          {paginatedFormulas.map((formula) => (
            <div key={formula.id} className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-display text-2xl text-ink">{formula.name}</h3>
                  <p className="text-sm text-slate/75">
                    {formula.finished_good_name} • output {formatNumber(formula.output_qty)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" icon="edit" onClick={() => startEdit(formula)}>
                    Edit
                  </Button>
                  <Button type="button" variant="secondary" size="sm" icon="eyeOff" onClick={() => remove(formula.id)}>
                    Archive
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {formula.inputs.map((input) => (
                  <div key={input.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="font-semibold">{input.material_name}</p>
                    <p className="text-sm text-slate/70">
                      {formatNumber(input.quantity_needed)} {input.unit} needed
                      {input.consumption_basis === "PER_OUTER_BOX" ? " per outer box" : " per pair"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-6">

  <p className="text-sm text-slate-500">
    Page {currentPage} of {totalPages}
  </p>

  <div className="flex gap-2">
    <Button
      type="button"
      variant="secondary"
      disabled={currentPage === 1}
      onClick={() => setCurrentPage((p) => p - 1)}
    >
      Prev
    </Button>

    <Button
      type="button"
      variant="secondary"
      disabled={currentPage === totalPages}
      onClick={() => setCurrentPage((p) => p + 1)}
    >
      Next
    </Button>
  </div>

</div>
      </SectionCard>
</div>
     
    </div>
  );
}
