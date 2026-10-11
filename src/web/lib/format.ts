const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];
const RATE_UNITS = ["B/s", "KB/s", "MB/s", "GB/s"];

function scaled(value: number, base: number, units: string[]): { value: number; unit: string } {
  let index = 0;
  let current = Math.max(0, value);
  while (current >= base && index < units.length - 1) {
    current /= base;
    index += 1;
  }
  return { value: current, unit: units[index] ?? "" };
}

function digits(value: number): string {
  if (value === 0) return "0";
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toString();
}

export function bytes(value: number): string {
  const { value: amount, unit } = scaled(value, 1024, BYTE_UNITS);
  return `${digits(amount)} ${unit}`;
}

export function rate(bytesPerSecond: number): string {
  const { value: amount, unit } = scaled(bytesPerSecond, 1000, RATE_UNITS);
  return `${digits(amount)} ${unit}`;
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function temperature(celsius: number | null): string {
  return celsius === null ? "—" : `${Math.round(celsius)}°`;
}

export function duration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Line speed in bits, the way ISPs quote it. */
export function mbps(bytesPerSecond: number, decimals = 1): string {
  const megabits = (bytesPerSecond * 8) / 1e6;
  return `${megabits >= 100 ? Math.round(megabits) : megabits.toFixed(decimals)} Mb/s`;
}
