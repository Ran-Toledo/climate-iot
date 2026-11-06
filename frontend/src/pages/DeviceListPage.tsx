import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listDevices } from "../api/devices";
import type { Device } from "../api/types";
import { AppIcon, ChevronDownIcon, DropletIcon, PowerIcon } from "../components/icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { Skeleton } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";
import { StatusPill } from "../components/StatusPill";
import { useRecentTelemetry } from "../hooks/useRecentTelemetry";
import { deviceLabel } from "../lib/device";
import { formatRelativeTime } from "../lib/format";

const SHOW_OFFLINE_KEY = "climate-iot:show-offline";

function readShowOffline(): boolean {
  try {
    return localStorage.getItem(SHOW_OFFLINE_KEY) === "1";
  } catch {
    return false;
  }
}

export function DeviceListPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    refetchInterval: 5000,
  });
  const [showOffline, setShowOffline] = useState(readShowOffline);

  function toggleOffline() {
    const next = !showOffline;
    setShowOffline(next);
    try {
      localStorage.setItem(SHOW_OFFLINE_KEY, next ? "1" : "0");
    } catch {
      // Private mode etc.: the toggle still works for this visit.
    }
  }

  const online = data?.filter((d) => d.online) ?? [];
  const offline = data?.filter((d) => !d.online) ?? [];

  return (
    <div className="mx-auto max-w-md px-5 pt-8 pb-10">
      <div className="flex items-center gap-2">
        <AppIcon className="h-7 w-7" />
        <span className="text-sm font-semibold text-ink-2">Climate IoT</span>
      </div>
      <h1 className="mt-3 mb-0 text-2xl font-semibold tracking-tight">Devices</h1>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3">
          <DeviceCardSkeleton />
          <DeviceCardSkeleton />
        </div>
      )}

      {/* With data already on screen, a failed refresh only gets a note:
          the last known values stay visible. */}
      {isError && (
        <div className="mt-4">
          <ErrorBanner
            message={
              data
                ? `Can't reach the server. Showing data from ${formatRelativeTime(new Date(dataUpdatedAt).toISOString())}.`
                : `Can't reach the server: ${(error as Error).message}`
            }
          />
        </div>
      )}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-xl border border-line bg-card p-5">
          <p className="m-0 font-semibold">Add your first device</p>
          <p className="mt-1 mb-0 text-sm text-ink-2">
            Devices show up here once they register with the backend.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {online.map((device) => (
            <OnlineDeviceCard key={device.id} device={device} />
          ))}

          {online.length === 0 && (
            <p className="m-0 text-sm text-ink-3">No devices online right now.</p>
          )}

          {offline.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleOffline}
                aria-expanded={showOffline}
                className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-card px-4 text-sm text-ink-2"
              >
                <span>
                  {offline.length} offline {offline.length === 1 ? "device" : "devices"}
                </span>
                <ChevronDownIcon className={`transition-transform ${showOffline ? "rotate-180" : ""}`} />
              </button>
              {showOffline &&
                offline.map((device) => <OfflineDeviceCard key={device.id} device={device} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OnlineDeviceCard({ device }: { device: Device }) {
  const { data: recent } = useRecentTelemetry(device.id);
  const desired = device.device_state?.desired_state;
  const reported = device.device_state?.reported_state;
  const syncing =
    desired !== undefined &&
    reported !== undefined &&
    (desired.power !== reported.power || desired.target_temperature !== reported.target_temperature);
  const latest = device.latest_telemetry;

  return (
    <Link
      to={`/devices/${device.id}`}
      className="flex flex-col rounded-2xl border border-line bg-card p-4 text-inherit no-underline"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-semibold">{deviceLabel(device)}</span>
        <StatusPill online />
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <div className="text-[34px] leading-none font-semibold tabular-nums">
            {latest ? `${latest.temperature.toFixed(1)}°` : "—"}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[13px] text-ink-2">
            <DropletIcon />
            {latest ? `${latest.humidity.toFixed(0)}% humidity` : "No readings yet"}
          </div>
        </div>
        <Sparkline readings={recent} className="w-[110px] flex-shrink-0" />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-2.5 text-[13px]">
        <span className="flex items-center gap-1.5">
          <PowerIcon className={`h-4 w-4 ${desired?.power ? "text-accent" : "text-ink-3"}`} />
          {describeTarget(desired?.power, desired?.target_temperature)}
        </span>
        {syncing && <span className="font-medium text-accent">Syncing…</span>}
      </div>
    </Link>
  );
}

function OfflineDeviceCard({ device }: { device: Device }) {
  return (
    <Link
      to={`/devices/${device.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-inherit no-underline"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{deviceLabel(device)}</div>
        <div className="text-[13px] text-ink-3">
          {device.last_heartbeat_at
            ? `Last seen ${formatRelativeTime(device.last_heartbeat_at)}`
            : "Never connected"}
        </div>
      </div>
      <StatusPill online={false} />
    </Link>
  );
}

function describeTarget(power: boolean | null | undefined, target: number | null | undefined): string {
  if (power == null && target == null) return "No target set";
  const p = power == null ? "" : power ? "On" : "Off";
  const t = target == null ? "" : `set to ${target}°`;
  return [p, t].filter(Boolean).join(" · ");
}

function DeviceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex items-end justify-between">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-10 w-[110px]" />
      </div>
      <Skeleton className="h-4 w-36" />
    </div>
  );
}
