import { useEffect, useState } from "react";
import Button from "../components/Button";
import SectionCard from "../components/SectionCard";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api, APP_BASE_URL } from "../services/api";
import { formatDate, formatNumber } from "../utils/format";

export default function ReceiveStockPage() {
  const { token } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ raw_material_id: "", qty_added: "", notes: "" });
  const selectedMaterial = materials.find((item) => String(item.id) === String(form.raw_material_id));

  const loadMaterials = async () => {
    const result = await api.getRawMaterials(token);
    setMaterials(result.data || []);
  };

  const loadBatches = async (materialId) => {
    if (!materialId) {
      setBatches([]);
      return;
    }

    const result = await api.getBatches(materialId, token);
    setBatches(result.data || []);
  };

  useEffect(() => {
    loadMaterials().catch(console.error);
  }, [token]);

  useEffect(() => {
    loadBatches(selectedId).catch(console.error);
  }, [selectedId, token]);

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
      setMessage("Purchase stock received successfully and stock updated immediately.");
      setSelectedId(materialId);
      await loadMaterials();
      await loadBatches(materialId);
      setForm({ raw_material_id: "", qty_added: "", notes: "" });
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbound stock"
        title="Purchase and receive stock"
        description="Capture incoming batches with quantities, notes, and material context to preserve FIFO stock accuracy."
        icon="purchase"
      />

      <SectionCard title="Purchase and receive stock" subtitle="Record cartons of uppers, kg of sole compounds, finished soles, and packing materials." icon="purchase">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <Field label="Raw material">
            <SelectInput
              value={form.raw_material_id}
              onChange={(event) => setForm((current) => ({ ...current, raw_material_id: event.target.value }))}
              required
            >
              <option value="">Select material</option>
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.article_code})
                </option>
              ))}
            </SelectInput>
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
            {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Purchase batch history" subtitle="Review stock batches for any raw material." icon="stock">
        <div className="mb-5 max-w-sm">
          <SelectInput
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Choose a raw material to view its batches</option>
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.article_code})
              </option>
            ))}
          </SelectInput>
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
    </div>
  );
}
