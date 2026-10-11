import { useRef, useState, type PointerEvent } from "react";
import { duration } from "../lib/format";

export type Values = (number | null)[];

/** What a panel needs to draw one graph, whatever the selected range. */
export interface SeriesView {
  values: Values;
  /** Second series drawn dimmer on the same scale: upload under download, or peaks under averages. */
  secondary?: Values;
  capacity: number;
  stepSec: number;
}

interface SparklineProps extends SeriesView {
  /** Fixed top of the scale (1 for ratios); otherwise scales to the data. */
  max?: number;
  /** Smallest auto scale, so an idle link doesn't show a 1 B/s axis. */
  minTop?: number;
  format: (value: number) => string;
  height?: number;
  label: string;
}

const WIDTH = 600;

function xOf(slot: number, capacity: number): number {
  return (slot * WIDTH) / Math.max(1, capacity - 1);
}

/** Polylines split at gaps (null), so missing minutes don't draw a fake line. */
function segments(values: Values, capacity: number, top: number, height: number): string[] {
  const offset = capacity - values.length;
  const result: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) result.push(current.join(" "));
      current = [];
      return;
    }
    const y = height - (Math.min(value, top) / top) * (height - 1) - 0.5;
    current.push(`${xOf(offset + index, capacity).toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length) result.push(current.join(" "));
  return result;
}

function niceTop(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function ago(seconds: number): string {
  if (seconds <= 0) return "now";
  return seconds < 60 ? `−${seconds}s` : `−${duration(seconds)}`;
}

function finite(values: Values | undefined): number[] {
  return (values ?? []).filter((value): value is number => value !== null);
}

export function Sparkline({
  values,
  secondary,
  capacity,
  stepSec,
  max,
  minTop = 0,
  format,
  height = 56,
  label,
}: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const top = max ?? niceTop(Math.max(...finite(values), ...finite(secondary), minTop));
  const lines = segments(values, capacity, top, height);
  const secondaryLines = secondary ? segments(secondary, capacity, top, height) : [];
  const offset = capacity - values.length;

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const slot = Math.round(((event.clientX - rect.left) / rect.width) * (capacity - 1));
    const index = slot - offset;
    setHover(index >= 0 && index < values.length ? index : null);
  }

  const hovered = hover === null ? undefined : values[hover];
  const hoveredSecondary = hover === null ? undefined : secondary?.[hover];

  return (
    <div
      ref={ref}
      className="sparkline"
      style={{ height }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`${label}, last ${duration(capacity * stepSec)}`}
    >
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="sparkline-base" x1="0" x2={WIDTH} y1={height - 0.5} y2={height - 0.5} />
        <line className="sparkline-mid" x1="0" x2={WIDTH} y1={height / 2} y2={height / 2} />
        {lines.map((line, index) => {
          const first = line.slice(0, line.indexOf(","));
          const last = line.slice(line.lastIndexOf(" ") + 1, line.lastIndexOf(","));
          return <polygon key={`a${index}`} className="sparkline-area" points={`${first},${height} ${line} ${last || first},${height}`} />;
        })}
        {secondaryLines.map((line, index) => (
          <polyline key={`s${index}`} className="sparkline-secondary" points={line} />
        ))}
        {lines.map((line, index) => (
          <polyline key={`l${index}`} className="sparkline-line" points={line} />
        ))}
        {hover !== null && (
          <line
            className="sparkline-cursor"
            x1={xOf(offset + hover, capacity)}
            x2={xOf(offset + hover, capacity)}
            y1="0"
            y2={height}
          />
        )}
      </svg>
      <span className="sparkline-scale">{format(top)}</span>
      {hover !== null && (
        <span className="sparkline-readout">
          {hovered === null || hovered === undefined ? "no data" : format(hovered)}
          {hoveredSecondary !== null && hoveredSecondary !== undefined && ` · ${format(hoveredSecondary)}`}
          <span className="muted"> · {ago((values.length - 1 - hover) * stepSec)}</span>
        </span>
      )}
    </div>
  );
}
