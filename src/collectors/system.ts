import { lookup } from "node:dns/promises";
import type { HostInfo } from "../shared/types";
import { HOST_ETC, HOST_PROC, readText } from "../lib/host";
import { hostAddresses } from "./network";

const TAILSCALE_RANGE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const PRIVATE_RANGE = /^(192\.168\.|10\.)/;

export async function collectHost(): Promise<Omit<HostInfo, "publicIp" | "dnsIp">> {
  const [hostname, osRelease, kernel, uptime, loadavg, addresses] = await Promise.all([
    readText(`${HOST_ETC}/hostname`),
    readText(`${HOST_ETC}/os-release`),
    readText(`${HOST_PROC}/sys/kernel/osrelease`),
    readText(`${HOST_PROC}/uptime`),
    readText(`${HOST_PROC}/loadavg`),
    hostAddresses(),
  ]);

  return {
    hostname: hostname?.trim() || "host",
    os: /^PRETTY_NAME="?([^"\n]+)"?/m.exec(osRelease ?? "")?.[1] ?? "linux",
    kernel: kernel?.trim() ?? "",
    uptimeSec: Number(uptime?.split(" ")[0] ?? 0),
    processes: Number(loadavg?.split(" ")[3]?.split("/")[1] ?? 0),
    lanIp: addresses.find((ip) => PRIVATE_RANGE.test(ip)) ?? null,
    tailscaleIp: addresses.find((ip) => TAILSCALE_RANGE.test(ip)) ?? null,
  };
}

export async function publicIp(): Promise<string | null> {
  try {
    const response = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) });
    return (await response.text()).trim();
  } catch {
    return null;
  }
}

export async function resolveIp(host: string | null): Promise<string | null> {
  if (!host) return null;
  try {
    return (await lookup(host, { family: 4 })).address;
  } catch {
    return null;
  }
}
