import { useCallback, useEffect, useState, useMemo } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, TextInput } from "../components/Field";
import NextStepCard from "../components/NextStepCard";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";
import { materialBlueprints } from "../utils/manufacturing";
import { Filter } from "lucide-react";


const initialForm = {
  name: "",
  article_code: "",
  category: "",
  color: "",
  unit: "",
  quantity: 0,
  min_quantity: 10,
  image: null,
};

const buildFormData = (values, editingId) => {
  const formData = new FormData();
  formData.append("name", values.name);
  formData.append("article_code", values.article_code);
  formData.append("category", values.category);
  formData.append("color", values.color);
  formData.append("unit", values.unit);
  formData.append("min_quantity", Number(values.min_quantity));

  if (!editingId) {
    formData.append("quantity", Number(values.quantity));
  }

  if (values.image) {
    formData.append("image", values.image);
  }

  return formData;
};

export default function RawMaterialsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canManage = user.role === "ADMIN";
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const selectedBlueprint = materialBlueprints.find((item) => item.name.toLowerCase() === form.name.toLowerCase());

  const loadItems = useCallback(async () => {
    const result = await api.getRawMaterials(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => {
    loadItems().catch(console.error);
  }, [loadItems]);

  useDataRefresh(loadItems, "raw-materials");
  // 🔥 Filter toggle
  const [showFilters, setShowFilters] = useState(false);

  // 🔥 Filter state
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    stock: "all",
  });

   // Filter logic
  const filteredItems = useMemo(() => {
  return items.filter((item) => {
    const matchSearch =
      !filters.search ||
      item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.article_code?.toLowerCase().includes(filters.search.toLowerCase());

    const matchCategory =
      !filters.category || item.category === filters.category;

    const matchStock =
      filters.stock === "all"
        ? true
        : filters.stock === "low"
        ? item.quantity < item.min_quantity
        : item.quantity >= item.min_quantity;

    return matchSearch && matchCategory && matchStock;
  });
}, [items, filters]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await api.updateRawMaterial(editingId, buildFormData(form, true), token);
        showToast({ tone: "success", title: "Raw material updated", message: "The raw materials list was refreshed." });
        setNextStep({
          description: "Raw material details are updated. Stock quantity still stays controlled by purchase, production, and consumption records.",
          steps: [
            "Check the raw material table to confirm the article code, category, color, and image changed correctly.",
            "Use Purchase / Receive stock if you need to increase quantity.",
            "Open Finished goods or Formulas if this code is linked to products.",
          ],
        });
      } else {
        await api.createRawMaterial(buildFormData(form, false), token);
        showToast({ tone: "success", title: "Raw material created", message: "The raw materials list was refreshed." });
        setNextStep({
          description: "Your material is ready. The usual next step is to create a finished good that uses this upper or sole, then build a formula for production.",
          steps: [
            "If this is an Upper or Sole, open Finished goods and create the product that should use this code.",
            "After the finished good is created, open Formulas and connect both the matching upper and sole.",
            "When the formula is ready, go to Production and run a stock check before producing.",
          ],
        });
      }

      await loadItems();
      announceDataRefresh("raw-materials");
      setForm(initialForm);
      setEditingId(null);
    } catch (error) {
      showToast({ tone: "error", title: "Raw material save failed", message: error.message });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      article_code: item.article_code || "",
      category: item.category || "",
      color: item.color || "",
      unit: item.unit || "pair",
      quantity: item.quantity || 0,
      min_quantity: item.min_quantity || 10,
      image: null,
    });
  };

  const remove = async (id) => {
    try {
      await api.deleteRawMaterial(id, token);
      setNextStep(null);
      await loadItems();
      announceDataRefresh("raw-materials");
      showToast({ tone: "success", title: "Raw material deleted", message: "The raw materials list was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Delete failed", message: error.message });
    }
  };

  const [preview, setPreview] = useState(null); 

  return (
    <div className="space-y-6">

      <NextStepCard
        description={nextStep?.description || "Start by creating the upper and sole raw materials you need for a product. Once both are ready, create the finished good that links those codes together."}
        steps={
          nextStep?.steps || [
            "Create the upper raw material with the correct article code and color.",
            "Create the sole raw material with the correct sole article code.",
            "Open Finished goods to connect those two materials into one product.",
          ]
        }
      />
 
      {canManage ? (
        <SectionCard 
        
          title={editingId ? "Update raw material" : "Add raw material"}
          subtitle={editingId ? "Edit the identification details here. Stock quantity itself is controlled through purchase, production, and consumption." : 
            "Create a raw material with factory-friendly naming, unit, and opening stock."}
          icon={editingId ? "edit" : "plus"}
          
        >
          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4 ">
            {materialBlueprints.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    name: item.name,
                    unit: item.unit,
                    category: item.category || current.category || "Other",
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-indigo-200 hover:bg-indigo-50/60"
              >
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="mt-1 text-sm text-slate/70">
                  {item.unit} • {item.stage}
                </p>
              </button>
            ))}
          </div>

          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={submit}>
            {[
              ["name", "Name"],
              ["article_code", "Article Code"],
              ["category", "Category"],
              ["color", "Color"],
              ["unit", "Unit"],
              ["quantity", "Opening Quantity", "number"],
              ["min_quantity", "Minimum Quantity", "number"],
            ].map(([key, label, type = "text"]) => (
              <Field key={key} label={label}>
                <TextInput
                  type={type}
                  min={key === "quantity" || key === "min_quantity" ? 0 : undefined} // prevent negative
                  value={form[key]}
                  disabled={editingId && key === "quantity"}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  required={["name", "article_code", "category"].includes(key)}
                />
              </Field>
            ))}
            {editingId ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-slate-700">
                Quantity is locked here so stock history stays correct. Use <span className="font-semibold">Purchase / Receive stock</span> to add stock, and use production or consumption to reduce it.
              </div>
            ) : null}
            {selectedBlueprint ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-slate-600">
                Recommended unit: {selectedBlueprint.unit}. {selectedBlueprint.notes}
              </div>
            ) : null}
           <Field label="Image" hint="Upload material image">
  <input
    type="file"
    accept="image/*"
    onChange={(event) => {
      const file = event.target.files?.[0];
      setForm((current) => ({ ...current, image: file }));

      if (file) {
        setPreview(URL.createObjectURL(file));
      }
    }}
    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm"
  />
</Field>

{preview && (
  <div className="col-span-full flex justify center ">
    <img
      src={preview}
      alt="Preview"
      className="h-60 w-30 object-cover rounded-xl border"
    />
    {/* <div className="text-sm text-slate-600">
      Image preview
    </div> */}
  </div>
)}
            {editingId && items.find((item) => item.id === editingId)?.image_url ? (
              <div className="block">
                <span className="mb-2 block text-sm font-medium text-slate">Current image</span>
                <img
                  src={`${APP_BASE_URL}${items.find((item) => item.id === editingId)?.image_url}`}
                  alt={form.name}
                  className="h-24 w-24 rounded-2xl object-cover"
                />
              </div>
            ) : null}
            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center gap-3 xl:justify-center">
              <Button className="" type="submit">
                {editingId ? "Save changes" : "Create material"}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setForm(initialForm);
                    setEditingId(null);
                    setNextStep(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      ) : null}

                <SectionCard
        title="Raw materials"
        subtitle="Manage uppers, soles, powder, foam, optional trims, and packing materials."
        icon="materials"
      >
        <div className="flex justify-end mb-3">
  <button
    onClick={() => setShowFilters(!showFilters)}
    className="flex items-center gap-2 px-3 py-2 text-sm border rounded-xl bg-white hover:bg-slate-50"
  >
    <Filter size={16} />
    Filters
  </button>
</div>

{showFilters && (
  <div className="grid gap-3 md:grid-cols-3 mb-4 p-4 border rounded-2xl bg-slate-50">
    
    {/* Search */}
    <input
      type="text"
      placeholder="Search name or code..."
      value={filters.search}
      onChange={(e) =>
        setFilters((f) => ({ ...f, search: e.target.value }))
      }
      className="border rounded-lg px-3 py-2 text-sm"
    />

    {/* Category */}
    <select
      value={filters.category}
      onChange={(e) =>
        setFilters((f) => ({ ...f, category: e.target.value }))
      }
      className="border rounded-lg px-3 py-2 text-sm"
    >
      <option value="">All Categories</option>
      {[...new Set(items.map((i) => i.category))].map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>

    {/* Stock */}
    <select
      value={filters.stock}
      onChange={(e) =>
        setFilters((f) => ({ ...f, stock: e.target.value }))
      }
      className="border rounded-lg px-3 py-2 text-sm"
    >
      <option value="all">All Stock</option>
      <option value="low">Low Stock</option>
      <option value="ok">In Stock</option>
    </select>
  </div>
)}

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
            { key: "article_code", label: "Article Code" },
            { key: "category", label: "Category" },
            { key: "color", label: "Color" },
            { key: "quantity", label: "Quantity", render: (row) => `${formatNumber(row.quantity)} ${row.unit}` },
            { key: "min_quantity", label: "Min Qty" },
            {
              key: "is_low_stock",
              label: "Status",
              render: (row) => <StatusBadge tone={row.is_low_stock ? "warning" : "success"}>{row.is_low_stock ? "Low" : "OK"}</StatusBadge>,
            },
            canManage
              ? {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" icon="edit" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      {user.role === "ADMIN" ? (
                        <Button type="button" variant="danger" size="sm" icon="delete" onClick={() => remove(row.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  ),
                }
              : { key: "empty", label: "" },
          ]}
          rows={filteredItems}
        />
      </SectionCard>

    </div>
  );
}
