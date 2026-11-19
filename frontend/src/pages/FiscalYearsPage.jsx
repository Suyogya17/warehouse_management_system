import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";

const emptyForm = {
  code: "",
  bs_start_date: "",
  bs_end_date: "",
  ad_start_date: "",
  ad_end_date: "",
};

const statusTone = {
  ACTIVE: "success",
  FUTURE: "info",
  CLOSED: "neutral",
};

export default function FiscalYearsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [years, setYears] = useState([]);
  const [available, setAvailable] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getFiscalYears(token);
    setAvailable(result.management_available !== false);
    setYears(result.data || []);
  }, [token]);

  useEffect(() => {
    load().catch((error) =>
      showToast({ tone: "error", title: "Fiscal years failed to load", message: error.message })
    );
  }, [load, showToast]);

  const activeYear = useMemo(
    () => years.find((year) => year.status === "ACTIVE") || null,
    [years]
  );

  const createYear = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await api.createFiscalYear(form, token);
      setYears(result.data || []);
      setForm(emptyForm);
      showToast({ tone: "success", title: "Fiscal year created", message: result.message });
    } catch (error) {
      showToast({ tone: "error", title: "Could not create fiscal year", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const updateState = async (year, payload) => {
    const action = payload.status === "ACTIVE"
      ? `activate ${year.code}`
      : payload.is_locked === false
        ? `reopen ${year.code}`
        : payload.is_locked === true
          ? `lock ${year.code}`
          : `close ${year.code}`;
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;

    try {
      setBusy(true);
      const result = await api.updateFiscalYearState(year.id, payload, token);
      setYears(result.data || []);
      showToast({ tone: "success", title: "Fiscal year updated", message: result.message });
    } catch (error) {
      showToast({ tone: "error", title: "Update failed", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const backfill = async () => {
    if (!window.confirm("Assign fiscal years to existing orders, production, consumption, warehouse, and audit records?")) return;
    try {
      setBusy(true);
      const result = await api.backfillFiscalYears(token);
      await load();
      showToast({ tone: "success", title: "Historical data updated", message: result.message });
    } catch (error) {
      showToast({ tone: "error", title: "Backfill failed", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounting periods"
        title="Fiscal Year Management"
        description="Use one shared Nepali fiscal-year calendar for orders, production, consumption, warehouse movements, and reports. New transactions cannot be posted into a locked year."
        icon="ledger"
        actions={<Button variant="secondary" onClick={backfill} disabled={busy || !available}>Backfill existing data</Button>}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>Current active year:</span>
          <StatusBadge tone={activeYear ? "success" : "danger"}>{activeYear?.code || "None"}</StatusBadge>
          <span>{activeYear ? `AD ${activeYear.ad_start_date} to ${activeYear.ad_end_date}` : "Activate one year before entering transactions."}</span>
        </div>
      </PageHeader>

      {!available ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Apply migration <strong>0003_fiscal_year_management.sql</strong>, then reload this page.
        </div>
      ) : null}

      <SectionCard title="Registered fiscal years" subtitle="Activating a new year atomically closes and locks the previous active year." icon="ledger">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Fiscal year</th>
                <th className="px-5 py-3">BS range</th>
                <th className="px-5 py-3">AD range</th>
                <th className="px-5 py-3">Orders</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {years.map((year) => (
                <tr key={year.id}>
                  <td className="px-5 py-4 font-semibold text-slate-900">{year.code}</td>
                  <td className="px-5 py-4 text-slate-600">{year.bs_start_date} – {year.bs_end_date}</td>
                  <td className="px-5 py-4 text-slate-600">{year.ad_start_date} – {year.ad_end_date}</td>
                  <td className="px-5 py-4 text-slate-600">{Number(year.order_count || 0).toLocaleString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={statusTone[year.status]}>{year.status}</StatusBadge>
                      <StatusBadge tone={Number(year.is_locked) === 1 ? "warning" : "success"}>
                        {Number(year.is_locked) === 1 ? "Locked" : "Open"}
                      </StatusBadge>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {year.status !== "ACTIVE" ? (
                        <Button size="sm" onClick={() => updateState(year, { status: "ACTIVE" })} disabled={busy}>Activate</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => updateState(year, { status: "CLOSED" })} disabled={busy}>Close year</Button>
                      )}
                      {year.status === "CLOSED" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateState(year, { status: "CLOSED", is_locked: Number(year.is_locked) !== 1 })}
                          disabled={busy}
                        >
                          {Number(year.is_locked) === 1 ? "Reopen" : "Lock"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!years.length ? (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No fiscal years are registered.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Add the next fiscal year" subtitle="Enter the official BS and corresponding AD boundaries. Overlapping ranges are rejected." icon="spark">
        <form onSubmit={createYear} className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["code", "Fiscal year code", "2084/85", "text"],
            ["bs_start_date", "BS start", "2084-04-01", "text"],
            ["bs_end_date", "BS end", "2085-03-31", "text"],
            ["ad_start_date", "AD start", "", "date"],
            ["ad_end_date", "AD end", "", "date"],
          ].map(([name, label, placeholder, type]) => (
            <label key={name} className="text-sm font-medium text-slate-700">
              {label}
              <input
                required
                type={type}
                value={form[name]}
                placeholder={placeholder}
                onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
          ))}
          <div className="md:col-span-2 xl:col-span-5">
            <Button type="submit" disabled={busy || !available}>{busy ? "Saving..." : "Create future fiscal year"}</Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
