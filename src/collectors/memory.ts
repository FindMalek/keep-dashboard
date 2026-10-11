import type { MemoryStats } from "../shared/types";
import { HOST_PROC, readText } from "../lib/host";

export async function collectMemory(): Promise<MemoryStats> {
  const text = (await readText(`${HOST_PROC}/meminfo`)) ?? "";
  const kb = (key: string): number => Number(new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text)?.[1] ?? 0) * 1024;

  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  const swapTotal = kb("SwapTotal");

  return {
    total,
    available,
    used: total - available,
    cached: kb("Cached") + kb("Buffers") + kb("SReclaimable"),
    swapTotal,
    swapUsed: swapTotal - kb("SwapFree"),
  };
}
