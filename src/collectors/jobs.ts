import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { ActionRecord, JobsStats, TidySummary, UsageStats } from "../shared/types";
import { readText } from "../lib/host";

/** The host agent re-checks everything; this list only keeps junk out of the request queue. */
const ALLOWED = /^(reboot|tidy|run:keep-[a-z-]+)$/;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return (JSON.parse((await readText(path)) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function collectJobs(dataDir: string): Promise<JobsStats> {
  const [status, actions, tidy] = await Promise.all([
    readJson<Pick<JobsStats, "updatedAt" | "jobs">>(`${dataDir}/jobs.json`, { updatedAt: null, jobs: [] }),
    readJson<ActionRecord[]>(`${dataDir}/actions.json`, []),
    readJson<TidySummary | null>(`${dataDir}/tidy.json`, null),
  ]);
  return { ...status, actions, tidy };
}

export async function collectUsage(dataDir: string): Promise<UsageStats> {
  return readJson<UsageStats>(`${dataDir}/usage.json`, { at: null, paths: {} });
}

/** Queues an action for `keep-agent` on the host; returns false for anything not on the list. */
export async function requestAction(dataDir: string, action: string): Promise<boolean> {
  if (!ALLOWED.test(action)) return false;
  await mkdir(`${dataDir}/requests`, { recursive: true });
  await Bun.write(`${dataDir}/requests/${Date.now()}-${randomUUID().slice(0, 8)}.json`, JSON.stringify({ action }));
  return true;
}
