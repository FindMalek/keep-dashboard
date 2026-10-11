export type Level = "normal" | "warn" | "crit";

export interface Thresholds {
  warn: number;
  crit: number;
}

export const USAGE: Thresholds = { warn: 0.75, crit: 0.9 };
export const QUOTA: Thresholds = { warn: 0.8, crit: 0.95 };
/** Ratios of 100 °C: orange from 70°, red from 85°. */
export const HEAT: Thresholds = { warn: 0.7, crit: 0.85 };

export function levelOf(ratio: number, thresholds: Thresholds = USAGE): Level {
  if (ratio >= thresholds.crit) return "crit";
  if (ratio >= thresholds.warn) return "warn";
  return "normal";
}

/** Class for text that should turn orange/red with its value. */
export function levelClass(ratio: number, thresholds: Thresholds = USAGE): string {
  const level = levelOf(ratio, thresholds);
  return level === "normal" ? "" : `level-${level}`;
}
