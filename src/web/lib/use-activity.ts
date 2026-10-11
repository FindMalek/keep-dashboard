import { useEffect, useState } from "react";
import type { ActivityPayload } from "../../shared/types";

const REFRESH_MS = 15_000;

export function useActivity(): ActivityPayload | null {
  const [data, setData] = useState<ActivityPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/activity");
        if (response.ok && !cancelled) setData((await response.json()) as ActivityPayload);
      } catch {
        // Keep showing the last good data.
      }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return data;
}
