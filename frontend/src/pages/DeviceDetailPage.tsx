import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createCommand, deleteDevice, getCommand, getDevice } from "../api/devices";
import type { ClimateState, Command, Device } from "../api/types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  MinusIcon,
  PlusIcon,
  PowerIcon,
  XCircleIcon,
} from "../components/icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { Skeleton } from "../components/Skeleton";
import { formatRelativeTime } from "../lib/format";

const MIN_TEMP = 10;
const MAX_TEMP = 32;

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeCommandId, setActiveCommandId] = useState<number | null>(null);

  const {
    data: device,
    isLoading,
    isError,
    error,
  } = useQuery({
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

  const sendCommand = useMutation({
    mutationFn: (payload: { power?: boolean; target_temperature?: number }) =>
      createCommand(id, { payload }),
    onSuccess: (command) => {
      setActiveCommandId(command.id);
      queryClient.invalidateQueries({ queryKey: ["device", id] });
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
      <div className="mx-auto max-w-md px-5 pt-8 pb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[104px] rounded-xl" />
            <Skeleton className="h-[104px] rounded-xl" />
          </div>
          <Skeleton className="h-[124px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8 pb-8">
        <Link to="/" className="text-sm text-[#2a78d6] no-underline">
          &larr; Devices
        </Link>
        <div className="mt-4">
          <ErrorBanner message={`Couldn't load device: ${(error as Error | undefined)?.message ?? "not found"}`} />
        </div>
      </div>
    );
  }

  const desired = device.device_state?.desired_state;
  const reported = device.device_state?.reported_state;
  const inSync =
    desired !== undefined &&
    reported !== undefined &&
    desired.power === reported.power &&
    desired.target_temperature === reported.target_temperature;

  const commandPending = sendCommand.isPending || activeCommand?.status === "pending";

  function togglePower() {
    sendCommand.mutate({ power: !(desired?.power ?? false) });
  }

  function stepTemperature(delta: number) {
    const base = desired?.target_temperature ?? 22;
    const next = Math.min(MAX_TEMP, Math.max(MIN_TEMP, base + delta));
    sendCommand.mutate({ target_temperature: next });
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-8 pb-8">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-[#0b0b0b] no-underline"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold">{device.name ?? device.hardware_id}</div>
          <div className="font-mono text-[13px] text-[#898781]">{device.hardware_id}</div>
        </div>
        <div
          className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            device.online ? "bg-[rgba(12,163,12,0.10)] text-[#0a7d0a]" : "bg-[rgba(137,135,129,0.12)] text-[#52514e]"
          }`}
        >
          <span
            className={`h-[7px] w-[7px] rounded-full ${device.online ? "bg-[#0ca30c]" : "bg-[#898781]"}`}
          />
          {device.online ? "Online" : "Offline"}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-6">
        <StatePanel desired={desired} reported={reported} inSync={inSync} device={device} />

        <div className="flex flex-col gap-4 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <PowerIcon />
              <span className="text-[15px] font-medium">Power</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={desired?.power ?? false}
              disabled={commandPending}
              onClick={togglePower}
              className={`flex h-[26px] w-11 items-center rounded-full p-[3px] transition-colors disabled:opacity-50 ${
                desired?.power ? "justify-end bg-[#2a78d6]" : "justify-start bg-[#898781]"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-[#fcfcfb]" />
            </button>
          </div>

          <div className="h-px bg-[#e1e0d9]" />

          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Target temperature</span>
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                aria-label="Decrease target temperature"
                disabled={commandPending}
                onClick={() => stepTemperature(-1)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(11,11,11,0.16)] disabled:opacity-50"
              >
                <MinusIcon />
              </button>
              <span className="min-w-[48px] text-center text-xl font-semibold tabular-nums">
                {desired?.target_temperature !== null && desired?.target_temperature !== undefined
                  ? `${desired.target_temperature}°C`
                  : "—"}
              </span>
              <button
                type="button"
                aria-label="Increase target temperature"
                disabled={commandPending}
                onClick={() => stepTemperature(1)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(11,11,11,0.16)] disabled:opacity-50"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
        </div>

        {activeCommand && <CommandStatusStrip command={activeCommand} />}

        <Link
          to={`/devices/${device.id}/graph`}
          className="flex flex-col gap-1 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4 text-inherit no-underline"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Temperature &amp; humidity</span>
            <div className="flex items-center gap-1 text-[#2a78d6]">
              <span className="text-[13px] font-medium">View graph</span>
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </div>
          </div>
          {device.latest_telemetry ? (
            <div className="flex items-center gap-4 text-[13px] text-[#52514e]">
              <span>{device.latest_telemetry.temperature.toFixed(1)}&deg;C now</span>
              <span>{device.latest_telemetry.humidity.toFixed(0)}% humidity</span>
            </div>
          ) : (
            <span className="text-[13px] text-[#898781]">No readings yet</span>
          )}
        </Link>

        <button
          type="button"
          disabled={removeDevice.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${device.name ?? device.hardware_id}"? This can't be undone.`)) {
              removeDevice.mutate();
            }
          }}
          className="self-start bg-transparent py-2 text-[13px] font-medium text-[#d03b3b] disabled:opacity-50"
        >
          {removeDevice.isPending ? "Deleting…" : "Delete device"}
        </button>
        {removeDevice.isError && (
          <ErrorBanner message={`Couldn't delete device: ${(removeDevice.error as Error).message}`} />
        )}
      </div>
    </div>
  );
}

function StatePanel({
  desired,
  reported,
  inSync,
  device,
}: {
  desired: ClimateState | undefined;
  reported: ClimateState | undefined;
  inSync: boolean;
  device: Device;
}) {
  if (!device.device_state) {
    return <p className="text-sm text-[#898781]">No state yet — device hasn't received a command.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-3">
        <StateCard label="Desired" state={desired} />
        <StateCard label="Reported" state={reported} />
      </div>
      <div className="pl-0.5 text-xs text-[#898781]">
        {inSync ? "Both in agreement" : "Syncing"} &middot; updated{" "}
        {formatRelativeTime(device.device_state.updated_at)}
      </div>
    </div>
  );
}

function StateCard({ label, state }: { label: string; state: ClimateState | undefined }) {
  const hasTarget = state?.target_temperature !== null && state?.target_temperature !== undefined;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4">
      <div className="text-xs font-semibold tracking-wide text-[#898781] uppercase">{label}</div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[28px] font-semibold">{hasTarget ? state!.target_temperature : "—"}</span>
        {hasTarget && <span className="text-sm text-[#52514e]">°C</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <PowerIcon className={state?.power ? "h-3.5 w-3.5 text-[#2a78d6]" : "h-3.5 w-3.5 text-[#898781]"} />
        <span className="text-[13px] text-[#52514e]">
          {state?.power === null || state?.power === undefined
            ? "Unknown"
            : state.power
              ? "Power on"
              : "Power off"}
        </span>
      </div>
    </div>
  );
}

function CommandStatusStrip({ command }: { command: Command }) {
  const describePayload = (payload: ClimateState) => {
    const parts: string[] = [];
    if (payload.power !== null && payload.power !== undefined) {
      parts.push(payload.power ? "power on" : "power off");
    }
    if (payload.target_temperature !== null && payload.target_temperature !== undefined) {
      parts.push(`target ${payload.target_temperature}°C`);
    }
    return parts.join(", ") || "state update";
  };

  const styles = {
    pending: { bg: "rgba(42,120,214,0.06)", fg: "text-[#2a78d6]", label: "Sending…" },
    completed: { bg: "rgba(12,163,12,0.06)", fg: "text-[#0a7d0a]", label: "Completed" },
    failed: { bg: "rgba(208,59,59,0.06)", fg: "text-[#d03b3b]", label: "Failed" },
  }[command.status];

  return (
    <div
      className="flex items-center gap-2.5 rounded-[10px] p-3"
      style={{ background: styles.bg }}
    >
      {command.status === "completed" && <CheckCircleIcon className={styles.fg} />}
      {command.status === "failed" && <XCircleIcon className={styles.fg} />}
      {command.status === "pending" && (
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full bg-current ${styles.fg} animate-pulse`} />
      )}
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">Set {describePayload(command.payload)}</span>
        <span className="text-xs text-[#898781]">
          {styles.label}
          {command.completed_at && ` · ${formatRelativeTime(command.completed_at)}`}
        </span>
      </div>
    </div>
  );
}
