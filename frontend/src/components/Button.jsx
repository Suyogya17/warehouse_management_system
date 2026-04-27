const variants = {
  primary:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-200",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-indigo-100",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-indigo-100",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-100",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export default function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  icon,
  iconOnly = false,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {iconOnly ? <span className="sr-only">{typeof children === "string" ? children : "Action"}</span> : null}
      {children}
    </button>
  );
}
import Icon from "./Icon";
