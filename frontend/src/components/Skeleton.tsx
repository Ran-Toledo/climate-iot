export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#e1e0d9] ${className ?? ""}`} />;
}
