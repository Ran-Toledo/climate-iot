import type { PointerEvent as ReactPointerEvent } from "react";
import type { Telemetry } from "../api/types";
import { formatAxisTick, formatTooltipTime } from "../lib/format";
import { computeStats, splitIntoRuns } from "../lib/telemetry";

// VIEW_W is deliberately 100 so an x coordinate IS a left-% -- used directly
// both inside the SVG viewBox and for the HTML overlays positioned over it.
const VIEW_W = 100;
const VIEW_H = 160;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
// Left gutter (in px) reserved for the y-axis labels.
const Y_LABEL_W = 34;

interface TelemetryChartProps {
  title: string;
  /** CSS colour, e.g. "var(--c-accent)". */
  color: string;
  readings: Telemetry[];
  gapBefore: boolean[];
  field: "temperature" | "humidity";
  formatValue: (v: number) => string;
  /** y-axis label/gridline step, in the field's unit. */
  yStep: number;
  /** The x axis always spans this window, not just the readings' own span. */
  windowStart: number;
  windowEnd: number;
  rangeMs: number;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  /** Optional dashed reference line, e.g. the AC's target temperature. */
  reference?: { value: number; label: string };
  /** Optional shaded band, e.g. a comfortable humidity range. */
  band?: { from: number; to: number; label: string };
}

export function TelemetryChart({
  title,
  color,
  readings,
  gapBefore,
  field,
  formatValue,
  yStep,
  windowStart,
  windowEnd,
  rangeMs,
  hoveredIndex,
  onHover,
  reference,
  band,
}: TelemetryChartProps) {
  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const values = readings.map((r) => r[field]);
  const timeSpan = Math.max(windowEnd - windowStart, 1);

  // y domain: the data plus the reference line, padded and snapped to yStep
  // so the axis labels are round numbers.
  const lo = Math.min(...values, ...(reference ? [reference.value] : []));
  const hi = Math.max(...values, ...(reference ? [reference.value] : []));
  let yMin = Math.floor((lo - yStep * 0.25) / yStep) * yStep;
  let yMax = Math.ceil((hi + yStep * 0.25) / yStep) * yStep;
  // At least two steps tall, so the three gridlines are distinct.
  if (yMax - yMin < 2 * yStep) {
    yMin -= yStep;
    if (yMax - yMin < 2 * yStep) yMax += yStep;
  }
  // An even number of steps puts the middle gridline on a round value too.
  if (Math.round((yMax - yMin) / yStep) % 2 === 1) yMax += yStep;
  const valueSpan = yMax - yMin;
  const yMid = (yMin + yMax) / 2;

  const xAt = (t: number) => ((t - windowStart) / timeSpan) * VIEW_W;
  const yAt = (v: number) => PAD_TOP + (1 - (v - yMin) / valueSpan) * PLOT_H;
  const clampY = (v: number) => Math.min(yMax, Math.max(yMin, v));

  const runs = splitIntoRuns(
    readings.map((_, i) => i),
    gapBefore,
  );

  const stats = computeStats(values);
  const latestIndex = values.length - 1;
  const minIndex = values.indexOf(Math.min(...values));
  const maxIndex = values.indexOf(Math.max(...values));
  const hovered = hoveredIndex !== null ? readings[hoveredIndex] : null;

  function handlePointer(e: ReactPointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = windowStart + relX * timeSpan;
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

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = windowStart + (i / (tickCount - 1)) * timeSpan;
    return i === tickCount - 1 ? "Now" : formatAxisTick(new Date(t).toISOString(), rangeMs);
  });

  const yLabel = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {formatValue(values[latestIndex])} latest
        </span>
      </div>

      <div className="relative" style={{ paddingLeft: Y_LABEL_W }}>
        {/* y-axis labels */}
        {[yMax, yMid, yMin].map((v) => (
          <span
            key={v}
            className="pointer-events-none absolute left-0 -translate-y-1/2 text-[11px] text-ink-3 tabular-nums"
            style={{ top: yAt(v) }}
          >
            {yLabel(v)}
          </span>
        ))}

        <div className="relative">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="block h-[160px] w-full">
            {band && band.to > yMin && band.from < yMax && (
              <rect
                x="0"
                y={yAt(clampY(band.to))}
                width={VIEW_W}
                height={yAt(clampY(band.from)) - yAt(clampY(band.to))}
                fill={color}
                opacity="0.07"
              />
            )}

            {[yMax, yMid, yMin].map((v) => (
              <line
                key={v}
                x1="0"
                y1={yAt(v)}
                x2={VIEW_W}
                y2={yAt(v)}
                stroke="var(--c-divider)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {reference && (
              <line
                x1="0"
                y1={yAt(reference.value)}
                x2={VIEW_W}
                y2={yAt(reference.value)}
                stroke="var(--c-target)"
                strokeWidth="1.5"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {runs.map((run, runIdx) => {
              const points = run.map((i) => `${xAt(times[i])},${yAt(values[i])}`).join(" ");
              const first = run[0];
              const last = run[run.length - 1];
              return (
                <g key={runIdx}>
                  <path
                    d={`M${xAt(times[first])},${VIEW_H - PAD_BOTTOM} L${points.replace(/ /g, " L")} L${xAt(times[last])},${VIEW_H - PAD_BOTTOM} Z`}
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
                stroke="var(--c-ink-3)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* pan-y: a horizontal drag scrubs the chart on touch screens
                while a vertical swipe still scrolls the page. */}
            <rect
              x="0"
              y="0"
              width={VIEW_W}
              height={VIEW_H}
              fill="transparent"
              style={{ touchAction: "pan-y" }}
              onPointerDown={handlePointer}
              onPointerMove={handlePointer}
              onPointerLeave={(e) => {
                if (e.pointerType !== "touch") onHover(null);
              }}
            />
          </svg>

          {/* HTML overlays -- SVG circles would render as ellipses under
              the chart's non-uniform x/y scaling, so these are fixed-size
              CSS circles positioned with the same x%/y-px math. */}
          {reference && (
            <span
              className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[11px] font-medium text-target"
              style={{ top: yAt(reference.value) }}
            >
              {reference.label}
            </span>
          )}
          {band && band.to > yMin && band.from < yMax && (
            <span
              className="pointer-events-none absolute left-1 pt-0.5 text-[11px] text-ink-3"
              style={{ top: yAt(clampY(band.to)) }}
            >
              {band.label}
            </span>
          )}

          {minIndex !== maxIndex &&
            [minIndex, maxIndex].map((i) => (
              <Marker key={`mm-${i}`} x={xAt(times[i])} y={yAt(values[i])} color={color} hollow />
            ))}
          <Marker x={xAt(times[latestIndex])} y={yAt(values[latestIndex])} color={color} />
          {hoveredIndex !== null && (
            <Marker x={xAt(times[hoveredIndex])} y={yAt(values[hoveredIndex])} color={color} />
          )}

          {hovered && (
            <div
              className="pointer-events-none absolute -top-2 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-tooltip px-2 py-1 whitespace-nowrap"
              style={{ left: `${Math.min(88, Math.max(12, xAt(times[hoveredIndex!])))}%` }}
            >
              <span className="text-[11px] text-on-tooltip-2">
                {formatTooltipTime(hovered.recorded_at, rangeMs)}
              </span>
              <span className="text-xs font-semibold text-on-tooltip tabular-nums">
                {formatValue(hovered[field])}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between text-[11px] text-ink-3" style={{ paddingLeft: Y_LABEL_W }}>
        {ticks.map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>

      {stats && (
        <div className="flex items-center justify-between border-t border-divider pt-2">
          <StatCell label="Min" value={formatValue(stats.min)} />
          <StatCell label="Avg" value={formatValue(stats.avg)} />
          <StatCell label="Max" value={formatValue(stats.max)} />
        </div>
      )}
    </div>
  );
}

function Marker({ x, y, color, hollow }: { x: number; y: number; color: string; hollow?: boolean }) {
  return (
    <span
      className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: `${x}%`,
        top: y,
        background: hollow ? "var(--c-card)" : color,
        border: `2px solid ${hollow ? color : "var(--c-card)"}`,
        boxSizing: "content-box",
      }}
    />
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-ink-3">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
