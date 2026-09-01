import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDevices } from "../api/devices";
import type { Device } from "../api/types";
import { AppIcon, ChevronRightIcon, PowerIcon } from "../components/icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { Skeleton } from "../components/Skeleton";
import { formatRelativeTime } from "../lib/format";

export function DeviceListPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    refetchInterval: 5000,
  });

  return (
    <div className="mx-auto max-w-md px-5 pt-8 pb-8">
      <div className="flex items-center gap-2">
        <AppIcon className="h-7 w-7" />
        <span className="text-sm font-semibold text-[#52514e]">Climate IoT</span>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Devices</h1>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3">
          <DeviceCardSkeleton />
          <DeviceCardSkeleton />
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <ErrorBanner message={`Couldn't reach the API: ${(error as Error).message}`} />
        </div>
      )}

      {data && data.length === 0 && (
        <p className="mt-4 text-sm text-[#898781]">No devices registered yet.</p>
      )}

      {data && data.length > 0 && (
        <>
          <p className="text-sm text-[#52514e]">{data.length} registered</p>
          <div className="mt-4 flex flex-col gap-3">
            {data.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const desired = device.device_state?.desired_state;
  const reported = device.device_state?.reported_state;
  const isSyncing =
    device.online &&
    desired !== undefined &&
    reported !== undefined &&
    (desired.power !== reported.power ||
      desired.target_temperature !== reported.target_temperature);

  return (
    <Link
      to={`/devices/${device.id}`}
      className="flex flex-col gap-2.5 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4 text-inherit no-underline"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${device.online ? "bg-[#0ca30c]" : "bg-[#898781]"}`}
          />
          <span className="text-base font-semibold">{device.name ?? device.hardware_id}</span>
        </div>
        <ChevronRightIcon className="flex-shrink-0 text-[#898781]" />
      </div>

      <div className="font-mono text-[13px] text-[#898781]">
        {device.hardware_id} &middot; {device.device_type}
      </div>

      {device.online ? (
        <div className="flex items-center justify-between border-t border-[#e1e0d9] pt-2">
          <div className="flex items-center gap-1.5">
            <PowerIcon className={desired?.power ? "text-[#2a78d6]" : "text-[#898781]"} />
            <span className="text-sm">
              {desired === undefined || (desired.power === null && desired.target_temperature === null)
                ? "No target set"
                : `${desired.power ? "On" : "Off"}${
                    desired.target_temperature !== null ? ` · ${desired.target_temperature}°C target` : ""
                  }`}
            </span>
          </div>
          {device.latest_telemetry && (
            <span className="text-sm text-[#52514e] tabular-nums">
              {device.latest_telemetry.temperature.toFixed(1)}&deg;C now
            </span>
          )}
        </div>
      ) : (
        <div className="border-t border-[#e1e0d9] pt-2 text-[13px] text-[#898781]">
          Offline
          {device.last_heartbeat_at && ` · last seen ${formatRelativeTime(device.last_heartbeat_at)}`}
        </div>
      )}

      {isSyncing && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2a78d6]" />
          <span className="text-xs font-medium text-[#2a78d6]">Syncing to new setpoint</span>
        </div>
      )}
    </Link>
  );
}

function DeviceCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center justify-between border-t border-[#e1e0d9] pt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
