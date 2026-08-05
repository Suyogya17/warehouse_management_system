export function PresenceDot({ online = false, className = "" }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${
        online ? "bg-emerald-500" : "bg-slate-300"
      } ${className}`}
      aria-hidden="true"
    />
  );
}

export function PresenceLabel({ presence, compact = false, light = false }) {
  const online = Boolean(presence?.is_online);
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-xs"} ${
        light ? "text-indigo-100" : online ? "text-emerald-700" : "text-slate-400"
      }`}
      aria-label={online ? "Online" : "Offline"}
    >
      <PresenceDot online={online} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
