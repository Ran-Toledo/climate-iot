export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-[rgba(208,59,59,0.08)] p-3 text-sm text-[#d03b3b]">{message}</p>
  );
}
