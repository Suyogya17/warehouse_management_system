import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { Eye, EyeOff } from "lucide-react";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
  country_code: "NP",
  currency_code: "NPR",
};

const countries = [
  { code: "NP", name: "Nepal", currency: "NPR" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
];

const currencies = ["NPR", "INR", "CNY", "USD", "GBP"];

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getUsers(token);
    setUsers(result.data || []);
  }, [token]);

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

  return (
    <div className="space-y-6">
      <SectionCard
        title={editingId ? "Edit user" : "Create users"}
        subtitle={
          editingId
            ? "Update account details. Leave password blank to keep current password."
            : "Admin can register admin, store keeper, or user accounts."
        }
        icon="users"
      >
        <form
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={submit}
        >
          {/* NAME */}
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(e) =>
                setForm((c) => ({ ...c, name: e.target.value }))
              }
              required
            />
          </Field>

          {/* EMAIL */}
          <Field label="Email">
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((c) => ({ ...c, email: e.target.value }))
              }
              required
            />
          </Field>

          {/* PASSWORD WITH EYE TOGGLE */}
          <Field label="Password">
            <div className="relative">
              <TextInput
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) =>
                  setForm((c) => ({ ...c, password: e.target.value }))
                }
                required={!editingId}
              />

              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-800"
              >
                 {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </Field>

          {/* ROLE */}
          <Field label="Role">
            <SelectInput
              value={form.role}
              onChange={(e) =>
                setForm((c) => ({ ...c, role: e.target.value }))
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
              onChange={(e) => {
                const country = countries.find((item) => item.code === e.target.value);
                setForm((current) => ({
                  ...current,
                  country_code: e.target.value,
                  currency_code: country?.currency || current.currency_code,
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
              onChange={(e) =>
                setForm((current) => ({ ...current, currency_code: e.target.value }))
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </SelectInput>
          </Field>

          {/* ACTIONS */}
          <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
            <Button type="submit" icon="plus">
              {editingId ? "Save changes" : "Create account"}
            </Button>

            {editingId && (
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </SectionCard>

      {/* TABLE */}
      <SectionCard
        title="System users"
        subtitle="Registered users and access levels."
        icon="users"
      >
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
            { key: "created_at", label: "Created", type: "date" },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
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
              ),
            },
          ]}
          rows={users}
        />
      </SectionCard>
    </div>
  );
}
