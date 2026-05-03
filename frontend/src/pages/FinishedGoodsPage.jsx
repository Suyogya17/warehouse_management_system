import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import EntitySummaryCard from "../components/EntitySummaryCard";
import { Field, SelectInput, TextInput } from "../components/Field";
import NextStepCard from "../components/NextStepCard";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

const initialForm = {
  name: "",
  article_code: "",
  sole_code: "",
  color: "",
  size: "",
  unit: "pairs",
  min_quantity: 5,
  inner_box_per_pair: 1,
  inner_boxes_per_outer_box: 30,
  image: null,
};

const buildFormData = (values, editingId) => {
  const formData = new FormData();
  formData.append("name", values.name);
  formData.append("article_code", values.article_code);
  formData.append("sole_code", values.sole_code);
  formData.append("color", values.color);
  formData.append("unit", values.unit);
  formData.append("min_quantity", Number(values.min_quantity));
  formData.append("size", values.size || "");
  formData.append("inner_box_per_pair", Number(values.inner_box_per_pair || 1));
  formData.append("inner_boxes_per_outer_box", values.inner_boxes_per_outer_box ? Number(values.inner_boxes_per_outer_box) : "");

  if (values.image) {
    formData.append("image", values.image);
  }

  return formData;
};

export default function FinishedGoodsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user.role === "ADMIN";
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const [selectedUpperId, setSelectedUpperId] = useState("");
  const [selectedSoleId, setSelectedSoleId] = useState("");

  const loadItems = useCallback(async () => {
    const [goodsResult, materialsResult] = await Promise.all([
      api.getFinishedGoods(token),
      api.getRawMaterials(token),
    ]);
    setItems(goodsResult.data || []);
    setMaterials(materialsResult.data || []);
  }, [token]);

  useEffect(() => {
    loadItems().catch(console.error);
  }, [loadItems]);

  useDataRefresh(loadItems, "finished-goods");

  const upperMaterials = materials.filter((item) => item.category === "Upper");
  const soleMaterials = materials.filter((item) => item.category === "Sole");
  const selectedUpperMaterial = upperMaterials.find((item) => String(item.id) === selectedUpperId);
  const selectedSoleMaterial = soleMaterials.find((item) => String(item.id) === selectedSoleId);

  const submit = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await api.updateFinishedGood(editingId, buildFormData(form, true), token);
        showToast({ tone: "success", title: "Finished good updated", message: "The finished goods list was refreshed." });
        setNextStep({
          description: "The finished good is updated. Make sure its formula still matches the product's upper and sole codes.",
          steps: [
            "Review the article code, sole code, and color in the table.",
            "Open Formulas and confirm the matching upper and sole are included in the recipe.",
            "Use Production to run a stock check before the next run.",
          ],
        });
      } else {
        await api.createFinishedGood(buildFormData(form, false), token);
        showToast({ tone: "success", title: "Finished good created", message: "The finished goods list was refreshed." });
        setNextStep({
          description: "The product is created. The next step is to define how it is made by creating a formula with the matching upper and sole.",
          steps: [
            "Open Formulas and select this finished good.",
            "Use the suggested materials so the matching upper and sole are added automatically.",
            "Save the formula, then go to Production to check stock and run production.",
          ],
        });
      }
      await loadItems();
      announceDataRefresh("finished-goods");
      setForm(initialForm);
      setEditingId(null);
      setSelectedUpperId("");
      setSelectedSoleId("");
    } catch (error) {
      showToast({ tone: "error", title: "Finished good save failed", message: error.message });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      article_code: item.article_code || "",
      sole_code: item.sole_code || "",
      color: item.color || "",
      size: item.size || "",
      unit: item.unit || "pairs",
      min_quantity: item.min_quantity || 5,
      inner_box_per_pair: item.inner_box_per_pair || 1,
      inner_boxes_per_outer_box: item.inner_boxes_per_outer_box || 30,
      image: null,
    });
    setSelectedUpperId("");
    setSelectedSoleId("");
  };

  const remove = async (id) => {
    try {
      await api.deleteFinishedGood(id, token);
      setNextStep(null);
      await loadItems();
      announceDataRefresh("finished-goods");
      showToast({ tone: "success", title: "Finished good deleted", message: "The finished goods list was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Delete failed", message: error.message });
    }
  };

  const toggleVisibility = async (item) => {
    try {
      await api.setFinishedGoodVisibility(item.id, { is_visible: !item.is_visible }, token);
      showToast({
        tone: "success",
        title: item.is_visible ? "Product hidden" : "Product displayed",
        message: "The finished goods list was refreshed.",
      });
      setNextStep({
        description: item.is_visible
          ? "This product is now hidden from normal users."
          : "This product is now visible to normal users.",
        steps: item.is_visible
          ? [
              "Users will no longer see this product in their catalog.",
              "You can display it again later when stock is ready.",
            ]
          : [
              "Users can now see this product in their catalog.",
              "If needed, run production again later to replenish stock.",
            ],
      });
      await loadItems();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({ tone: "error", title: "Visibility update failed", message: error.message });
    }
  };

  const selectUpperMaterial = (materialId) => {
    setSelectedUpperId(materialId);
    const selected = upperMaterials.find((item) => String(item.id) === materialId);
    if (!selected) return;

    setForm((current) => ({
      ...current,
      article_code: selected.article_code || "",
      color: selected.color || current.color,
      name: current.name || selected.name || "",
    }));
  };

  const selectSoleMaterial = (materialId) => {
    setSelectedSoleId(materialId);
    const selected = soleMaterials.find((item) => String(item.id) === materialId);
    if (!selected) return;

    setForm((current) => ({
      ...current,
      sole_code: selected.article_code || "",
    }));
  };

  return (
    <div className="space-y-6">
      {/* <PageHeader
        eyebrow="Catalog"
        title="Finished goods"
        description="Maintain customer-facing products with linked upper and sole codes, imagery, and stock readiness."
        icon="finishedGoods"
      /> */}

      <NextStepCard
        description={nextStep?.description || "After a finished good is created, define its formula so the system knows which upper and sole should be consumed during production."}
        steps={
          nextStep?.steps || [
            "Pick the correct upper raw material so the article code is filled automatically.",
            "Pick the correct sole raw material so the sole code is filled automatically.",
            "Open Formulas next and create the recipe for this finished good.",
          ]
        }
      />

      {isAdmin ? (
        <SectionCard
          title={editingId ? "Update finished good" : "Add finished good"}
          subtitle="Choose the upper and sole from raw materials so codes are filled in automatically."
          icon={editingId ? "edit" : "plus"}
        >
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={submit}>
            {!editingId ? (
              <>
                <Field label="Upper raw material" hint="Only raw materials from the Upper category are shown here.">
                  <SelectInput
                    value={selectedUpperId}
                    onChange={(event) => selectUpperMaterial(event.target.value)}
                  >
                    <option value="">Choose upper material</option>
                    {upperMaterials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.article_code}) {item.color ? `- ${item.color}` : ""}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                <Field label="Sole raw material" hint="Only raw materials from the Sole category are shown here.">
                  <SelectInput
                    value={selectedSoleId}
                    onChange={(event) => selectSoleMaterial(event.target.value)}
                  >
                    <option value="">Choose sole material</option>
                    {soleMaterials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.article_code})
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </>
            ) : null}

            {!editingId && selectedUpperMaterial ? (
              <div className="md:col-span-2 xl:col-span-3">
                <EntitySummaryCard
                  title={selectedUpperMaterial.name}
                  subtitle={`Upper selected for this product`}
                  imageUrl={selectedUpperMaterial.image_url ? `${APP_BASE_URL}${selectedUpperMaterial.image_url}` : null}
                  metrics={[
                    { label: "Article code", value: selectedUpperMaterial.article_code },
                    { label: "Color", value: selectedUpperMaterial.color || "-" },
                    { label: "Category", value: selectedUpperMaterial.category || "-" },
                    { label: "Current stock", value: `${formatNumber(selectedUpperMaterial.quantity)} ${selectedUpperMaterial.unit}` },
                  ]}
                  description="This upper will fill the product article code and color automatically."
                />
              </div>
            ) : null}

            {!editingId && selectedSoleMaterial ? (
              <div className="md:col-span-2 xl:col-span-3">
                <EntitySummaryCard
                  title={selectedSoleMaterial.name}
                  subtitle={`Sole selected for this product`}
                  imageUrl={selectedSoleMaterial.image_url ? `${APP_BASE_URL}${selectedSoleMaterial.image_url}` : null}
                  metrics={[
                    { label: "Sole code", value: selectedSoleMaterial.article_code },
                    { label: "Color", value: selectedSoleMaterial.color || "-" },
                    { label: "Category", value: selectedSoleMaterial.category || "-" },
                    { label: "Current stock", value: `${formatNumber(selectedSoleMaterial.quantity)} ${selectedSoleMaterial.unit}` },
                  ]}
                  description="This sole will fill the sole code automatically."
                />
              </div>
            ) : null}

            <Field label="Name">
              <TextInput
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Field>

            <Field label="Article Code">
              <TextInput
                value={form.article_code}
                onChange={(event) => setForm((current) => ({ ...current, article_code: event.target.value }))}
                required
              />
            </Field>

            <Field label="Sole Code">
              <TextInput
                value={form.sole_code}
                onChange={(event) => setForm((current) => ({ ...current, sole_code: event.target.value }))}
              />
            </Field>

            <Field label="Color">
              <TextInput
                value={form.color}
                onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
              />
            </Field>

            <Field label="Size">
              <TextInput
                value={form.size}
                onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
              />
            </Field>

            <Field label="Unit">
              <TextInput
                value={form.unit}
                onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              />
            </Field>

            <Field label="Minimum Quantity">
  <TextInput
    type="number"
    min={0}
    value={form.min_quantity}
    onChange={(event) =>
      setForm((current) => ({
        ...current,
        min_quantity: Math.max(0, Number(event.target.value)),
      }))
    }
  />
</Field>
            <Field label="Inner boxes per pair">
              <TextInput
                type="number"
                min={0}
                step="1"
                value={form.inner_box_per_pair}
                onChange={(event) => setForm((current) => ({ ...current, inner_box_per_pair: event.target.value }))}
              />
            </Field>
            <Field label="Inner boxes per outer box">
              <TextInput
                type="number"
                min={0}
                step="1"
                value={form.inner_boxes_per_outer_box}
                onChange={(event) => setForm((current) => ({ ...current, inner_boxes_per_outer_box: event.target.value }))}
              />
            </Field>
            <Field label="Image">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setForm((current) => ({ ...current, image: event.target.files?.[0] || null }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </Field>
            {!editingId ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-slate-600">
                Article code is inherited from the selected upper, and sole code is inherited from the selected sole.
              </div>
            ) : null}
            {editingId && items.find((item) => item.id === editingId)?.image_url ? (
              <div>
                <span className="mb-2 block text-sm font-medium text-slate">Current image</span>
                <img
                  src={`${APP_BASE_URL}${items.find((item) => item.id === editingId)?.image_url}`}
                  alt={form.name}
                  className="h-24 w-24 rounded-2xl object-cover"
                />
              </div>
            ) : null}
            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit">
                {editingId ? "Save changes" : "Create finished good"}
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

          <SectionCard
        title="Finished goods"
        subtitle={isAdmin ? "Admin can create, manage, and control user visibility for finished goods." : "Visible product catalog for users."}
        icon="finishedGoods"
      >
        <DataTable
          columns={[
            {
              key: "image_url",
              label: "Image",
              render: (row) =>
                row.image_url ? (
                  <img
                    src={`${APP_BASE_URL}${row.image_url}`}
                    alt={row.name}
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate/10 text-xs text-slate/50">
                    No image
                  </div>
                ),
            },
            { key: "name", label: "Name" },
            ...(isAdmin ? [{ key: "article_code", label: "Article Code" }] : []),
            ...(isAdmin ? [{ key: "sole_code", label: "Sole Code" }] : []),
            { key: "color", label: "Color" },
            { key: "size", label: "Size" },
            { key: "quantity", label: "Stock", render: (row) => `${formatNumber(row.quantity)} ${row.unit}` },
            ...(isAdmin ? [{ key: "min_quantity", label: "Min Qty" }] : []),
            ...(isAdmin
              ? [{
                  key: "packaging",
                  label: "Packaging",
                  render: (row) => `${formatNumber(row.inner_box_per_pair || 1)} inner/pair | ${row.inner_boxes_per_outer_box || "-"} inner/outer`,
                }]
              : []),
            ...(isAdmin
              ? [{
                  key: "is_visible",
                  label: "Visibility",
                  render: (row) => (
                    <StatusBadge tone={row.is_visible ? "success" : "neutral"}>
                      {row.is_visible ? "Displayed" : "Hidden"}
                    </StatusBadge>
                  ),
                }]
              : []),
            isAdmin
              ? {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button type="button" variant={row.is_visible ? "ghost" : "primary"} size="sm" icon={row.is_visible ? "eye" : "eyeOff"} onClick={() => toggleVisibility(row)}>
                        {/* {row.is_visible ? "Hide product" : "Display product"} */}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" icon="edit" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button type="button" variant="danger" size="sm" icon="delete" onClick={() => remove(row.id)}>
                        Delete
                      </Button>
                    </div>
                  ),
                }
              : { key: "empty", label: "" },
          ]}
          rows={items}
        />
      </SectionCard>
    </div>
  );
}
