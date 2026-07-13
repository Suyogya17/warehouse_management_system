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
import { PRODUCT_VISIBILITY_PAGE_KEY } from "../utils/pagePermissions";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
  country_code: "NP",
  currency_code: "NPR",
  exchange_rate: 1,
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
      const payload = {
        ...form,
        password: form.password || undefined,
      };

      if (editingId) {
        await api.updateUser(editingId, payload, token);
        showToast({
          tone: "success",
          title: "User updated",
          message: "The users list was refreshed.",
        });
      } else {
        await api.registerUser(form, token);
        showToast({
          tone: "success",
          title: "User created",
          message: "The users list was refreshed.",
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
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
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

          <Field label="Exchange rate" hint="NPR per 1 selected currency. INR should be 1.6.">
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
              key: "country_code",
              label: "Region",
              render: (row) =>
                countries.find((country) => country.code === row.country_code)?.name ||
                row.country_code ||
                "-",
            },
            { key: "currency_code", label: "Currency" },
            { key: "exchange_rate", label: "Exchange rate" },
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
