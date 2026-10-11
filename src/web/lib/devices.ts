import type { Device } from "../../shared/types";

export interface Who {
  name: string;
  /** How they reached the server: tailscale, lan, public, internal. */
  via: string;
}

/** Names an IP after a tailnet device when we can, so logs read "MacBook Pro" instead of 192.168.1.20. */
export function whoIs(ip: string | null, devices: Device[], publicIp: string | null): Who {
  if (!ip) return { name: "server", via: "local" };
  const byTailscale = devices.find((device) => device.tailscaleIp === ip);
  if (byTailscale) return { name: byTailscale.self ? "this server" : byTailscale.name, via: "tailscale" };
  const byLan = devices.find((device) => device.lanIp === ip);
  if (byLan) return { name: byLan.name, via: "lan" };
  if (ip === publicIp) return { name: "home network", via: "public ip" };
  if (/^(192\.168\.|10\.)/.test(ip)) return { name: ip, via: "lan" };
  if (/^(127\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return { name: "server", via: "internal" };
  return { name: ip, via: "internet" };
}

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
  ["curl", /curl\/([\d.]+)/],
];

const SYSTEMS: [string, RegExp][] = [
  ["iOS", /iPhone|iPad/],
  ["Android", /Android/],
  ["macOS", /Mac OS X/],
  ["Windows", /Windows/],
  ["Linux", /Linux/],
];

/** "Chrome 154 · macOS" from a user agent string. */
export function browserOf(userAgent: string): string {
  const browser = BROWSERS.map(([name, pattern]) => [name, pattern.exec(userAgent)?.[1]] as const).find(([, version]) => version);
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  const label = browser ? `${browser[0]} ${browser[1]}` : userAgent.split(" ")[0] || "unknown";
  return system ? `${label} · ${system}` : label;
}
