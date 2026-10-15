import type { RangeHistory, RangeName } from "../../shared/types";

/** What the header says about the range, including when history starts later than the range does. */
export function rangeLabel(range: RangeName, data: RangeHistory | null): string {
  if (range === "live") return "last 5 minutes, every second";
  if (!data) return `loading the last ${range}…`;
  const cpu = data.series.cpu?.avg ?? [];
  const first = cpu.findIndex((value) => value !== null);
  if (first <= 0) return `averages, last ${range}`;
  const since = new Date((data.start + first * data.stepSec) * 1000);
  return `averages, last ${range} · history since ${since.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase()}`;
}
