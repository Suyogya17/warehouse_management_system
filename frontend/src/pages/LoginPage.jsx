import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { Field, TextInput } from "../components/Field";

const roleOptions = [
  {
    label: "Admin Login",
    role: "ADMIN",
    description: "Full control over raw materials, finished goods, production, and users.",
  },
  {
    label: "Store Keeper Login",
    role: "STORE_KEEPER",
    description: "Access raw materials, purchase entries, stock checks, and production operations.",
  },
  {
    label: "User Login",
    role: "USER",
    description: "Read-only access to finished goods stock.",
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [selectedRole, setSelectedRole] = useState("ADMIN");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      await login(form.email, form.password, selectedRole);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 text-white shadow-[0_20px_70px_rgba(15,23,42,0.22)]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.42),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.24),transparent_24%)] px-8 py-10 md:px-12 md:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200 text-black">Store Management System</p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight tracking-tight text-black">
            A polished control center for inventory, production, and stock visibility.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 text-black">
            Sign in by role to manage the same workflow with the right level of access, from inbound materials to finished-goods stock.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3 text-black">
            {roleOptions.map((option) => (
              <button
                key={option.role}
                type="button"
                onClick={() => setSelectedRole(option.role)}
                className={`rounded-2xl border p-5 text-left transition duration-200 ${
                  selectedRole === option.role
                    ? "border-indigo-300 bg-indigo-100 text-slate-950 shadow-lg"
                    : "border-white/10 bg-white/5 text-indigo-900 hover:bg-white/10"
                }`}
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-2 text-sm leading-6 ${selectedRole === option.role ? "text-slate-500" : "text-slate-300"}`}>{option.description}</p>
              </button>
            ))}
          </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white px-8 py-8 shadow-sm md:px-10 md:py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">{selectedRole.replace("_", " ")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Use the account for the selected role. The app blocks role mismatches automatically.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <Field label="Email">
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="user@example.com"
                required
              />
            </Field>

            <Field label="Password">
              <TextInput
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter your password"
                required
              />
            </Field>

            {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? "Signing in..." : `Login as ${selectedRole.replace("_", " ")}`}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
