import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { formatNumber, formatPrice } from "../utils/format";
import { PRODUCT_VISIBILITY_PAGE_KEY } from "../utils/pagePermissions";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
  country_code: "NP",
  currency_code: "NPR",
  exchange_rate: 1,
  regular_price_markup: 0,
  percentage_product_markup: 0,
  non_commission_product_markup: 0,
  account_relationship: "INDEPENDENT",
  parent_dealer_id: "",
  parent_allocation_percentage: 25,
  product_access_template: "NONE",
  copy_product_access_from_user_id: "",
};

const countries = [
  { code: "NP", name: "Nepal", currency: "NPR" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
];

const currencies = ["NPR", "INR", "CNY", "USD", "GBP"];

const defaultExchangeRates = {
  NPR: 1,
  INR: 1.6,
};

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [pagePermissions, setPagePermissions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    const [usersResult, pagePermissionsResult] = await Promise.all([
      api.getUsers(token),
      currentUser?.role === "ADMIN"
        ? api.getPagePermissions(token)
        : Promise.resolve({ data: [] }),
    ]);

    setUsers(usersResult.data || []);
    setPagePermissions(pagePermissionsResult.data || []);
  }, [currentUser?.role, token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "users");

  const submit = async (event) => {
    event.preventDefault();

    try {
      const isShareholderShop =
        !editingId && form.role === "USER" && form.account_relationship === "SHAREHOLDER";
      const payload = {
        ...form,
        password: form.password || undefined,
        parent_dealer_id: isShareholderShop ? Number(form.parent_dealer_id) : null,
        parent_allocation_percentage: isShareholderShop
          ? Number(form.parent_allocation_percentage)
          : null,
        product_access_template: isShareholderShop ? "DEALER" : form.product_access_template,
        copy_product_access_from_user_id: isShareholderShop
          ? Number(form.parent_dealer_id)
          : form.copy_product_access_from_user_id,
      };

      if (editingId) {
        await api.updateUser(editingId, payload, token);
        showToast({
          tone: "success",
          title: "User updated",
          message: "The users list was refreshed.",
        });
      } else {
        const result = await api.registerUser(payload, token);
        const copiedCount = Number(result.copied_product_count || 0);
        const splitSummary = result.allocation_split_summary;
        showToast({
          tone: "success",
          title: splitSummary ? "Shareholder shop created" : "User created",
          message: splitSummary
            ? `${splitSummary.transferred_product_count} product allocations were transferred from the parent dealer${splitSummary.skipped_product_count ? `; ${splitSummary.skipped_product_count} were safely skipped because their balance could not be moved.` : "."}`
            : copiedCount
            ? `${copiedCount} visible products were copied into the new catalogue.`
            : "The account was created with a custom empty catalogue.",
        });
      }

      setForm(initialForm);
      setEditingId(null);
      setShowPassword(false);
      await load();
      announceDataRefresh("users");
    } catch (error) {
      showToast({
        tone: "error",
        title: "User action failed",
        message: error.message,
      });
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      password: "",
      role: row.role || "USER",
      country_code: row.country_code || "NP",
      currency_code: row.currency_code || "NPR",
      exchange_rate: Number(row.exchange_rate || defaultExchangeRates[row.currency_code] || 1),
      regular_price_markup: Number(row.regular_price_markup || 0),
      percentage_product_markup: Number(
        row.percentage_product_markup ?? row.regular_price_markup ?? 0
      ),
      non_commission_product_markup: Number(
        row.non_commission_product_markup ?? row.regular_price_markup ?? 0
      ),
      account_relationship: row.parent_dealer_id ? "SHAREHOLDER" : "INDEPENDENT",
      parent_dealer_id: row.parent_dealer_id || "",
      parent_allocation_percentage: 25,
      product_access_template: "NONE",
      copy_product_access_from_user_id: "",
    });
    setShowPassword(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowPassword(false);
  };

  const remove = async (id) => {
    try {
      await api.deleteUser(id, token);
      await load();
      announceDataRefresh("users");
      showToast({
        tone: "success",
        title: "User deleted",
        message: "The users list was refreshed.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Delete failed",
        message: error.message,
      });
    }
  };

  const hasProductVisibilityPermission = (id) =>
    pagePermissions.some(
      (permission) =>
        Number(permission.user_id) === Number(id) &&
        permission.page_key === PRODUCT_VISIBILITY_PAGE_KEY &&
        Number(permission.can_edit) === 1
    );

  const toggleProductVisibilityPermission = async (row) => {
    const enabled = !hasProductVisibilityPermission(row.id);

    try {
      await api.setProductVisibilityPermission(row.id, enabled, token);
      await load();
      announceDataRefresh("users");

      showToast({
        tone: "success",
        title: enabled ? "Show/hide access granted" : "Show/hide access removed",
        message: `${row.name || row.email} ${enabled ? "can now" : "can no longer"} manage product show/hide.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Permission update failed",
        message: error.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Create, update, and manage system user accounts."
        icon="users"
      />

      <SectionCard
        title={editingId ? "Edit user" : "Create users"}
        subtitle={
          editingId
            ? "Update account details. Leave password blank to keep current password."
            : "Admin can register admin, co-admin, member, elder, or user accounts."
        }
        icon="users"
      >
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </Field>

          <Field label="Email">
            <TextInput
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <TextInput
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                required={!editingId}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-800"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </Field>

          <Field label="Role">
            <SelectInput
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value,
                  regular_price_markup:
                    ["USER", "ELDER"].includes(event.target.value)
                      ? current.regular_price_markup
                      : 0,
                  percentage_product_markup:
                    ["USER", "ELDER"].includes(event.target.value)
                      ? current.percentage_product_markup
                      : 0,
                  non_commission_product_markup:
                    ["USER", "ELDER"].includes(event.target.value)
                      ? current.non_commission_product_markup
                      : 0,
                  product_access_template: ["USER", "ELDER", "MEMBER"].includes(
                    event.target.value
                  )
                    ? current.product_access_template
                    : "NONE",
                  copy_product_access_from_user_id: ["USER", "ELDER", "MEMBER"].includes(
                    event.target.value
                  )
                    ? current.copy_product_access_from_user_id
                    : "",
                  account_relationship:
                    event.target.value === "USER"
                      ? current.account_relationship
                      : "INDEPENDENT",
                  parent_dealer_id:
                    event.target.value === "USER" ? current.parent_dealer_id : "",
                }))
              }
            >
              <option value="ADMIN">ADMIN</option>
              <option value="CO_ADMIN">CO_ADMIN</option>
              <option value="MEMBER">MEMBER</option>
              <option value="ELDER">ELDER</option>
              <option value="USER">USER</option>
            </SelectInput>
          </Field>

          <Field label="Country / region">
            <SelectInput
              value={form.country_code}
              onChange={(event) => {
                const country = countries.find((item) => item.code === event.target.value);
                setForm((current) => ({
                  ...current,
                  country_code: event.target.value,
                  currency_code: country?.currency || current.currency_code,
                  exchange_rate:
                    defaultExchangeRates[country?.currency] || current.exchange_rate || 1,
                }));
              }}
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Currency">
            <SelectInput
              value={form.currency_code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currency_code: event.target.value,
                  exchange_rate: defaultExchangeRates[event.target.value] || current.exchange_rate || 1,
                }))
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </SelectInput>
          </Field>

          {form.currency_code === "INR" ? (
            <Field label="India pricing">
              <div className="flex h-11 items-center rounded-xl border border-orange-200 bg-orange-50 px-3.5 text-sm font-medium text-orange-800">
                Automatically shown as the Nepal price divided by 1.6.
              </div>
            </Field>
          ) : (
            <Field label="Exchange rate" hint="NPR per 1 selected currency.">
              <TextInput
                type="number"
                min="0.000001"
                step="0.000001"
                value={form.exchange_rate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, exchange_rate: event.target.value }))
                }
                required
              />
            </Field>
          )}

          {["USER", "ELDER"].includes(form.role) && form.currency_code === "NPR" ? (
            <>
              <Field
                label="Percentage product increase (NPR)"
                hint="Added only when the product is marked Percentage. Active offers are excluded."
              >
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.percentage_product_markup}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      percentage_product_markup: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                label="Non-commission product increase (NPR)"
                hint="Added only when the product is marked Non commission. Active offers are excluded."
              >
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.non_commission_product_markup}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      non_commission_product_markup: event.target.value,
                    }))
                  }
                />
              </Field>
            </>
          ) : null}

          {!editingId && form.role === "USER" ? (
            <Field
              label="Account relationship"
              hint="A shareholder shop receives its own protected quantity from one parent dealer."
            >
              <SelectInput
                value={form.account_relationship}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    account_relationship: event.target.value,
                    parent_dealer_id:
                      event.target.value === "SHAREHOLDER" ? current.parent_dealer_id : "",
                  }))
                }
              >
                <option value="INDEPENDENT">Independent dealer</option>
                <option value="SHAREHOLDER">Shareholder shop under a dealer</option>
              </SelectInput>
            </Field>
          ) : null}

          {!editingId &&
          form.role === "USER" &&
          form.account_relationship === "SHAREHOLDER" ? (
            <>
              <Field
                label="Parent dealer"
                hint="The shop receives its catalogue and allocation from this dealer."
              >
                <SelectInput
                  value={form.parent_dealer_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      parent_dealer_id: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select parent dealer</option>
                  {users
                    .filter(
                      (account) => account.role === "USER" && !account.parent_dealer_id
                    )
                    .sort((left, right) =>
                      String(left.name || left.email).localeCompare(
                        String(right.name || right.email)
                      )
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.email}
                      </option>
                    ))}
                </SelectInput>
              </Field>

              <Field
                label="Share of parent's allocation (%)"
                hint="The parent's allocation is treated as 100%. Example: 25% of a parent's 40% gives the shop 10% globally, while the parent keeps 30%. Only unused full cartons move."
              >
                <TextInput
                  type="number"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  value={form.parent_allocation_percentage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      parent_allocation_percentage: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </>
          ) : null}

          {!editingId &&
          ["USER", "ELDER", "MEMBER"].includes(form.role) &&
          form.account_relationship !== "SHAREHOLDER" ? (
            <Field
              label="Initial product catalogue"
              hint="Copy visible products now. You can make individual show/hide changes later."
            >
              <SelectInput
                value={form.product_access_template}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    product_access_template: event.target.value,
                    copy_product_access_from_user_id:
                      event.target.value === "DEALER"
                        ? current.copy_product_access_from_user_id
                        : "",
                  }))
                }
              >
                <option value="NONE">Start with no products</option>
                <option value="ALL_DEALERS">All products shown to any dealer</option>
                <option value="DEALER">Copy one individual dealer</option>
              </SelectInput>
            </Field>
          ) : null}

          {!editingId &&
          ["USER", "ELDER", "MEMBER"].includes(form.role) &&
          form.account_relationship !== "SHAREHOLDER" &&
          form.product_access_template === "DEALER" ? (
            <Field
              label="Copy catalogue from dealer"
              hint="Only products currently visible to this dealer are copied."
            >
              <SelectInput
                value={form.copy_product_access_from_user_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    copy_product_access_from_user_id: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select dealer</option>
                {users
                  .filter((account) => account.role === "USER")
                  .sort((left, right) =>
                    String(left.name || left.email).localeCompare(
                      String(right.name || right.email)
                    )
                  )
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.email}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          ) : null}

          <div className="flex items-center gap-3 md:col-span-2 xl:col-span-4">
            <Button type="submit" icon="plus">
              {editingId ? "Save changes" : "Create account"}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="System users" subtitle="Registered users and access levels." icon="users">
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role" },
            {
              key: "parent_dealer_name",
              label: "Parent dealer",
              render: (row) =>
                row.parent_dealer_id ? (
                  <div>
                    <div className="font-semibold text-slate-900">
                      {row.parent_dealer_name || "Linked dealer"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.parent_dealer_email || `User #${row.parent_dealer_id}`}
                    </div>
                    {Number(row.parent_allocation_share_percent || 0) > 0 ? (
                      <div className="mt-1 text-xs font-semibold text-indigo-700">
                        {formatNumber(row.parent_allocation_share_percent)}% of parent allocation
                      </div>
                    ) : null}
                  </div>
                ) : (
                  "Independent"
                ),
            },
            {
              key: "country_code",
              label: "Region",
              render: (row) =>
                countries.find((country) => country.code === row.country_code)?.name ||
                row.country_code ||
                "-",
            },
            { key: "currency_code", label: "Currency" },
            {
              key: "exchange_rate",
              label: "Pricing method",
              render: (row) =>
                row.currency_code === "INR"
                  ? "Nepal price ÷ 1.6"
                  : `NPR ÷ ${row.exchange_rate || 1}`,
            },
            {
              key: "product_type_markup",
              label: "Individual price increase",
              render: (row) =>
                ["USER", "ELDER"].includes(row.role) &&
                row.currency_code === "NPR" ? (
                  <div className="space-y-1 text-xs">
                    <div>
                      Percentage: <strong>+{formatPrice(row.percentage_product_markup ?? row.regular_price_markup ?? 0, "NPR")}</strong>
                    </div>
                    <div>
                      Non commission: <strong>+{formatPrice(row.non_commission_product_markup ?? row.regular_price_markup ?? 0, "NPR")}</strong>
                    </div>
                  </div>
                ) : (
                  "-"
                ),
            },
            { key: "created_at", label: "Created", type: "date" },
            {
              key: "actions",
              label: "Actions",
              render: (row) => {
                const hasVisibilityAccess = hasProductVisibilityPermission(row.id);

                return (
                  <div className="flex flex-wrap gap-2">
                    {row.role === "CO_ADMIN" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={hasVisibilityAccess ? "ghost" : "primary"}
                        icon={hasVisibilityAccess ? "eyeOff" : "eye"}
                        onClick={() => toggleProductVisibilityPermission(row)}
                      >
                        {hasVisibilityAccess ? "Remove show/hide" : "Allow show/hide"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon="edit"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      icon="delete"
                      disabled={Number(row.id) === Number(currentUser?.id)}
                      onClick={() => remove(row.id)}
                    >
                      Delete
                    </Button>
                  </div>
                );
              },
            },
          ]}
          rows={users}
        />
      </SectionCard>
    </div>
  );
}
