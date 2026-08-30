import type { Telemetry } from "../api/types";

/**
 * Flags, per index, whether there's a data gap between readings[i-1] and
 * readings[i]. There's no fixed expected sampling interval (the simulator
 * and real hardware can run at different cadences), so the threshold is
 * derived from the data itself: anything much longer than the series'
 * own typical (median) interval counts as a gap.
 */
export function detectGaps(readings: Telemetry[]): boolean[] {
  const gapBefore = readings.map(() => false);
  if (readings.length < 3) return gapBefore;

  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) {
    intervals.push(times[i] - times[i - 1]);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(median * 4, 60_000);

  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > threshold) {
      gapBefore[i] = true;
    }
  }
  return gapBefore;
}

export interface Stats {
  min: number;
  avg: number;
  max: number;
}

export function computeStats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { min, avg, max };
}

/** Splits readings into contiguous runs, breaking wherever detectGaps flags a gap. */
export function splitIntoRuns<T>(items: T[], gapBefore: boolean[]): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  items.forEach((item, i) => {
    if (gapBefore[i] && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(item);
  });
  if (current.length > 0) runs.push(current);
  return runs;
}
