import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Icon from "../components/Icon";

const ToastContext = createContext(null);

const toneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

const toneIcon = {
  success: "check",
  error: "warning",
  info: "spark",
  warning: "warning",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, tone = "info", duration = 3500 }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, title, message, tone }]);

      if (duration > 0) {
        window.setTimeout(() => dismissToast(id), duration);
      }

      return id;
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 shadow-lg shadow-slate-900/10 ${toneClasses[toast.tone] || toneClasses.info}`}
            role="status"
          >
            <div className="flex items-start gap-3">
              <Icon name={toneIcon[toast.tone] || "spark"} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
                {toast.message ? <p className="mt-0.5 text-sm opacity-85">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                className="rounded-md px-1.5 text-sm font-semibold opacity-60 transition hover:bg-white/60 hover:opacity-100"
                onClick={() => dismissToast(toast.id)}
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
