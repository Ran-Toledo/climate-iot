export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{message}</p>
  );
}
