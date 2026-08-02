import { useMemo } from "react";
import Button from "../../components/Button";
import { getRoundedCartons } from "../../utils/displayStock";
import { formatNumber } from "../../utils/format";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  getCartonAllocations,
  getPercentageAllocations,
} from "./offerUtils";

const formatPercentage = (value) =>
  formatNumber(Math.round(Number(value || 0) * 100) / 100);

export default function OfferEditor({
  editing,
  form,
  setForm,
  customers,
  saving,
  onClose,
  onSave,
}) {
  const percentageTargets = useMemo(
    () =>
      form.offer_target_user_ids.map((userId) => ({
        user_id: Number(userId),
        percentage: form.offer_target_percentages[userId],
      })),
    [form.offer_target_percentages, form.offer_target_user_ids]
  );
  const cartonTargets = useMemo(
    () =>
      form.offer_target_user_ids.map((userId) => ({
        user_id: Number(userId),
        cartons: form.offer_target_cartons?.[userId],
      })),
    [form.offer_target_cartons, form.offer_target_user_ids]
  );
  const divisionMode = form.offer_division_mode || "PERCENTAGE";
  const allocations = useMemo(
    () =>
      divisionMode === "CTN"
        ? getCartonAllocations(editing, cartonTargets)
        : getPercentageAllocations(editing, percentageTargets),
    [cartonTargets, divisionMode, editing, percentageTargets]
  );
  const selectedPercentageTotal = [...allocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.percentage || 0),
    0
  );
  const hasZeroPercentageAllocation = form.offer_target_user_ids.some(
    (userId) => Number(allocations.get(Number(userId))?.cartons || 0) <= 0
  );
  const totalPairs = Number(editing?.quantity || 0);
  const pairsPerCarton = Number(editing?.inner_boxes_per_outer_box || 0);
  const totalCartons = getRoundedCartons(
    totalPairs,
    pairsPerCarton
  );
  const assignedCartons = [...allocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.cartons || 0),
    0
  );
  const assignedPairs = [...allocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.pairs || 0),
    0
  );
  const leftCartons = Math.max(0, totalCartons - assignedCartons);
  const leftPairs = Math.max(0, totalPairs - assignedPairs);
  const allocationExceedsStock = assignedCartons > totalCartons;

  if (!editing) return null;

  const submit = (event) => {
    event.preventDefault();
    const offerTargets = form.offer_target_user_ids.map((userId) => {
      const allocation = allocations.get(Number(userId));
      const percentage = form.offer_target_percentages[userId];
      return {
        user_id: Number(userId),
        display_quantity: Number(allocation?.pairs || 0),
        display_percentage:
          divisionMode === "CTN"
            ? Number(allocation?.percentage || 0)
            : percentage === "" || percentage === undefined
              ? null
              : Number(percentage),
      };
    });
    onSave(offerTargets);
  };

  const changeDivisionMode = (nextMode) => {
    if (nextMode === divisionMode) return;
    if (nextMode === "CTN") {
      setForm((current) => ({
        ...current,
        offer_division_mode: nextMode,
        offer_target_cartons: Object.fromEntries(
          current.offer_target_user_ids.map((userId) => [
            Number(userId),
            Number(allocations.get(Number(userId))?.cartons || 0),
          ])
        ),
      }));
    } else {
      setForm((current) => ({
        ...current,
        offer_division_mode: nextMode,
        offer_target_percentages: Object.fromEntries(
          current.offer_target_user_ids.map((userId) => [
            Number(userId),
            Number(
              allocations.get(Number(userId))?.percentage || 0
            ).toFixed(2),
          ])
        ),
      }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={onClose}
    >
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">
              Offer for {editing.article_code || editing.name}
            </h2>
            <p className="text-sm text-slate-500">
              Divide the offer by percentage or whole CTN. Both values remain
              visible for every selected user.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-indigo-50 p-3">
            <p className="text-[10px] font-bold uppercase text-indigo-500">
              Total product
            </p>
            <p className="font-bold text-indigo-900">
              {formatNumber(totalCartons)} CTN
            </p>
            <p className="text-xs text-indigo-700">
              {formatNumber(totalPairs)} pairs
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-600">
              Assigned
            </p>
            <p className="font-bold text-emerald-900">
              {formatNumber(assignedCartons)} CTN
            </p>
            <p className="text-xs text-emerald-700">
              {formatNumber(assignedPairs)} pairs
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[10px] font-bold uppercase text-amber-600">
              Left
            </p>
            <p className="font-bold text-amber-900">
              {formatNumber(leftCartons)} CTN
            </p>
            <p className="text-xs text-amber-700">
              {formatNumber(leftPairs)} pairs
            </p>
          </div>
        </div>

        <label className="block text-sm font-semibold">
          Offer label
          <input
            maxLength="120"
            value={form.offer_label}
            onChange={(event) =>
              setForm({ ...form, offer_label: event.target.value })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold">
          End date (optional)
          <input
            type="datetime-local"
            value={form.offer_ends_at}
            onChange={(event) =>
              setForm({ ...form, offer_ends_at: event.target.value })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>

        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">
            Who can see this offer?
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={form.offer_all_users}
              onChange={() =>
                setForm({
                  ...form,
                  offer_all_users: true,
                  offer_target_user_ids: [],
                  offer_target_quantities: {},
                  offer_target_percentages: {},
                  offer_target_cartons: {},
                })
              }
            />
            All users (normal display limit)
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={!form.offer_all_users}
              onChange={() => setForm({ ...form, offer_all_users: false })}
            />
            Selected users with personalized quantities
          </label>

          {!form.offer_all_users ? (
            <div className="mt-3">
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 p-1">
                <button
                  type="button"
                  onClick={() => changeDivisionMode("PERCENTAGE")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "PERCENTAGE"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by percentage
                </button>
                <button
                  type="button"
                  onClick={() => changeDivisionMode("CTN")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "CTN"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by CTN
                </button>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
                {customers.length ? (
                  customers.map((customer) => {
                    const userId = Number(customer.id);
                    const checked =
                      form.offer_target_user_ids.includes(userId);
                    const defaultPercentage =
                      OFFER_PERCENTAGES_BY_EMAIL[
                        String(customer.email || "").trim().toLowerCase()
                      ];
                    const configuredPercentage =
                      form.offer_target_percentages[userId] ??
                      defaultPercentage ??
                      "";
                    const allocation = allocations.get(userId);

                    return (
                      <div
                        key={customer.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_130px] items-center gap-2 rounded-lg bg-white px-2 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((current) => ({
                              ...current,
                              offer_target_user_ids: checked
                                ? current.offer_target_user_ids.filter(
                                    (id) => Number(id) !== userId
                                  )
                                : [...current.offer_target_user_ids, userId],
                              offer_target_percentages: checked
                                ? current.offer_target_percentages
                                : {
                                    ...current.offer_target_percentages,
                                    [userId]: configuredPercentage,
                                  },
                              offer_target_cartons: checked
                                ? current.offer_target_cartons
                                : {
                                    ...current.offer_target_cartons,
                                    [userId]:
                                      current.offer_target_cartons?.[userId] ||
                                      1,
                                  },
                            }))
                          }
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {customer.name || customer.email}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {customer.email}
                          </p>
                          {checked && allocation ? (
                            <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                              {formatPercentage(allocation.percentage)}% ·{" "}
                              {formatNumber(allocation.cartons)} CTN ·{" "}
                              {formatNumber(allocation.pairs)} pairs
                            </p>
                          ) : null}
                        </div>
                        <label className="text-[11px] font-semibold uppercase text-slate-500">
                          {divisionMode === "CTN" ? "CTN" : "Percentage"}
                          <input
                            type="number"
                            min={divisionMode === "CTN" ? "1" : "0.01"}
                            max={
                              divisionMode === "CTN" ? totalCartons : "100"
                            }
                            step={divisionMode === "CTN" ? "1" : "0.01"}
                            required={checked}
                            disabled={!checked}
                            value={
                              checked
                                ? divisionMode === "CTN"
                                  ? form.offer_target_cartons?.[userId] ?? ""
                                  : configuredPercentage
                                : ""
                            }
                            onChange={(event) =>
                              setForm((current) =>
                                divisionMode === "CTN"
                                  ? {
                                      ...current,
                                      offer_target_cartons: {
                                        ...current.offer_target_cartons,
                                        [userId]: event.target.value,
                                      },
                                    }
                                  : {
                                      ...current,
                                      offer_target_percentages: {
                                        ...current.offer_target_percentages,
                                        [userId]: event.target.value,
                                      },
                                    }
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                          />
                        </label>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">
                    No user accounts found.
                  </p>
                )}
              </div>

              <div
                className={`mt-3 rounded-xl px-3 py-3 text-xs font-semibold ${
                  selectedPercentageTotal > 100 || allocationExceedsStock
                    ? "bg-red-50 text-red-700"
                    : "bg-indigo-50 text-indigo-700"
                }`}
              >
                <p>
                  Total assigned:{" "}
                  {formatPercentage(selectedPercentageTotal)}% ·{" "}
                  {formatNumber(assignedCartons)} CTN ·{" "}
                  {formatNumber(assignedPairs)} pairs
                </p>
                <p className="mt-1">
                  Total left:{" "}
                  {formatPercentage(
                    Math.max(0, 100 - selectedPercentageTotal)
                  )}
                  % · {formatNumber(leftCartons)} CTN ·{" "}
                  {formatNumber(leftPairs)} pairs
                </p>
              </div>
              {allocationExceedsStock ? (
                <p className="mt-2 px-2 text-xs font-semibold text-red-600">
                  Assigned CTN cannot exceed the total product CTN.
                </p>
              ) : null}
              {hasZeroPercentageAllocation ? (
                <p className="mt-2 px-2 text-xs font-semibold text-red-600">
                  Every selected user needs at least 1 CTN.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              selectedPercentageTotal > 100 ||
              allocationExceedsStock ||
              hasZeroPercentageAllocation
            }
          >
            {saving ? "Saving..." : "Publish offer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
