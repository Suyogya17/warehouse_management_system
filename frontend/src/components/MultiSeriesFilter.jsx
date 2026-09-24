import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function MultiSeriesFilter({
  options = [],
  values = [],
  onChange,
  label = "Series",
  className = "",
  buttonClassName = "",
}) {
  const selected = Array.isArray(values) ? values : [];
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const toggle = (series) => {
    onChange(
      selected.includes(series)
        ? selected.filter((value) => value !== series)
        : [...selected, series]
    );
  };

  const updateMenuPosition = () => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setMenuPosition({
      top: Math.min(bounds.bottom + 8, window.innerHeight - 12),
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - 268)),
      width: Math.max(220, Math.min(320, bounds.width)),
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();

    const closeOnOutsideClick = (event) => {
      if (
        !triggerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const refreshPosition = () => updateMenuPosition();

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", refreshPosition);
    window.addEventListener("scroll", refreshPosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", refreshPosition);
      window.removeEventListener("scroll", refreshPosition, true);
    };
  }, [open]);

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Select series"
            className="fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: "min(18rem, calc(100vh - 1.5rem))",
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Select series
              </span>
              {selected.length ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {options.length ? (
                options.map((series) => {
                  const checked = selected.includes(series);
                  return (
                    <label
                      key={series}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50 ${
                        checked
                          ? "bg-indigo-50 font-medium text-indigo-800"
                          : "text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(series)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate">{series}</span>
                    </label>
                  );
                })
              ) : (
                <p className="px-2.5 py-3 text-sm text-slate-500">
                  No series available.
                </p>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`min-w-0 ${className}`}>
      {label ? (
        <p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Filter by multiple series"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 min-w-44 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${buttonClassName}`}
      >
        <span className="min-w-0 truncate">
          {selected.length === 0
            ? "All series"
            : selected.length === 1
              ? selected[0]
              : `${selected.length} series selected`}
        </span>
        <span className={`shrink-0 text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {menu}
    </div>
  );
}
