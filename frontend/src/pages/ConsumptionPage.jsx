import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import EntitySummaryCard from "../components/EntitySummaryCard";
import SectionCard from "../components/SectionCard";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";
import Select from "react-select";

export default function ConsumptionPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canLog = user.role === "ADMIN";
  const [materials, setMaterials] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ raw_material_id: "", qty_used: "", reason: "" });
  const selectedMaterial = materials.find((item) => String(item.id) === String(form.raw_material_id));
  const commonReasons = ["Damaged", "Sample", "Wastage", "QC Reject"];

  const load = useCallback(async () => {
    const [materialsResult, logsResult] = await Promise.all([api.getRawMaterials(token), api.getConsumptionLogs(token)]);
    setMaterials(materialsResult.data || []);
    setLogs(logsResult.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "consumption");

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.logConsumption(
        {
          raw_material_id: Number(form.raw_material_id),
          qty_used: Number(form.qty_used),
          reason: form.reason,
        },
        token
      );
      setForm({ raw_material_id: "", qty_used: "", reason: "" });
      await load();
      announceDataRefresh("consumption");
      showToast({ tone: "success", title: "Consumption logged", message: "Stock and consumption history were refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Consumption failed", message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* <PageHeader
        eyebrow="Usage tracking"
        title="Consumption"
        description="Record non-production deductions such as wastage, samples, and QC-related material losses."
        icon="consumption"
      /> */}

      {canLog ? (
        <SectionCard title="Log material consumption" subtitle="Use this for damaged, sample, wastage, or manual consumption events." icon="consumption">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
            <Field label="Raw material">
             <Select
  options={materials.map((item) => ({
    value: String(item.id),
    label: `${item.name} (${item.article_code})`,
  }))}

  value={
    materials
      .map((item) => ({
        value: String(item.id),
        label: `${item.name} (${item.article_code})`,
      }))
      .find((opt) => opt.value === String(form.raw_material_id)) || null
  }

  onChange={(selected) =>
    setForm((current) => ({
      ...current,
      raw_material_id: selected?.value || "",
    }))
  }

  placeholder="Search material..."
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
            <Field label="Quantity used">
              <TextInput
                type="number"
                min="1"
                value={form.qty_used}
                onChange={(event) => setForm((current) => ({ ...current, qty_used: event.target.value }))}
                required
              />
            </Field>
            <div className="xl:col-span-2">
            <Field label="Reason">
              <TextInput
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Damaged, Sample, Wastage, QC Reject"
              />
            </Field>
            </div>
            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2">
              {commonReasons.map((reason) => (
                <Button
                  key={reason}
                  type="button"
                  variant={form.reason === reason ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setForm((current) => ({ ...current, reason }))}
                >
                  {reason}
                </Button>
              ))}
            </div>
            {selectedMaterial ? (
              <div className="md:col-span-2 xl:col-span-4">
                <EntitySummaryCard
                  title={selectedMaterial.name}
                  subtitle={`Article code: ${selectedMaterial.article_code}`}
                  imageUrl={selectedMaterial.image_url ? `${APP_BASE_URL}${selectedMaterial.image_url}` : null}
                  metrics={[
                    { label: "Category", value: selectedMaterial.category || "-" },
                    { label: "Color", value: selectedMaterial.color || "-" },
                    { label: "Current stock", value: `${formatNumber(selectedMaterial.quantity)} ${selectedMaterial.unit}` },
                    { label: "Unit", value: selectedMaterial.unit || "-" },
                  ]}
                  description="Confirm the material and quantity here before saving the consumption entry."
                />
              </div>
            ) : null}
            <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
              <Button type="submit" icon="check">
                Save consumption
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Consumption history" subtitle="Track how much raw material has been used." icon="stock">
        <DataTable
          columns={[
            { key: "name", label: "Material" },
            { key: "article_code", label: "Article Code" },
            { key: "qty_used", label: "Used", render: (row) => `${formatNumber(row.qty_used)} ${row.unit}` },
            { key: "reason", label: "Reason" },
            { key: "logged_by_name", label: "Logged By" },
            { key: "created_at", label: "Created", type: "date" },
          ]}
          rows={logs}
        />
      </SectionCard>
    </div>
  );
}
