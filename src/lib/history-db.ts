import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { Points, RangeHistory, RangeName } from "../shared/types";

const RETENTION_SEC = 31 * 86400;

export const RANGES: Record<Exclude<RangeName, "live">, { spanSec: number; stepSec: number }> = {
  "1h": { spanSec: 3600, stepSec: 60 },
  "24h": { spanSec: 86400, stepSec: 300 },
  "7d": { spanSec: 7 * 86400, stepSec: 1800 },
  "30d": { spanSec: 30 * 86400, stepSec: 7200 },
};

interface Accumulator {
  sum: number;
  count: number;
  max: number;
}

/** Folds 1-second points into one row per key per minute (avg + max) and keeps 31 days. */
export class HistoryDb {
  private readonly db: Database;
  private current = new Map<string, Accumulator>();
  private minute = 0;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(`${dataDir}/history.db`, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(
      "CREATE TABLE IF NOT EXISTS points (ts INTEGER NOT NULL, key TEXT NOT NULL, avg REAL NOT NULL, max REAL NOT NULL, PRIMARY KEY (key, ts)) WITHOUT ROWID",
    );
  }

  add(points: Points, nowMs: number): void {
    const minute = Math.floor(nowMs / 60_000) * 60;
    if (this.minute && minute !== this.minute) this.flush();
    this.minute = minute;

    for (const [key, value] of Object.entries(points)) {
      if (!Number.isFinite(value)) continue;
      const acc = this.current.get(key) ?? { sum: 0, count: 0, max: -Infinity };
      acc.sum += value;
      acc.count += 1;
      acc.max = Math.max(acc.max, value);
      this.current.set(key, acc);
    }
  }

  private flush(): void {
    const insert = this.db.prepare("INSERT OR REPLACE INTO points (ts, key, avg, max) VALUES (?, ?, ?, ?)");
    const rows = [...this.current];
    this.db.transaction(() => {
      for (const [key, acc] of rows) insert.run(this.minute, key, acc.sum / acc.count, acc.max);
    })();
    this.current = new Map();
    if (this.minute % 3600 === 0) {
      this.db.run("DELETE FROM points WHERE ts < ?", [this.minute - RETENTION_SEC]);
    }
  }

  query(range: Exclude<RangeName, "live">, keys: string[], nowMs: number): RangeHistory {
    const { spanSec, stepSec } = RANGES[range];
    const end = Math.floor(nowMs / 1000 / stepSec) * stepSec;
    const start = end - spanSec + stepSec;
    const buckets = spanSec / stepSec;
    const series: RangeHistory["series"] = {};
    if (keys.length === 0) return { range, stepSec, start, series };

    const rows = this.db
      .query<{ bucket: number; key: string; avg: number; max: number }, (string | number)[]>(
        `SELECT (ts / ?1) * ?1 AS bucket, key, AVG(avg) AS avg, MAX(max) AS max
           FROM points
          WHERE ts >= ?2 AND key IN (${keys.map(() => "?").join(",")})
          GROUP BY bucket, key`,
      )
      .all(stepSec, start, ...keys);

    for (const key of keys) series[key] = { avg: new Array(buckets).fill(null), max: new Array(buckets).fill(null) };
    for (const row of rows) {
      const index = (row.bucket - start) / stepSec;
      const entry = series[row.key];
      if (!entry || index < 0 || index >= buckets) continue;
      entry.avg[index] = row.avg;
      entry.max[index] = row.max;
    }
    return { range, stepSec, start, series };
  }
}
