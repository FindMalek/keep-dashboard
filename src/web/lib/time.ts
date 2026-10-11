import { duration } from "./format";

export function since(ms: number): string {
  const seconds = Math.max(0, (Date.now() - ms) / 1000);
  return seconds < 60 ? "just now" : `${duration(seconds)} ago`;
}

export function until(ms: number): string {
  const seconds = (ms - Date.now()) / 1000;
  return seconds <= 0 ? "expired" : `in ${duration(Math.max(60, seconds))}`;
}

export function clock(ms: number, withSeconds = false): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false });
}

/** "today", "yesterday", or "fri 9 oct". */
export function dayLabel(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }).toLowerCase().replace(",", "");
}

export function stamp(ms: number): string {
  return `${dayLabel(ms)} ${clock(ms)}`;
}
