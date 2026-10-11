import { levelOf, USAGE, type Thresholds } from "../lib/level";

interface Segment {
  value: number;
  tone: "strong" | "mid" | "dim";
}

interface MeterProps {
  /** 0..1, or several stacked segments that add up to at most 1. */
  value: number | Segment[];
  thresholds?: Thresholds;
  label?: string;
}

export function Meter({ value, thresholds = USAGE, label }: MeterProps) {
  const segments: Segment[] = typeof value === "number" ? [{ value, tone: "mid" }] : value;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  // In a stacked meter only the strong segment is pressure (memory cache is not).
  const measured = typeof value === "number" ? value : segments.filter((s) => s.tone === "strong").reduce((sum, s) => sum + s.value, 0);
  const level = levelOf(measured, thresholds);

  return (
    <div
      className={`meter meter-${level}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(total * 100)}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          className={`meter-fill meter-${segment.tone}`}
          style={{ width: `${Math.min(100, Math.max(0, segment.value * 100))}%` }}
        />
      ))}
    </div>
  );
}
