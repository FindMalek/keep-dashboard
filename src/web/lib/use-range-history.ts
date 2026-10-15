import { useEffect, useState } from "react";
import type { RangeHistory, RangeName } from "../../shared/types";

const REFRESH_MS = 60_000;

/** Long-term series from the server; null while `range` is live or loading. */
export function useRangeHistory(range: RangeName, keys: string[]): RangeHistory | null {
  const [data, setData] = useState<RangeHistory | null>(null);
  const keyList = keys.join(",");

  useEffect(() => {
    // A new range never shows the previous one's data, even for the moment its own is loading.
    setData(null);
    if (range === "live") return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/history?range=${range}&keys=${encodeURIComponent(keyList)}`);
        if (response.ok && !cancelled) setData((await response.json()) as RangeHistory);
      } catch {
        // Keep the last good data; the next refresh retries.
      }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [range, keyList]);

  return data;
}
