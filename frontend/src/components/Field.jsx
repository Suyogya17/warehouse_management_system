export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label ? <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span> : null}
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${props.className || ""}`}
      {...props}
    />
  );
}

export function SelectInput({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%)",
        backgroundPosition: "calc(100% - 18px) calc(50% - 1px), calc(100% - 13px) calc(50% - 1px)",
        backgroundSize: "5px 5px, 5px 5px",
        backgroundRepeat: "no-repeat",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextAreaInput(props) {
  return (
    <textarea
      className={`min-h-[108px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${props.className || ""}`}
      {...props}
    />
  );
}
