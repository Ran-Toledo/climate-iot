import type { PointerEvent as ReactPointerEvent } from "react";
import type { Telemetry } from "../api/types";
import { formatAxisTick, formatTooltipTime } from "../lib/format";
import { computeStats, splitIntoRuns } from "../lib/telemetry";

// VIEW_W is deliberately 100 so an x coordinate IS a left-% -- used directly
// both inside the SVG viewBox and for the HTML marker overlays below it.
const VIEW_W = 100;
const VIEW_H = 140;
const PAD_TOP = 15;
const PAD_BOTTOM = 15;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

interface TelemetryChartProps {
  title: string;
  color: string;
  readings: Telemetry[];
  gapBefore: boolean[];
  field: "temperature" | "humidity";
  formatValue: (v: number) => string;
  rangeMs: number;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}

export function TelemetryChart({
  title,
  color,
  readings,
  gapBefore,
  field,
  formatValue,
  rangeMs,
  hoveredIndex,
  onHover,
}: TelemetryChartProps) {
  if (readings.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-[#898781]">No readings in this range.</span>
      </div>
    );
  }

  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const values = readings.map((r) => r[field]);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const timeSpan = Math.max(tMax - tMin, 1);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const yMin = rawMin === rawMax ? rawMin - 1 : rawMin;
  const yMax = rawMin === rawMax ? rawMax + 1 : rawMax;
  const valueSpan = yMax - yMin;

  // x is a plain 0-100 percentage (VIEW_W=100); y is px, 1:1 with the SVG's
  // fixed 140px render height -- both reused as-is by the HTML marker overlay.
  const xAt = (t: number) => ((t - tMin) / timeSpan) * VIEW_W;
  const yAt = (v: number) => PAD_TOP + (1 - (v - yMin) / valueSpan) * PLOT_H;

  const indices = readings.map((_, i) => i);
  const runs = splitIntoRuns(indices, gapBefore);

  const gapBoundaryIndices = new Set<number>();
  gapBefore.forEach((isGap, i) => {
    if (isGap) {
      gapBoundaryIndices.add(i - 1);
      gapBoundaryIndices.add(i);
    }
  });

  function handlePointerMove(e: ReactPointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = tMin + relX * timeSpan;
    let nearest = 0;
    let nearestDist = Infinity;
    times.forEach((time, i) => {
      const dist = Math.abs(time - t);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    onHover(nearest);
  }

  const stats = computeStats(values);
  const latestIndex = values.length - 1;
  const hovered = hoveredIndex !== null ? readings[hoveredIndex] : null;

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = tMin + (i / (tickCount - 1)) * timeSpan;
    return i === tickCount - 1 ? "Now" : formatAxisTick(new Date(t).toISOString(), rangeMs);
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[rgba(11,11,11,0.10)] bg-[#fcfcfb] p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-[#52514e] tabular-nums">
          {formatValue(values[latestIndex])} now
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-[140px] w-full"
        >
          {[PAD_TOP, PAD_TOP + PLOT_H / 2, VIEW_H - PAD_BOTTOM].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={VIEW_W}
              y2={y}
              stroke="#e1e0d9"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {runs.map((run, runIdx) => {
            const points = run.map((i) => `${xAt(times[i])},${yAt(values[i])}`).join(" ");
            const first = run[0];
            const last = run[run.length - 1];
            return (
              <g key={runIdx}>
                <path
                  d={`M${xAt(times[first])},${VIEW_H} L${points.replace(/ /g, " L")} L${xAt(times[last])},${VIEW_H} Z`}
                  fill={color}
                  opacity="0.1"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {runs.slice(1).map((run, i) => {
            const prevRun = runs[i];
            const from = prevRun[prevRun.length - 1];
            const to = run[0];
            return (
              <line
                key={`gap-${i}`}
                x1={xAt(times[from])}
                y1={yAt(values[from])}
                x2={xAt(times[to])}
                y2={yAt(values[to])}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="0.5 6"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {hoveredIndex !== null && (
            <line
              x1={xAt(times[hoveredIndex])}
              y1="0"
              x2={xAt(times[hoveredIndex])}
              y2={VIEW_H}
              stroke="#898781"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <rect
            x="0"
            y="0"
            width={VIEW_W}
            height={VIEW_H}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => onHover(null)}
          />
        </svg>

        {/* HTML overlay for markers -- SVG circles would render as ellipses
            under the chart's non-uniform x/y scaling, so these are plain
            fixed-size CSS circles positioned with the same x%/y-px math. */}
        {[...gapBoundaryIndices].map((i) => (
          <span
            key={`ring-${i}`}
            className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] bg-[#fcfcfb]"
            style={{ left: `${xAt(times[i])}%`, top: `${yAt(values[i])}px`, borderColor: color }}
          />
        ))}

        <span
          className="pointer-events-none absolute h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fcfcfb]"
          style={{ left: `${xAt(tMax)}%`, top: `${yAt(values[latestIndex])}px` }}
        />
        <span
          className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${xAt(tMax)}%`, top: `${yAt(values[latestIndex])}px`, background: color }}
        />

        {hoveredIndex !== null && (
          <>
            <span
              className="pointer-events-none absolute h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fcfcfb]"
              style={{ left: `${xAt(times[hoveredIndex])}%`, top: `${yAt(values[hoveredIndex])}px` }}
            />
            <span
              className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${xAt(times[hoveredIndex])}%`, top: `${yAt(values[hoveredIndex])}px`, background: color }}
            />
          </>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-[-8px] flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-[#0b0b0b] px-2 py-1 whitespace-nowrap"
            style={{ left: `${Math.min(92, Math.max(8, xAt(times[hoveredIndex!])))}%` }}
          >
            <span className="text-[11px] text-[#c3c2b7]">
              {formatTooltipTime(hovered.recorded_at, rangeMs)}
            </span>
            <span className="text-xs font-semibold text-[#fcfcfb] tabular-nums">
              {formatValue(hovered[field])}
            </span>
          </div>
        )}
      </div>

      {stats && (
        <div className="flex items-center justify-between border-t border-[#e1e0d9] pt-2">
          <StatCell label="Min" value={formatValue(stats.min)} />
          <StatCell label="Avg" value={formatValue(stats.avg)} />
          <StatCell label="Max" value={formatValue(stats.max)} />
        </div>
      )}

      <div className="flex justify-between text-[11px] text-[#898781]">
        {ticks.map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#898781]">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
