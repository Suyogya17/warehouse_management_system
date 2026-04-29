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

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
};

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

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
        showToast({ tone: "success", title: "User updated", message: "The users list was refreshed." });
      } else {
        await api.registerUser(form, token);
        showToast({ tone: "success", title: "User created", message: "The users list was refreshed." });
      }

      setForm(initialForm);
      setEditingId(null);
      await load();
      announceDataRefresh("users");
    } catch (error) {
      showToast({ tone: "error", title: "User action failed", message: error.message });
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      password: "",
      role: row.role || "USER",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
  };

  const remove = async (id) => {
    try {
      await api.deleteUser(id, token);
      await load();
      announceDataRefresh("users");
      showToast({ tone: "success", title: "User deleted", message: "The users list was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Delete failed", message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* <PageHeader
        eyebrow="Access control"
        title="Users"
        description="Create role-based access for administrators, store keepers, and read-only inventory viewers."
        icon="users"
      /> */}

      <SectionCard
        title={editingId ? "Edit user" : "Create users"}
        subtitle={editingId ? "Update account details. Leave password blank to keep the current password." : "Admin can register admin, store keeper, or user accounts."}
        icon="users"
      >
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          {[
            ["name", "Name"],
            ["email", "Email", "email"],
            ["password", "Password", "password"],
          ].map(([key, label, type = "text"]) => (
            <Field key={key} label={label}>
              <TextInput
                type={type}
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                required={key !== "password" || !editingId}
              />
            </Field>
          ))}
          <Field label="Role">
            <SelectInput
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            >
              <option value="ADMIN">ADMIN</option>
              <option value="STORE_KEEPER">STORE_KEEPER</option>
              <option value="USER">USER</option>
            </SelectInput>
          </Field>
          <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
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
            { key: "created_at", label: "Created", type: "date" },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" icon="edit" onClick={() => startEdit(row)}>
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
