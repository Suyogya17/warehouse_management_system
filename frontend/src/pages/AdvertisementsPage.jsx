import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";

const initialForm = {
  title: "",
  message: "",
  link_url: "",
  is_active: true,
  placement: "BELOW_STATUS",
  width_percent: 100,
  height_px: 320,
  display_order: 0,
  starts_at: "",
  ends_at: "",
  image: null,
};

const toLocalInput = (value) => (value ? String(value).replace(" ", "T").slice(0, 16) : "");

const toFormData = (form) => {
  const data = new FormData();
  Object.entries(form).forEach(([key, value]) => {
    if (key === "image") {
      if (value) data.append(key, value);
      return;
    }
    data.append(key, value ?? "");
  });
  return data;
};

export default function AdvertisementsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState(null);

  const load = useCallback(async () => {
    const result = await api.getAdvertisements(token);
    setItems(result.data || []);
  }, [token]);

  useEffect(() => { load().catch(console.error); }, [load]);
  useDataRefresh(load, "advertisements");

  const reset = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.ends_at && form.starts_at && form.ends_at < form.starts_at) {
      showToast({ tone: "error", title: "Invalid schedule", message: "End time must be after start time." });
      return;
    }

    try {
      setSaving(true);
      const payload = toFormData(form);
      if (editingId) await api.updateAdvertisement(editingId, payload, token);
      else await api.createAdvertisement(payload, token);
      reset();
      await load();
      announceDataRefresh("advertisements");
      showToast({ tone: "success", title: editingId ? "Advertisement updated" : "Advertisement created", message: "The user dashboard was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Advertisement save failed", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      message: item.message || "",
      link_url: item.link_url || "",
      is_active: Number(item.is_active) === 1,
      placement: item.placement || "BELOW_STATUS",
      width_percent: Number(item.width_percent || 100),
      height_px: Number(item.height_px || 320),
      display_order: Number(item.display_order || 0),
      starts_at: toLocalInput(item.starts_at),
      ends_at: toLocalInput(item.ends_at),
      image: null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete advertisement “${item.title}”?`)) return;
    try {
      await api.deleteAdvertisement(item.id, token);
      await load();
      announceDataRefresh("advertisements");
      showToast({ tone: "success", title: "Advertisement deleted", message: "It was removed from the dashboard." });
    } catch (error) {
      showToast({ tone: "error", title: "Delete failed", message: error.message });
    }
  };

  const dropAdvertisement = async (targetId) => {
    if (!draggedId || Number(draggedId) === Number(targetId)) return;
    const fromIndex = items.findIndex((item) => Number(item.id) === Number(draggedId));
    const toIndex = items.findIndex((item) => Number(item.id) === Number(targetId));
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setItems(reordered.map((item, index) => ({ ...item, display_order: index + 1 })));
    setDraggedId(null);

    try {
      await api.reorderAdvertisements(reordered.map((item) => item.id), token);
      announceDataRefresh("advertisements");
      showToast({ tone: "success", title: "Order updated", message: "The carousel sequence was saved." });
    } catch (error) {
      await load();
      showToast({ tone: "error", title: "Reorder failed", message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Customer communication" title="Advertisements" description="Create and schedule banners for the user dashboard." icon="image" />

      <SectionCard title={editingId ? "Edit advertisement" : "Create advertisement"} subtitle="Use a wide banner image for the best result." icon="image">
        <form onSubmit={submit} className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Title"><TextInput value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} required /></Field>
          <Field label="Link (optional)"><TextInput type="url" placeholder="https://..." value={form.link_url} onChange={(e) => setForm((c) => ({ ...c, link_url: e.target.value }))} /></Field>
          <Field label="Start date"><TextInput type="datetime-local" value={form.starts_at} onChange={(e) => setForm((c) => ({ ...c, starts_at: e.target.value }))} /></Field>
          <Field label="End date"><TextInput type="datetime-local" value={form.ends_at} onChange={(e) => setForm((c) => ({ ...c, ends_at: e.target.value }))} /></Field>
          <Field label="Message"><TextAreaInput value={form.message} onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))} /></Field>
          <Field label="Banner image or video" hint="Use JPG/PNG images or MP4/WebM videos."><input type="file" accept="image/*,video/mp4,video/webm" onChange={(e) => setForm((c) => ({ ...c, image: e.target.files?.[0] || null }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></Field>
          <Field label="Display order"><TextInput type="number" min="0" value={form.display_order} onChange={(e) => setForm((c) => ({ ...c, display_order: e.target.value }))} /></Field>
          <Field label="Dashboard position">
            <SelectInput value={form.placement} onChange={(e) => setForm((c) => ({ ...c, placement: e.target.value }))}>
              <option value="ABOVE_STATUS">Above status cards</option>
              <option value="BELOW_STATUS">Below status cards</option>
            </SelectInput>
          </Field>
          <Field label="Banner width (%)" hint="Between 50% and 100% of the dashboard.">
            <TextInput type="number" min="50" max="100" step="5" value={form.width_percent} onChange={(e) => setForm((c) => ({ ...c, width_percent: e.target.value }))} required />
          </Field>
          <Field label="Banner height (px)" hint="Between 180px and 600px.">
            <TextInput type="number" min="180" max="600" step="10" value={form.height_px} onChange={(e) => setForm((c) => ({ ...c, height_px: e.target.value }))} required />
          </Field>
          <Field label="Status"><label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((c) => ({ ...c, is_active: e.target.checked }))} className="h-4 w-4 accent-indigo-600" /> Active</label></Field>
          <div className="flex gap-3 md:col-span-2 xl:col-span-4"><Button type="submit" icon="check" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create advertisement"}</Button>{editingId && <Button type="button" variant="secondary" onClick={reset}>Cancel</Button>}</div>
        </form>
      </SectionCard>

      <SectionCard title="All advertisements" subtitle="Drag cards to set their carousel order." icon="image">
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropAdvertisement(item.id)}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${Number(draggedId) === Number(item.id) ? "border-indigo-400 opacity-50" : "border-slate-200 hover:border-indigo-300"}`}
            >
              {item.image_url ? (
                item.media_type === "VIDEO" ? (
                  <video src={`${APP_BASE_URL}${item.image_url}`} controls preload="metadata" className="aspect-[16/5] w-full bg-black object-cover" />
                ) : (
                  <img src={`${APP_BASE_URL}${item.image_url}`} alt={item.title} className="aspect-[16/5] w-full object-cover" />
                )
              ) : <div className="flex aspect-[16/5] items-center justify-center bg-slate-100 text-sm text-slate-400">No banner media</div>}
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="cursor-grab select-none">⋮⋮ Drag to reorder</span>
                  <span>Position {item.display_order || 0}</span>
                </div>
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-sm text-slate-500">{item.message || "No message"}</p></div><StatusBadge tone={Number(item.is_active) === 1 ? "success" : "neutral"}>{Number(item.is_active) === 1 ? "Active" : "Inactive"}</StatusBadge></div>
                <p className="text-xs text-slate-500">{item.placement === "ABOVE_STATUS" ? "Above status cards" : "Below status cards"} · {item.width_percent || 100}% wide × {item.height_px || 320}px high · {item.starts_at ? `Starts ${new Date(item.starts_at).toLocaleString()}` : "Starts immediately"} · {item.ends_at ? `Ends ${new Date(item.ends_at).toLocaleString()}` : "No end date"}</p>
                <div className="flex gap-2"><Button size="sm" variant="secondary" icon="edit" onClick={() => edit(item)}>Edit</Button><Button size="sm" variant="danger" icon="delete" onClick={() => remove(item)}>Delete</Button></div>
              </div>
            </article>
          ))}
          {!items.length && <p className="p-6 text-sm text-slate-500">No advertisements yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
