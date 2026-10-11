import type { KumaMonitor, UptimeStats } from "../shared/types";
import { readText } from "../lib/host";

const LINE = /^(monitor_\w+)\{([^}]*)\}\s+(\S+)$/;
const LABEL = /(\w+)="((?:[^"\\]|\\.)*)"/g;

function labelsOf(raw: string): Record<string, string> {
  return Object.fromEntries([...raw.matchAll(LABEL)].map((match) => [match[1], match[2]]));
}

/** Reads Kuma's results so the dashboard can show them; Kuma itself keeps doing the checks and alerts. */
export function createKumaCollector(baseUrl: string | null, keyPath: string): () => Promise<UptimeStats> {
  let key: string | null = null;

  return async () => {
    if (!baseUrl) return { reachable: false, monitors: [] };
    key ??= (await readText(keyPath))?.trim() || null;
    if (!key) return { reachable: false, monitors: [] };

    try {
      const response = await fetch(`${baseUrl}/metrics`, {
        headers: { authorization: `Basic ${btoa(`:${key}`)}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { reachable: false, monitors: [] };

      const monitors = new Map<string, KumaMonitor>();
      for (const line of (await response.text()).split("\n")) {
        const match = LINE.exec(line);
        if (!match) continue;
        const [, metric, rawLabels, rawValue] = match;
        const labels = labelsOf(rawLabels ?? "");
        const id = labels.monitor_id;
        if (!id) continue;
        const value = Number(rawValue);
        const monitor = monitors.get(id) ?? {
          id,
          name: labels.monitor_name ?? id,
          type: labels.monitor_type ?? "",
          url: labels.monitor_url && labels.monitor_url !== "null" ? labels.monitor_url : null,
          status: 2,
          responseMs: null,
          uptime1d: null,
          uptime30d: null,
          certDays: null,
        };
        if (metric === "monitor_status") monitor.status = value;
        else if (metric === "monitor_response_time") monitor.responseMs = value >= 0 ? value : null;
        else if (metric === "monitor_cert_days_remaining") monitor.certDays = value;
        else if (metric === "monitor_uptime_ratio" && labels.window === "1d") monitor.uptime1d = value;
        else if (metric === "monitor_uptime_ratio" && labels.window === "30d") monitor.uptime30d = value;
        monitors.set(id, monitor);
      }
      return { reachable: true, monitors: [...monitors.values()].sort((a, b) => Number(a.id) - Number(b.id)) };
    } catch {
      return { reachable: false, monitors: [] };
    }
  };
}
