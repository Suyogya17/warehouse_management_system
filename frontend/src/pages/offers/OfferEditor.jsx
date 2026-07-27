import { useMemo } from "react";
import Button from "../../components/Button";
import { getRoundedCartons } from "../../utils/displayStock";
import { formatNumber } from "../../utils/format";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  getPercentageAllocations,
} from "./offerUtils";

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
  const percentageAllocations = useMemo(
    () => getPercentageAllocations(editing, percentageTargets),
    [editing, percentageTargets]
  );
  const selectedPercentageTotal = percentageTargets.reduce(
    (sum, target) => sum + Number(target.percentage || 0),
    0
  );
  const hasZeroPercentageAllocation = [
    ...percentageAllocations.values(),
  ].some((allocation) => allocation.pairs <= 0);
  const totalPairs = Number(editing?.quantity || 0);
  const totalCartons = getRoundedCartons(
    totalPairs,
    editing?.inner_boxes_per_outer_box
  );

  if (!editing) return null;

  const submit = (event) => {
    event.preventDefault();
    const offerTargets = form.offer_target_user_ids.map((userId) => {
      const allocation = percentageAllocations.get(Number(userId));
      const percentage = form.offer_target_percentages[userId];
      return {
        user_id: Number(userId),
        display_quantity: Number(
          allocation
            ? allocation.pairs
            : form.offer_target_quantities[userId] || 0
        ),
        display_percentage:
          percentage === "" || percentage === undefined
            ? null
            : Number(percentage),
      };
    });
    onSave(offerTargets);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={onClose}
    >
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">
              Offer for {editing.article_code || editing.name}
            </h2>
            <p className="text-sm text-slate-500">
              Choose each user and the maximum quantity that user can see and
              order.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                Total CTN
              </p>
              <p className="text-lg font-bold text-indigo-800">
                {formatNumber(totalCartons)}
              </p>
            </div>
            <div className="border-l border-indigo-200 pl-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                Total pairs
              </p>
              <p className="text-lg font-bold text-indigo-800">
                {formatNumber(totalPairs)}
              </p>
            </div>
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
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
              {customers.length ? (
                customers.map((customer) => {
                  const userId = Number(customer.id);
                  const checked = form.offer_target_user_ids.includes(userId);
                  const defaultPercentage =
                    OFFER_PERCENTAGES_BY_EMAIL[
                      String(customer.email || "").trim().toLowerCase()
                    ];
                  const configuredPercentage =
                    form.offer_target_percentages[userId] ??
                    defaultPercentage ??
                    "";
                  const percentageAllocation =
                    percentageAllocations.get(userId);
                  const assignedPairs =
                    percentageAllocation?.pairs ??
                    form.offer_target_quantities[userId] ??
                    "";

                  return (
                    <div
                      key={customer.id}
                      className="grid grid-cols-[auto_1fr_140px] items-center gap-2 rounded-lg bg-white px-2 py-2"
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
                            offer_target_quantities: checked
                              ? current.offer_target_quantities
                              : {
                                  ...current.offer_target_quantities,
                                  [userId]:
                                    percentageAllocation?.pairs ||
                                    current.offer_target_quantities[userId] ||
                                    450,
                                },
                            offer_target_percentages: checked
                              ? current.offer_target_percentages
                              : {
                                  ...current.offer_target_percentages,
                                  [userId]: configuredPercentage,
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
                        {percentageAllocation ? (
                          <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                            {formatNumber(percentageAllocation.cartons)} CTN ·{" "}
                            {formatNumber(percentageAllocation.pairs)} pairs
                          </p>
                        ) : null}
                      </div>
                      <div>
                        {defaultPercentage !== undefined ||
                        form.offer_target_percentages[userId] !== undefined ? (
                          <label className="text-[11px] font-semibold text-slate-500">
                            Percentage
                            <input
                              type="number"
                              min="0.01"
                              max="100"
                              step="0.01"
                              required={checked}
                              disabled={!checked}
                              value={checked ? configuredPercentage : ""}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  offer_target_percentages: {
                                    ...current.offer_target_percentages,
                                    [userId]: event.target.value,
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                            />
                          </label>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required={checked}
                            disabled={!checked}
                            value={checked ? assignedPairs : ""}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                offer_target_quantities: {
                                  ...current.offer_target_quantities,
                                  [userId]: event.target.value,
                                },
                              }))
                            }
                            placeholder="Pairs"
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">
                  No user accounts found.
                </p>
              )}
              {selectedPercentageTotal > 0 ? (
                <p
                  className={`px-2 text-xs font-semibold ${
                    selectedPercentageTotal > 100
                      ? "text-red-600"
                      : "text-slate-500"
                  }`}
                >
                  Selected percentage total:{" "}
                  {formatNumber(selectedPercentageTotal)}%
                  {selectedPercentageTotal > 100
                    ? " (must not exceed 100%)"
                    : ""}
                </p>
              ) : null}
              {hasZeroPercentageAllocation ? (
                <p className="px-2 text-xs font-semibold text-red-600">
                  There are not enough cartons to give every selected user at
                  least 1 CTN. Select fewer users or increase the stock.
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
