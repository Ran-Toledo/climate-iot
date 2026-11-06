import { useEffect, useRef } from "react";

/**
 * A modal confirmation built on <dialog>, so focus trapping, Escape and the
 * backdrop come from the browser.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel(); // click on the backdrop
      }}
      className="m-auto w-[min(360px,calc(100%-40px))] rounded-2xl border border-line bg-card p-0 text-ink backdrop:bg-scrim"
    >
      <div className="flex flex-col gap-2 p-5">
        <h2 className="m-0 text-lg font-semibold">{title}</h2>
        <p className="m-0 text-sm text-ink-2">{body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-11 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
