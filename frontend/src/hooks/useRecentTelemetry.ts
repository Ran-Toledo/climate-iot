import { useQuery } from "@tanstack/react-query";
import { listTelemetry } from "../api/devices";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Last 24h of readings, coarsely sampled -- enough for a sparkline. */
export function useRecentTelemetry(deviceId: number) {
  return useQuery({
    queryKey: ["telemetry", deviceId, "sparkline"],
    queryFn: () =>
      listTelemetry(deviceId, { since: new Date(Date.now() - DAY_MS).toISOString(), limit: 96 }),
    refetchInterval: 60_000,
  });
}
