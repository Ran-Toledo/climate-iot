import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listTelemetry } from "../api/devices";
import { ChevronLeftIcon } from "../components/icons";
import { ErrorBanner } from "../components/ErrorBanner";
import { Skeleton } from "../components/Skeleton";
import { TelemetryChart } from "../components/TelemetryChart";
import { detectGaps } from "../lib/telemetry";

const RANGES = [
  { label: "1H", ms: 60 * 60 * 1000 },
  { label: "24H", ms: 24 * 60 * 60 * 1000 },
  { label: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30D", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function DeviceGraphPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const [rangeIndex, setRangeIndex] = useState(1); // default 24H
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const range = RANGES[rangeIndex];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["telemetry", id, range.label],
    // since is computed at fetch time (not render time) so each poll's
    // window slides forward to "now" rather than staying anchored to
    // whenever the range was last picked.
    queryFn: () => listTelemetry(id, { since: new Date(Date.now() - range.ms).toISOString(), limit: 500 }),
    refetchInterval: 15000,
  });

  const gapBefore = useMemo(() => (data ? detectGaps(data) : []), [data]);

  function selectRange(index: number) {
    setRangeIndex(index);
    setHoveredIndex(null);
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-8 pb-8">
      <div className="flex items-center gap-3">
        <Link
          to={`/devices/${id}`}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-[#0b0b0b] no-underline"
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="text-xl font-semibold">Temperature &amp; humidity</h1>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={() => selectRange(i)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-medium ${
              i === rangeIndex ? "bg-[#2a78d6] text-[#fcfcfb]" : "border border-[rgba(11,11,11,0.14)] text-[#52514e]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-[260px] rounded-xl" />
          <Skeleton className="h-[260px] rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <ErrorBanner message={`Couldn't load telemetry: ${(error as Error).message}`} />
        </div>
      )}

      {data && data.length === 0 && (
        <p className="mt-4 text-sm text-[#898781]">No readings in this range.</p>
      )}

      {data && data.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          <TelemetryChart
            title="Temperature"
            color="#2a78d6"
            readings={data}
            gapBefore={gapBefore}
            field="temperature"
            formatValue={(v) => `${v.toFixed(1)}°C`}
            rangeMs={range.ms}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
          <TelemetryChart
            title="Humidity"
            color="#1baf7a"
            readings={data}
            gapBefore={gapBefore}
            field="humidity"
            formatValue={(v) => `${v.toFixed(0)}%`}
            rangeMs={range.ms}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        </div>
      )}
    </div>
  );
}
