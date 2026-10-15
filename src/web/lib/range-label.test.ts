import { expect, test } from "bun:test";
import { rangeLabel } from "./range-label";

test("the header says when history starts later than the chosen range", () => {
  const day = 86_400;
  const start = Date.UTC(2026, 9, 1) / 1000;
  const data = (first: number) => ({
    range: "30d" as const,
    stepSec: day,
    start,
    series: { cpu: { avg: [...Array(first).fill(null), 0.2, 0.3], max: [] } },
  });
  expect(rangeLabel("live", null)).toBe("last 5 minutes, every second");
  expect(rangeLabel("30d", null)).toBe("loading the last 30d…");
  expect(rangeLabel("30d", data(0))).toBe("averages, last 30d");
  expect(rangeLabel("30d", data(10))).toMatch(/^averages, last 30d · history since 1[01] oct$/);
});
