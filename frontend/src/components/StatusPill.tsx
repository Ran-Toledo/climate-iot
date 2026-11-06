export function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        online ? "bg-ok-soft text-ok" : "bg-divider text-ink-2"
      }`}
    >
      <span className={`h-[7px] w-[7px] rounded-full ${online ? "bg-ok-dot" : "bg-ink-3"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
