import { useMemo } from "react";
import type { Telemetry } from "../api/types";
import { detectGaps, splitIntoRuns } from "../lib/telemetry";

const W = 100;
const H = 40;
const PAD = 3;

/** A small temperature line with no axes. Breaks the line at data gaps. */
export function Sparkline({
  readings,
  className,
  height = 40,
}: {
  readings: Telemetry[] | undefined;
  className?: string;
  height?: number;
}) {
  const runs = useMemo(() => {
    if (!readings || readings.length < 2) return [];
    const times = readings.map((r) => new Date(r.recorded_at).getTime());
    const values = readings.map((r) => r.temperature);
    const tMin = times[0];
    const tSpan = Math.max(times[times.length - 1] - tMin, 1);
    const vMin = Math.min(...values);
    const vSpan = Math.max(Math.max(...values) - vMin, 0.5);
    const points = readings.map(
      (_, i) =>
        `${(((times[i] - tMin) / tSpan) * W).toFixed(2)},${(PAD + (1 - (values[i] - vMin) / vSpan) * (H - 2 * PAD)).toFixed(2)}`,
    );
    return splitIntoRuns(points, detectGaps(readings));
  }, [readings]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height }}
      aria-hidden="true"
    >
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run.join(" ")}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
