import { type UseMutationResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createCommand, deleteDevice, getCommand, getDevice, renameDevice } from "../api/devices";
import type { ClimateState, Command, Device } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DotsIcon,
  DropletIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  TrashIcon,
} from "../components/icons";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";
import { StatusPill } from "../components/StatusPill";
import { useRecentTelemetry } from "../hooks/useRecentTelemetry";
import { MAX_TARGET_TEMP, MIN_TARGET_TEMP, deviceLabel } from "../lib/device";
import { formatRelativeTime } from "../lib/format";

// -/+ taps are collected and sent as one command this long after the last
// tap, so going from 22 to 18 is one IR transmission, not four.
const STEP_SEND_DELAY_MS = 1000;
const DEFAULT_TARGET = 22;

type CommandPayload = { power?: boolean; target_temperature?: number };

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeCommandId, setActiveCommandId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: device, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["device", id],
    queryFn: () => getDevice(id),
    refetchInterval: 5000,
  });

  const { data: activeCommand } = useQuery({
    queryKey: ["command", activeCommandId],
    queryFn: () => getCommand(activeCommandId!),
    enabled: activeCommandId !== null,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 1000 : false),
  });

  // Reflect completion promptly: as soon as the polled command leaves
  // "pending", refetch the device instead of waiting for the next 5s tick.
  useEffect(() => {
    if (activeCommand && activeCommand.status !== "pending") {
      queryClient.invalidateQueries({ queryKey: ["device", id] });
    }
  }, [activeCommand, id, queryClient]);

  // Applies a change to the cached device right away, so the UI doesn't
  // flick back to the old value while the refetch is in flight.
  function patchDesired(payload: CommandPayload) {
    queryClient.setQueryData<Device>(["device", id], (old) =>
      old?.device_state
        ? {
            ...old,
            device_state: {
              ...old.device_state,
              desired_state: { ...old.device_state.desired_state, ...payload },
            },
          }
        : old,
    );
  }

  const sendCommand = useMutation({
    mutationFn: (payload: CommandPayload) => createCommand(id, { payload }),
    // A poll already in flight could land after patchDesired and briefly
    // show the old value; drop it, the refetch below brings fresh data.
    onMutate: () => queryClient.cancelQueries({ queryKey: ["device", id] }),
    onSuccess: (command, payload) => {
      patchDesired(payload);
      setActiveCommandId(command.id);
      queryClient.invalidateQueries({ queryKey: ["device", id] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const rename = useMutation({
    mutationFn: (displayName: string | null) => renameDevice(id, displayName),
    onSuccess: (updated) => {
      queryClient.setQueryData(["device", id], updated);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setRenaming(false);
    },
  });

  const removeDevice = useMutation({
    mutationFn: () => deleteDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      navigate("/");
    },
  });

  if (isLoading) {
    return (
      <Page>
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-[210px] rounded-2xl" />
        <Skeleton className="mt-3 h-[190px] rounded-2xl" />
      </Page>
    );
  }

  if (!device) {
    return (
      <Page>
        <Link to="/" className="text-sm text-accent no-underline">
          &larr; Devices
        </Link>
        <div className="mt-4">
          <ErrorBanner message={`Couldn't load this device: ${(error as Error | undefined)?.message ?? "not found"}`} />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex items-center gap-1">
        <Link
          to="/"
          aria-label="Back to devices"
          className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-ink no-underline"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          {renaming ? (
            <RenameForm
              device={device}
              busy={rename.isPending}
              onSave={(name) => rename.mutate(name)}
              onCancel={() => {
                rename.reset();
                setRenaming(false);
              }}
            />
          ) : (
            <>
              <h1 className="m-0 truncate text-lg font-semibold">{deviceLabel(device)}</h1>
              {device.display_name && (
                <div className="truncate text-xs text-ink-3">
                  Device name: {device.name ?? device.hardware_id}
                </div>
              )}
            </>
          )}
        </div>
        <OverflowMenu
          onRename={() => setRenaming(true)}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      {rename.isError && (
        <div className="mt-3">
          <ErrorBanner message={`Couldn't rename: ${(rename.error as Error).message}`} />
        </div>
      )}

      {isError && (
        <div className="mt-3">
          <ErrorBanner
            message={`Can't reach the server. Showing data from ${formatRelativeTime(new Date(dataUpdatedAt).toISOString())}.`}
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <ReadingCard device={device} />
        <ControlCard
          key={device.id}
          device={device}
          sendCommand={sendCommand}
          activeCommandStatus={activeCommand?.status}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${deviceLabel(device)}?`}
        body="This removes the device and all its readings and commands. If it's still running, it will register again as a new device."
        confirmLabel="Delete"
        busy={removeDevice.isPending}
        onConfirm={() => removeDevice.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
      {removeDevice.isError && (
        <div className="mt-3">
          <ErrorBanner message={`Couldn't delete device: ${(removeDevice.error as Error).message}`} />
        </div>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-5 pt-6 pb-10">{children}</div>;
}

function ReadingCard({ device }: { device: Device }) {
  const { data: recent } = useRecentTelemetry(device.id);
  const latest = device.latest_telemetry;

  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-card px-4 pt-4 pb-3">
      <StatusPill online={device.online} />
      <div className="mt-2 text-[56px] leading-[1.05] font-semibold tabular-nums">
        {latest ? `${latest.temperature.toFixed(1)}°` : "—"}
      </div>
      <div className="flex items-center gap-1 text-[13px] text-ink-2">
        {latest ? (
          <>
            <DropletIcon />
            {latest.humidity.toFixed(0)}% · updated {formatRelativeTime(latest.recorded_at)}
          </>
        ) : (
          "No readings yet"
        )}
      </div>
      <Link
        to={`/devices/${device.id}/graph`}
        className="mt-3 flex w-full flex-col gap-1 text-inherit no-underline"
        aria-label="View temperature and humidity graph"
      >
        <Sparkline readings={recent} className="w-full" height={44} />
        <div className="flex justify-between text-[11px] text-ink-3">
          <span>Last 24h</span>
          <span className="flex items-center gap-0.5 font-medium text-accent">
            View graph <ChevronRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </div>
  );
}

function ControlCard({
  device,
  sendCommand,
  activeCommandStatus,
}: {
  device: Device;
  sendCommand: UseMutationResult<Command, Error, CommandPayload>;
  activeCommandStatus: "pending" | "completed" | "failed" | undefined;
}) {
  const desired = device.device_state?.desired_state;
  const reported = device.device_state?.reported_state;

  // Target the user is adjusting with -/+ but hasn't been sent yet.
  const [draftTarget, setDraftTarget] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pendingSend = useRef<number | null>(null);

  // Leaving the page within the delay still sends the change.
  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      if (pendingSend.current !== null) {
        createCommand(device.id, { payload: { target_temperature: pendingSend.current } }).catch(() => {});
      }
    };
  }, [device.id]);

  const sentTarget = sendCommand.isPending ? sendCommand.variables?.target_temperature : undefined;
  const shownTarget = draftTarget ?? sentTarget ?? desired?.target_temperature ?? null;
  const sentPower = sendCommand.isPending ? sendCommand.variables?.power : undefined;
  const shownPower = sentPower ?? desired?.power ?? false;

  function sendTarget(value: number) {
    window.clearTimeout(timer.current);
    pendingSend.current = null;
    sendCommand.mutate({ target_temperature: value }, { onSettled: () => setDraftTarget(null) });
  }

  function step(delta: number) {
    const base = shownTarget ?? DEFAULT_TARGET;
    const next = Math.min(MAX_TARGET_TEMP, Math.max(MIN_TARGET_TEMP, base + delta));
    setDraftTarget(next);
    pendingSend.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => sendTarget(next), STEP_SEND_DELAY_MS);
  }

  const scheduled = draftTarget !== null && !sendCommand.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="text-center text-[13px] text-ink-2">Target</div>
        <div className="mt-1 flex items-center justify-between">
          <RoundButton label="Decrease target temperature" onClick={() => step(-1)}>
            <MinusIcon />
          </RoundButton>
          {typing ? (
            <TargetInput
              initial={shownTarget}
              onSubmit={(value) => {
                setTyping(false);
                setDraftTarget(value);
                sendTarget(value);
              }}
              onCancel={() => setTyping(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setTyping(true)}
              aria-label="Type a target temperature"
              className="min-h-14 min-w-28 rounded-xl px-2 text-[40px] leading-none font-semibold text-ink tabular-nums hover:bg-accent-soft"
            >
              {shownTarget !== null ? `${shownTarget}°` : "—"}
            </button>
          )}
          <RoundButton label="Increase target temperature" onClick={() => step(1)}>
            <PlusIcon />
          </RoundButton>
        </div>
        {!typing && (
          <div className="mt-1 text-center text-[11px] text-ink-3">Tap the number to type a value</div>
        )}

        <div className="mt-3 h-px bg-divider" />

        <button
          type="button"
          role="switch"
          aria-checked={shownPower}
          onClick={() => sendCommand.mutate({ power: !shownPower })}
          className="mt-1 flex min-h-12 w-full items-center justify-between bg-transparent px-0 text-ink"
        >
          <span className="flex items-center gap-2.5 text-[15px] font-medium">
            <PowerIcon className={shownPower ? "text-accent" : "text-ink-3"} />
            Power
          </span>
          <span
            className={`flex h-[30px] w-[52px] items-center rounded-full p-[3px] transition-colors ${
              shownPower ? "justify-end bg-accent" : "justify-start bg-ink-3"
            }`}
          >
            <span className="h-6 w-6 rounded-full bg-white" />
          </span>
        </button>
      </div>

      <SyncStatus
        device={device}
        desired={desired}
        reported={reported}
        scheduled={scheduled}
        sending={sendCommand.isPending || activeCommandStatus === "pending"}
        sendError={sendCommand.isError ? sendCommand.error.message : null}
        lastFailed={activeCommandStatus === "failed"}
      />
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-line-strong bg-transparent text-ink active:bg-accent-soft"
    >
      {children}
    </button>
  );
}

function TargetInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: number | null;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial !== null ? String(initial) : "");
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(text);
    if (text.trim() === "" || !Number.isInteger(value) || value < MIN_TARGET_TEMP || value > MAX_TARGET_TEMP) {
      setInvalid(true);
      return;
    }
    onSubmit(value);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={MIN_TARGET_TEMP}
          max={MAX_TARGET_TEMP}
          step={1}
          autoFocus
          value={text}
          aria-label="Target temperature in °C"
          aria-invalid={invalid}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          className={`h-12 w-20 rounded-xl border bg-page text-center text-2xl font-semibold text-ink tabular-nums outline-none focus:border-accent ${
            invalid ? "border-danger" : "border-line-strong"
          }`}
        />
        <span className="text-xl font-semibold">°</span>
      </div>
      {invalid && (
        <span className="text-xs text-danger">
          Whole number, {MIN_TARGET_TEMP}–{MAX_TARGET_TEMP}
        </span>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-[13px] text-ink-2">
          Cancel
        </button>
        <button type="submit" className="h-9 rounded-lg bg-accent px-4 text-[13px] font-semibold text-on-accent">
          Set
        </button>
      </div>
    </form>
  );
}

function SyncStatus({
  device,
  desired,
  reported,
  scheduled,
  sending,
  sendError,
  lastFailed,
}: {
  device: Device;
  desired: ClimateState | undefined;
  reported: ClimateState | undefined;
  scheduled: boolean;
  sending: boolean;
  sendError: string | null;
  lastFailed: boolean;
}) {
  const line = "flex items-center justify-center gap-1.5 text-center text-xs";

  if (scheduled) return <div className={`${line} text-accent`}>Sending in a moment…</div>;
  if (sending) {
    return (
      <div className={`${line} text-accent`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {device.online ? "Sending to the AC…" : "Queued. It'll be sent when the device is back online."}
      </div>
    );
  }
  if (sendError) return <div className={`${line} text-danger`}>Couldn't send the change: {sendError}</div>;
  if (lastFailed) return <div className={`${line} text-danger`}>The device couldn't apply the last change.</div>;
  if (!device.device_state || !desired || !reported) return null;

  const inSync =
    desired.power === reported.power && desired.target_temperature === reported.target_temperature;
  if (inSync) {
    if (reported.power == null && reported.target_temperature == null) return null;
    return (
      <div className={`${line} text-ink-2`}>
        <CheckIcon className="text-ok" />
        AC confirmed {describeState(reported)} · {formatRelativeTime(device.device_state.updated_at)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-accent-soft p-3 text-xs">
      <span className="font-medium text-accent">Waiting for the AC to confirm…</span>
      <div className="flex justify-between text-ink-2">
        <span>Asked for: {describeState(desired)}</span>
        <span>AC reports: {describeState(reported)}</span>
      </div>
    </div>
  );
}

function describeState(state: ClimateState): string {
  const parts: string[] = [];
  if (state.power != null) parts.push(state.power ? "on" : "off");
  if (state.target_temperature != null) parts.push(`${state.target_temperature}°`);
  return parts.join(", ") || "nothing yet";
}

function RenameForm({
  device,
  busy,
  onSave,
  onCancel,
}: {
  device: Device;
  busy: boolean;
  onSave: (name: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(device.display_name ?? "");
  const fallback = device.name ?? device.hardware_id;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text.trim() || null);
      }}
      className="flex flex-col items-stretch gap-1"
    >
      <input
        autoFocus
        maxLength={100}
        value={text}
        placeholder={fallback}
        aria-label="Name shown in the app"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="h-10 rounded-lg border border-line-strong bg-card px-3 text-center text-base font-semibold text-ink outline-none focus:border-accent"
      />
      <span className="text-[11px] text-ink-3">Leave empty to use the device's own name</span>
      <div className="flex justify-center gap-1.5">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-[13px] text-ink-2">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-lg bg-accent px-4 text-[13px] font-semibold text-on-accent disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function OverflowMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 bg-transparent px-3.5 py-3 text-left text-sm";

  return (
    <div ref={ref} className="relative -mr-2 flex-shrink-0">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-ink"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-11 right-1 z-10 w-48 overflow-hidden rounded-xl border border-line bg-card shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={`${item} text-ink`}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <PencilIcon /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} border-t border-divider text-danger`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <TrashIcon /> Delete device
          </button>
        </div>
      )}
    </div>
  );
}
