import type { ContainerStats } from "../shared/types";
import { HOST_SYS, readText } from "../lib/host";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
/**
 * Set to a read-only socket proxy (e.g. http://docker-proxy:2375) instead of mounting the socket: a read-only bind
 * mount of the socket still lets anything in this container drive the whole Docker API.
 */
const DOCKER_HOST = process.env.DOCKER_HOST?.replace(/^tcp:/, "http:");

interface DockerContainer {
  Id: string;
  Names: string[];
  State: string;
  Status: string;
  Labels: Record<string, string>;
}

function displayName(container: DockerContainer): { name: string; project: string | null } {
  const labels = container.Labels;
  const swarm = labels["com.docker.swarm.service.name"];
  if (swarm) return { name: swarm, project: "dokploy" };
  const service = labels["com.docker.compose.service"];
  const project = labels["keep.project"] ?? labels["com.docker.compose.project"];
  // Dokploy names compose projects `<project>-<service>-<random>`.
  if (service) return { name: service, project: project?.replace(/-[a-z0-9]{6}$/, "") ?? null };
  const name = container.Names[0]?.replace(/^\//, "") ?? container.Id.slice(0, 12);
  return { name, project: name.startsWith("dokploy") ? "dokploy" : null };
}

async function cgroupUsage(id: string): Promise<{ cpuUsec: number; memBytes: number } | null> {
  const base = `${HOST_SYS}/fs/cgroup/system.slice/docker-${id}.scope`;
  const [cpuStat, memCurrent, memStat] = await Promise.all([
    readText(`${base}/cpu.stat`),
    readText(`${base}/memory.current`),
    readText(`${base}/memory.stat`),
  ]);
  if (cpuStat === null || memCurrent === null) return null;
  const cpuUsec = Number(/^usage_usec (\d+)/m.exec(cpuStat)?.[1] ?? 0);
  // Same as `docker stats`: page cache that can be dropped doesn't count.
  const inactiveFile = Number(/^inactive_file (\d+)/m.exec(memStat ?? "")?.[1] ?? 0);
  return { cpuUsec, memBytes: Math.max(0, Number(memCurrent) - inactiveFile) };
}

export function createContainerCollector(coreCount: () => number): () => Promise<ContainerStats[]> {
  const previous = new Map<string, { cpuUsec: number; at: number }>();

  return async () => {
    let containers: DockerContainer[];
    try {
      const response = DOCKER_HOST
        ? await fetch(`${DOCKER_HOST}/containers/json?all=1`)
        : await fetch("http://docker/containers/json?all=1", { unix: DOCKER_SOCKET });
      containers = (await response.json()) as DockerContainer[];
    } catch {
      return [];
    }

    const now = performance.now();
    const stats = await Promise.all(
      containers.map(async (container) => {
        const usage = container.State === "running" ? await cgroupUsage(container.Id) : null;
        const before = previous.get(container.Id);
        let cpu = 0;
        if (usage && before) {
          const elapsedUsec = (now - before.at) * 1000;
          cpu = elapsedUsec > 0 ? (usage.cpuUsec - before.cpuUsec) / elapsedUsec / Math.max(1, coreCount()) : 0;
        }
        if (usage) previous.set(container.Id, { cpuUsec: usage.cpuUsec, at: now });

        return {
          id: container.Id.slice(0, 12),
          ...displayName(container),
          stack: container.Labels["com.docker.compose.project"] ?? container.Labels["com.docker.swarm.service.name"] ?? null,
          domains: (container.Labels["keep.domains"] ?? "").split(",").map((domain) => domain.trim()).filter(Boolean),
          state: container.State,
          health: /\((healthy|unhealthy|health: starting)\)/.exec(container.Status)?.[1] ?? null,
          status: container.Status.replace(/\s*\(.*\)$/, ""),
          cpu: Math.min(1, Math.max(0, cpu)),
          memBytes: usage?.memBytes ?? 0,
        };
      }),
    );

    return stats.sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.name.localeCompare(b.name));
  };
}
