export function formatRelativeTime(iso: string): string {
  const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));

  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

/** Time-only for a <=24h span, otherwise date -- matched to what a tick over that span actually needs to distinguish. */
export function formatAxisTick(iso: string, spanMs: number): string {
  const date = new Date(iso);
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatTooltipTime(iso: string, spanMs: number): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (spanMs <= 24 * 60 * 60 * 1000) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
