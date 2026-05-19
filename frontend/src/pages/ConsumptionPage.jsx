import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import EntitySummaryCard from "../components/EntitySummaryCard";
import SectionCard from "../components/SectionCard";
import DataTable from "../components/DataTable";
import { Field, TextInput } from "../components/Field";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";
import Select from "react-select";

export default function ConsumptionPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const canLog = user.role === "ADMIN" || user.role === "CO_ADMIN";

  const [materials, setMaterials] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [logs, setLogs] = useState([]);

  const [rawForm, setRawForm] = useState({
    raw_material_id: "",
    qty_used: "",
    reason: "",
  });

  const [finishedForm, setFinishedForm] = useState({
    finished_good_id: "",
    qty_used: "",
    reason: "",
  });

  // ✅ Selected items (IMPORTANT optimization)
  const selectedRawMaterial = materials.find(
    (item) => String(item.id) === String(rawForm.raw_material_id)
  );

  const selectedFinishedGood = finishedGoods.find(
    (item) => String(item.id) === String(finishedForm.finished_good_id)
  );

  // ✅ Separate reason sets (FIXED)
  const rawReasons = ["Damaged", "Sample", "Wastage", "QC Reject"];
  const finishedReasons = ["Damage", "Sample", "Return", "Extra"];

  // Load data
  const load = useCallback(async () => {
    const [materialsResult, finishedGoodsResult, logsResult] =
      await Promise.all([
        api.getRawMaterials(token),
        api.getFinishedGoods(token),
        api.getConsumptionLogs(token),
      ]);

    setMaterials(materialsResult.data || []);
    setFinishedGoods(finishedGoodsResult.data || []);
    setLogs(logsResult.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "consumption");

  const submitRaw = async (e) => {
    e.preventDefault();

    const raw_material_id = Number(rawForm.raw_material_id);
    const qty_used = Number(rawForm.qty_used);
    const reason = rawForm.reason?.trim();

    if (!raw_material_id || !qty_used || qty_used <= 0 || !reason) {
      return showToast({
        tone: "error",
        title: "Invalid input",
        message: "Please fill all fields correctly.",
      });
    }

    try {
      await api.logConsumption(
        {
          type: "RAW",
          raw_material_id,
          qty_used,
          reason,
        },
        token
      );

      setRawForm({ raw_material_id: "", qty_used: "", reason: "" });
      await load();
      announceDataRefresh("consumption");

      showToast({
        tone: "success",
        title: "Success",
        message: "Raw material consumption logged.",
      });
    } catch (err) {
      console.log("RAW ERROR PAYLOAD ISSUE:", err);
      showToast({
        tone: "error",
        title: "Failed",
        message: err.message,
      });
    }
  };

  // FINISHED submit
  const submitFinished = async (e) => {
    e.preventDefault();

    const finished_good_id = Number(finishedForm.finished_good_id);
    const qty_used = Number(finishedForm.qty_used);
    const reason = finishedForm.reason?.trim();

    if (!finished_good_id || !qty_used || qty_used <= 0 || !reason) {
      return showToast({
        tone: "error",
        title: "Invalid input",
        message: "Please fill all fields correctly.",
      });
    }

    try {
      await api.logConsumption(
        {
          type: "FINISHED",
          finished_good_id,
          qty_used,
          reason,
        },
        token
      );

      setFinishedForm({ finished_good_id: "", qty_used: "", reason: "" });
      await load();
      announceDataRefresh("consumption");

      showToast({
        tone: "success",
        title: "Success",
        message: "Finished goods updated.",
      });
    } catch (err) {
      console.log("FINISHED ERROR PAYLOAD ISSUE:", err);
      showToast({
        tone: "error",
        title: "Failed",
        message: err.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* RAW MATERIAL SECTION */}
      {canLog && (
        <SectionCard
          title="Raw Material Consumption"
          subtitle="Track raw material usage"
          icon="consumption"
        >
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={submitRaw}
          >
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
                    .find(
                      (opt) =>
                        opt.value === String(rawForm.raw_material_id)
                    ) || null
                }
                onChange={(selected) =>
                  setRawForm((p) => ({
                    ...p,
                    raw_material_id: selected?.value || "",
                  }))
                }
                isClearable
                isSearchable
              />
            </Field>

            <Field label="Quantity">
              <TextInput
                type="number"
                value={rawForm.qty_used}
                onChange={(e) =>
                  setRawForm((p) => ({ ...p, qty_used: e.target.value }))
                }
              />
            </Field>

            <Field label="Reason">
              <TextInput
                value={rawForm.reason}
                onChange={(e) =>
                  setRawForm((p) => ({ ...p, reason: e.target.value }))
                }
              />
            </Field>

            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2">
              {rawReasons.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={rawForm.reason === r ? "primary" : "secondary"}
                  onClick={() =>
                    setRawForm((p) => ({ ...p, reason: r }))
                  }
                >
                  {r}
                </Button>
              ))}
            </div>

            {selectedRawMaterial && (
              <div className="md:col-span-2 xl:col-span-4">
                <EntitySummaryCard
                  title={selectedRawMaterial.name}
                  subtitle={selectedRawMaterial.article_code}
                  imageUrl={
                    selectedRawMaterial.image_url
                      ? `${APP_BASE_URL}${selectedRawMaterial.image_url}`
                      : null
                  }
                  metrics={[
                    {
                      label: "Stock",
                      value: `${formatNumber(
                        selectedRawMaterial.quantity
                      )} ${selectedRawMaterial.unit}`,
                    },
                  ]}
                />
              </div>
            )}

            <Button type="submit">Save</Button>
          </form>
        </SectionCard>
      )}

      {/* FINISHED GOODS SECTION */}
      <SectionCard
        title="Finished Goods Consumption"
        subtitle="Deduct finished stock"
        icon="stock"
      >
        <form
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={submitFinished}
        >
          <Field label="Finished Product">
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
                  .find(
                    (opt) =>
                      opt.value === String(finishedForm.finished_good_id)
                  ) || null
              }
              onChange={(selected) =>
                setFinishedForm((p) => ({
                  ...p,
                  finished_good_id: selected?.value || "",
                }))
              }
              isClearable
              isSearchable
            />
          </Field>

          <Field label="Quantity">
            <TextInput
              type="number"
              value={finishedForm.qty_used}
              onChange={(e) =>
                setFinishedForm((p) => ({
                  ...p,
                  qty_used: e.target.value,
                }))
              }
            />
          </Field>

          <Field label="Reason">
            <TextInput
              value={finishedForm.reason}
              onChange={(e) =>
                setFinishedForm((p) => ({
                  ...p,
                  reason: e.target.value,
                }))
              }
            />
          </Field>

          <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2">
            {finishedReasons.map((r) => (
              <Button
                key={r}
                type="button"
                variant={
                  finishedForm.reason === r ? "primary" : "secondary"
                }
                onClick={() =>
                  setFinishedForm((p) => ({ ...p, reason: r }))
                }
              >
                {r}
              </Button>
            ))}
          </div>

          {selectedFinishedGood && (
            <div className="md:col-span-2 xl:col-span-4">
              <EntitySummaryCard
                title={selectedFinishedGood.name}
                subtitle={selectedFinishedGood.article_code}
                imageUrl={
                  selectedFinishedGood.image_url
                    ? `${APP_BASE_URL}${selectedFinishedGood.image_url}`
                    : null
                }
                metrics={[
                  {
                    label: "Stock",
                    value: `${formatNumber(
                      selectedFinishedGood.quantity
                    )} ${selectedFinishedGood.unit}`,
                  },
                ]}
              />
            </div>
          )}

          <Button type="submit">Deduct Stock</Button>
        </form>
      </SectionCard>

      {/* HISTORY */}
      <SectionCard title="Consumption History" icon="stock">
        <DataTable
          columns={[
            { 
              key: "type", 
              label: "Type",
              render: (row) => (
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  row.type === "RAW" 
                    ? "bg-blue-100 text-blue-700" 
                    : "bg-green-100 text-green-700"
                }`}>
                  {row.type === "RAW" ? "Raw Material" : "Finished Good"}
                </span>
              )
            },
            { key: "name", label: "Item" },
            { key: "article_code", label: "Code" },
            { 
              key: "qty_used", 
              label: "Quantity Used",
              render: (row) => `${formatNumber(row.qty_used)} ${row.unit || "pcs"}`
            },
            { key: "reason", label: "Reason" },
            { 
              key: "created_at", 
              label: "Date", 
              type: "date" 
            },
          ]}
          rows={logs}
        />
      </SectionCard>
    </div>
  );
}