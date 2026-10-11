import type { NetStats } from "../shared/types";
import type { InterfaceConfig } from "../lib/config";
import { HOST_PROC, HOST_SYS, readNumber, readText } from "../lib/host";

interface Counters {
  rx: number;
  tx: number;
}

export function createNetworkCollector(interfaces: InterfaceConfig[]): () => Promise<NetStats[]> {
  let previous = new Map<string, Counters>();
  let previousAt = 0;

  return async () => {
    const now = performance.now();
    const elapsedSec = previousAt ? (now - previousAt) / 1000 : 0;
    previousAt = now;

    // PID 1's view is the host network namespace, not this container's.
    const text = (await readText(`${HOST_PROC}/1/net/dev`)) ?? "";
    const current = new Map<string, Counters>();
    for (const line of text.split("\n").slice(2)) {
      const [name, rest] = line.split(":");
      if (!name || !rest) continue;
      const fields = rest.trim().split(/\s+/).map(Number);
      current.set(name.trim(), { rx: fields[0] ?? 0, tx: fields[8] ?? 0 });
    }

    const stats = await Promise.all(
      interfaces.map(async ({ name, label }) => {
        const counters = current.get(name) ?? { rx: 0, tx: 0 };
        const before = previous.get(name);
        const rate = (key: keyof Counters): number =>
          before && elapsedSec > 0 ? Math.max(0, (counters[key] - before[key]) / elapsedSec) : 0;
        const speed = await readNumber(`${HOST_SYS}/class/net/${name}/speed`);

        return {
          name,
          label,
          rxBps: rate("rx"),
          txBps: rate("tx"),
          rxTotal: counters.rx,
          txTotal: counters.tx,
          speedMbps: speed !== null && speed > 0 ? speed : null,
        };
      }),
    );

    previous = current;
    return stats;
  };
}

/** Local IPv4 addresses of the host, from the routing trie. */
export async function hostAddresses(): Promise<string[]> {
  const lines = ((await readText(`${HOST_PROC}/1/net/fib_trie`)) ?? "").split("\n");
  const addresses = new Set<string>();
  lines.forEach((line, index) => {
    const ip = /\|--\s+([\d.]+)/.exec(line)?.[1];
    if (ip && lines[index + 1]?.includes("host LOCAL")) addresses.add(ip);
  });
  return [...addresses];
}
