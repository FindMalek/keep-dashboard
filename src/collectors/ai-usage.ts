import { mkdir, rename } from "node:fs/promises";
import type { AiUsageEntry } from "../shared/types";
import { readText } from "../lib/host";

const ALERT_AT = 80;
const NAME = /^[a-z0-9._-]{1,40}$/i;
const pct = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
const iso = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

export async function readAiUsage(dataDir: string): Promise<AiUsageEntry[]> {
  try {
    return (JSON.parse((await readText(`${dataDir}/ai-usage.json`)) ?? "[]") as AiUsageEntry[]) ?? [];
  } catch {
    return [];
  }
}

/** Stores one tool/machine reading; returns the entry and whether the weekly limit just crossed the alert line. */
export async function recordAiUsage(
  dataDir: string,
  body: unknown,
  notify: (message: string) => Promise<void> = async () => {},
): Promise<AiUsageEntry | null> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.tool !== "string" || typeof b.machine !== "string" || !NAME.test(b.tool) || !NAME.test(b.machine)) return null;
  const entry: AiUsageEntry = {
    tool: b.tool,
    machine: b.machine,
    fiveHourPct: pct(b.fiveHourPct),
    weeklyPct: pct(b.weeklyPct),
    fiveHourResetsAt: iso(b.fiveHourResetsAt),
    weeklyResetsAt: iso(b.weeklyResetsAt),
    at: new Date().toISOString(),
  };
  if (entry.fiveHourPct === null && entry.weeklyPct === null) return null;

  const all = await readAiUsage(dataDir);
  const previous = all.find((e) => e.tool === entry.tool && e.machine === entry.machine);
  const next = [...all.filter((e) => e !== previous), entry];
  await mkdir(dataDir, { recursive: true });
  await Bun.write(`${dataDir}/ai-usage.json.tmp`, JSON.stringify(next));
  await rename(`${dataDir}/ai-usage.json.tmp`, `${dataDir}/ai-usage.json`);

  if ((entry.weeklyPct ?? 0) >= ALERT_AT && (previous?.weeklyPct ?? 0) < ALERT_AT) {
    await notify(`${entry.tool} on ${entry.machine} is at ${Math.round(entry.weeklyPct!)}% of the weekly limit`);
  }
  return entry;
}
