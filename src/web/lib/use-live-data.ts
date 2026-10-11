import { useEffect, useState } from "react";
import type { History, InitialPayload, Snapshot, TickPayload } from "../../shared/types";

export type Connection = "connecting" | "live" | "offline";

export interface LiveData {
  snapshot: Snapshot | null;
  history: History;
  historySize: number;
  connection: Connection;
}

function append(history: History, points: TickPayload["points"], size: number): History {
  const next: History = { ...history };
  for (const [key, value] of Object.entries(points)) {
    const values = [...(next[key] ?? []), value];
    next[key] = values.length > size ? values.slice(values.length - size) : values;
  }
  return next;
}

export function useLiveData(): LiveData {
  const [data, setData] = useState<LiveData>({ snapshot: null, history: {}, historySize: 300, connection: "connecting" });

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    async function connect(): Promise<void> {
      try {
        const response = await fetch("/api/snapshot");
        if (!response.ok) throw new Error(String(response.status));
        const initial = (await response.json()) as InitialPayload;
        if (cancelled) return;
        setData({ snapshot: initial.snapshot, history: initial.history, historySize: initial.historySize, connection: "live" });
      } catch {
        if (!cancelled) setTimeout(connect, 2000);
        return;
      }

      source = new EventSource("/api/stream");
      source.onmessage = (event: MessageEvent<string>) => {
        const tick = JSON.parse(event.data) as TickPayload;
        setData((current) => ({
          ...current,
          snapshot: tick.snapshot,
          history: append(current.history, tick.points, current.historySize),
          connection: "live",
        }));
      };
      source.onerror = () => setData((current) => ({ ...current, connection: "offline" }));
    }

    void connect();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  return data;
}
