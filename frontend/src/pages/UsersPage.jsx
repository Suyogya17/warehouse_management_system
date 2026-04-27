import { useEffect, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import { Field, SelectInput, TextInput } from "../components/Field";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
};

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");

  const load = async () => {
    const result = await api.getUsers(token);
    setUsers(result.data || []);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.registerUser(form, token);
      setMessage("User created and list updated immediately.");
      setForm(initialForm);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access control"
        title="Users"
        description="Create role-based access for administrators, store keepers, and read-only inventory viewers."
        icon="users"
      />

      <SectionCard title="Create users" subtitle="Admin can register admin, store keeper, or user accounts." icon="users">
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
                required
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
              Create account
            </Button>
            {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
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
          ]}
          rows={users}
        />
      </SectionCard>
    </div>
  );
}
