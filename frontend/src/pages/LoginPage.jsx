import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await login(form.email, form.password);
      showToast({ tone: "success", title: "Logged in", message: "Dashboard data will load automatically." });
      navigate("/");
    } catch (err) {
      const message = err.message || "Login failed";
      setError(message);
      showToast({ tone: "error", title: "Login failed", message });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      
      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl p-8 border border-slate-200">
        
        {/* Title */}
        <h1 className="text-3xl font-semibold text-slate-800 text-center">
          Welcome Back
        </h1>
        <p className="text-sm text-slate-500 text-center mt-2">
          Login to your account
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          
          {/* Email */}
          <div>
            <label className="text-sm text-slate-600">Email</label>
            <div className="mt-1 flex items-center border rounded-xl px-3 py-2 bg-white shadow-sm">
              <Mail size={18} className="text-slate-400" />
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                className="w-full ml-2 outline-none bg-transparent text-sm"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-sm text-slate-600">Password</label>
            <div className="mt-1 flex items-center border rounded-xl px-3 py-2 bg-white shadow-sm">
              <Lock size={18} className="text-slate-400" />
              
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                className="w-full ml-2 outline-none bg-transparent text-sm"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-400 hover:text-slate-600 bg-"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 p-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-medium bg-black hover:bg-slate-800 transition"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
