import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDevice, listTelemetry } from "../api/devices";
import { ChevronLeftIcon } from "../components/icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { Skeleton } from "../components/Skeleton";
import { TelemetryChart } from "../components/TelemetryChart";
import { deviceLabel } from "../lib/device";
import { detectGaps } from "../lib/telemetry";

const HOUR = 60 * 60 * 1000;
const RANGES = [
  { label: "1H", ms: HOUR },
  { label: "6H", ms: 6 * HOUR },
  { label: "24H", ms: 24 * HOUR },
  { label: "7D", ms: 7 * 24 * HOUR },
  { label: "30D", ms: 30 * 24 * HOUR },
];
const RANGE_KEY = "climate-iot:graph-range";
const DEFAULT_RANGE = "24H";

// A commonly recommended indoor humidity range, shaded on the humidity chart.
const COMFORT_HUMIDITY = { from: 40, to: 60, label: "Comfort 40–60%" };

function readRange(): number {
  try {
    const i = RANGES.findIndex((r) => r.label === localStorage.getItem(RANGE_KEY));
    if (i >= 0) return i;
  } catch {
    // Storage unavailable: use the default.
  }
  return RANGES.findIndex((r) => r.label === DEFAULT_RANGE);
}

export function DeviceGraphPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const [rangeIndex, setRangeIndex] = useState(readRange);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const range = RANGES[rangeIndex];

  const { data: device } = useQuery({
    queryKey: ["device", id],
    queryFn: () => getDevice(id),
    refetchInterval: 15000,
  });

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["telemetry", id, range.label],
    // since is computed at fetch time (not render time) so each poll's
    // window slides forward to "now" rather than staying anchored to
    // whenever the range was last picked.
    queryFn: () => listTelemetry(id, { since: new Date(Date.now() - range.ms).toISOString(), limit: 500 }),
    refetchInterval: 15000,
  });

  const gapBefore = useMemo(() => (data ? detectGaps(data) : []), [data]);
  // The x axis spans the whole requested window, ending when the data was
  // fetched, so a device that went quiet shows as empty space at the end.
  const windowEnd = dataUpdatedAt;
  const windowStart = windowEnd - range.ms;
  const target = device?.device_state?.desired_state.target_temperature ?? null;

  function selectRange(index: number) {
    setRangeIndex(index);
    setHoveredIndex(null);
    try {
      localStorage.setItem(RANGE_KEY, RANGES[index].label);
    } catch {
      // Not remembered, still applied.
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-6 pb-10">
      <div className="flex items-center gap-1">
        <Link
          to={`/devices/${id}`}
          aria-label="Back to device"
          className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-ink no-underline"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="min-w-0">
          <h1 className="m-0 text-lg font-semibold">Temperature &amp; humidity</h1>
          {device && <div className="truncate text-xs text-ink-3">{deviceLabel(device)}</div>}
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-divider p-1" role="tablist" aria-label="Time range">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            type="button"
            role="tab"
            aria-selected={i === rangeIndex}
            onClick={() => selectRange(i)}
            className={`h-9 flex-1 rounded-lg text-[13px] font-medium ${
              i === rangeIndex ? "bg-card text-ink shadow-sm" : "bg-transparent text-ink-2"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-[290px] rounded-2xl" />
          <Skeleton className="h-[290px] rounded-2xl" />
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <ErrorBanner
            message={
              data ? "Can't reach the server. Showing the last loaded data." : `Couldn't load readings: ${(error as Error).message}`
            }
          />
        </div>
      )}

      {data && data.length === 0 && (
        <p className="mt-4 text-sm text-ink-3">No readings in the last {range.label.toLowerCase()}.</p>
      )}

      {data && data.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          <TelemetryChart
            title="Temperature"
            color="var(--c-accent)"
            readings={data}
            gapBefore={gapBefore}
            field="temperature"
            formatValue={(v) => `${v.toFixed(1)}°C`}
            yStep={1}
            windowStart={windowStart}
            windowEnd={windowEnd}
            rangeMs={range.ms}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
            reference={target !== null ? { value: target, label: `Target ${target}°` } : undefined}
          />
          <TelemetryChart
            title="Humidity"
            color="var(--c-humidity)"
            readings={data}
            gapBefore={gapBefore}
            field="humidity"
            formatValue={(v) => `${v.toFixed(0)}%`}
            yStep={5}
            windowStart={windowStart}
            windowEnd={windowEnd}
            rangeMs={range.ms}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
            band={COMFORT_HUMIDITY}
          />
        </div>
      )}
    </div>
  );
}
