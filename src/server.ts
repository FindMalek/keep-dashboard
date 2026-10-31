import type { Server } from "bun";
import index from "./web/index.html";
import { loadConfig } from "./lib/config";
import { HistoryStore } from "./lib/history";
import { HistoryDb, RANGES } from "./lib/history-db";
import { createCpuCollector } from "./collectors/cpu";
import { collectMemory } from "./collectors/memory";
import { collectMounts, createDiskCollector } from "./collectors/storage";
import { createNetworkCollector } from "./collectors/network";
import { collectSensors } from "./collectors/sensors";
import { smart as collectSmart } from "./collectors/smart";
import { createContainerCollector } from "./collectors/containers";
import { createGarageCollector } from "./collectors/garage";
import { checkServices } from "./collectors/services";
import { collectHost, publicIp, resolveIp } from "./collectors/system";
import { createAppsCollector } from "./collectors/apps";
import { collectJobs, collectUsage, requestAction } from "./collectors/jobs";
import { createKumaCollector } from "./collectors/kuma";
import { createHomeCollector } from "./collectors/home";
import { ViewerLog } from "./lib/viewers";
import { readText } from "./lib/host";
import { gated } from "./lib/gate";
import type {
  ActivityPayload,
  DeployEvent,
  DokploySession,
  InitialPayload,
  NetworkDevice,
  Points,
  RangeName,
  Snapshot,
  TickPayload,
} from "./shared/types";

const config = loadConfig();
const history = new HistoryStore(config.historySize);
const historyDb = new HistoryDb(config.dataDir);

const collectCpu = createCpuCollector();
const collectDisks = createDiskCollector();
const collectNetwork = createNetworkCollector(config.interfaces);
const collectGarage = createGarageCollector(config.garageAdminUrl, config.garageConfigPath);
let coreCount = 1;
const collectContainers = createContainerCollector(() => coreCount);
const collectApps = createAppsCollector(
  config.dokployUrl,
  config.dokployPublicUrl,
  config.dokployEnvPath,
  `${config.dataDir}/cleanup-runs.json`,
);

const SECOND = 1000;

const slow: Pick<Snapshot, "mounts" | "containers" | "garage" | "services" | "apps" | "jobs" | "uptime" | "usage" | "home" | "smart"> & {
  publicIp: string | null;
  dnsIp: string | null;
} = {
  mounts: [],
  containers: [],
  garage: { healthy: null, buckets: [] },
  services: [],
  apps: { reachable: false, projects: [], cleanupRuns: [] },
  jobs: { updatedAt: null, jobs: [], switches: [], actions: [], tidy: null, backup: null, github: null },
  uptime: { reachable: false, monitors: [] },
  usage: { at: null, paths: {} },
  smart: { at: null, disks: [] },
  home: {
    music: { reachable: false, songs: 0, albums: 0, artists: 0, nowPlaying: [], recentlyAdded: [], lastImport: null },
    dns: { reachable: false, protection: false, queries: 0, blocked: 0, avgMs: 0, hourlyQueries: [], hourlyBlocked: [], topBlocked: [] },
    internet: { latest: null, history: [] },
    reading: { reachable: false, unread: 0, feeds: 0, latest: [] },
  },
  publicIp: null,
  dnsIp: null,
};
let latest: Snapshot | null = null;
const subscribers = new Set<ReadableStreamDefaultController<string>>();

function every(ms: number, task: () => Promise<void>): void {
  const run = (): void => {
    task().catch((error: unknown) => console.error(error));
  };
  run();
  setInterval(run, ms);
}

// Each task writes only its own fields; they finish at different times.
every(5 * SECOND, async () => {
  [slow.mounts, slow.containers, slow.jobs, slow.usage] = await Promise.all([
    collectMounts(config.mounts),
    collectContainers(),
    collectJobs(config.dataDir),
    collectUsage(config.dataDir),
  ]);
  slow.smart = collectSmart();
});
const collectKuma = createKumaCollector(config.kumaUrl, config.kumaKeyPath);
every(15 * SECOND, async () => {
  slow.uptime = await collectKuma();
});

const collectHome = createHomeCollector(config.dataDir, process.env.SPEEDTEST_DB ?? "/host/speedtest/database.sqlite");
every(15 * SECOND, async () => {
  slow.home = await collectHome();
});

const viewers = new ViewerLog();
let deploys: DeployEvent[] = [];
let dokploySessions: DokploySession[] = [];

every(30 * SECOND, async () => {
  let apps;
  [slow.garage, slow.services, slow.dnsIp, apps] = await Promise.all([
    collectGarage(),
    checkServices(config.services),
    resolveIp(config.ddnsHost),
    // Right after startup the 5 s task may not have listed containers yet.
    slow.containers.length ? collectApps(slow.containers) : collectContainers().then(collectApps),
  ]);
  slow.apps = apps.stats;
  deploys = apps.deploys;
  dokploySessions = apps.sessions;
});
every(5 * 60 * SECOND, async () => {
  slow.publicIp = await publicIp();
});

async function tick(): Promise<void> {
  const [host, cpu, memory, disks, network, sensors] = await Promise.all([
    collectHost(),
    collectCpu(),
    collectMemory(),
    collectDisks(),
    collectNetwork(),
    collectSensors(),
  ]);
  coreCount = cpu.cores.length || 1;

  const snapshot: Snapshot = {
    at: Date.now(),
    links: config.links,
    host: { ...host, publicIp: slow.publicIp, dnsIp: slow.dnsIp },
    cpu,
    memory,
    mounts: slow.mounts,
    disks,
    network,
    sensors,
    smart: slow.smart,
    containers: slow.containers,
    garage: slow.garage,
    services: slow.services,
    apps: slow.apps,
    jobs: slow.jobs,
    uptime: slow.uptime,
    usage: slow.usage,
    home: slow.home,
  };

  const points: Points = { cpu: cpu.usage, mem: memory.used / (memory.total || 1) };
  for (const disk of disks) {
    points[`disk:${disk.name}:read`] = disk.readBps;
    points[`disk:${disk.name}:write`] = disk.writeBps;
  }
  for (const net of network) {
    points[`net:${net.name}:rx`] = net.rxBps;
    points[`net:${net.name}:tx`] = net.txBps;
  }
  history.push(points);

  // Slow-moving values only go to long-term history; the live graphs don't need them.
  const longTerm: Points = { ...points, containers: slow.containers.filter((c) => c.state === "running").length };
  for (const mount of slow.mounts) longTerm[`vol:${mount.label}:used`] = mount.used;
  for (const bucket of slow.garage.buckets) longTerm[`bucket:${bucket.name}:bytes`] = bucket.bytes;
  for (const sensor of sensors) longTerm[`temp:${sensor.group}:${sensor.label}`] = sensor.tempC;
  // Kuma's results go into long-term history so the uptime page can draw 24h bars and latency graphs.
  for (const monitor of slow.uptime.monitors) {
    if (monitor.status === 0 || monitor.status === 1) longTerm[`kuma:${monitor.id}:up`] = monitor.status;
    if (monitor.responseMs !== null) longTerm[`kuma:${monitor.id}:ms`] = monitor.responseMs;
  }
  historyDb.add(longTerm, snapshot.at);
  latest = snapshot;

  const message = `data: ${JSON.stringify({ snapshot, points } satisfies TickPayload)}\n\n`;
  for (const controller of subscribers) {
    try {
      controller.enqueue(message);
    } catch {
      subscribers.delete(controller);
    }
  }
}

every(SECOND, tick);

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  routes: gated({
    "/": index,
    "/apps": index,
    "/system": index,
    "/jobs": index,
    "/activity": index,
    "/uptime": index,
    "/api/actions": {
      POST: async (request: Request) => {
        // A custom header forces a CORS preflight, so other sites can't trigger actions from your browser.
        if (request.headers.get("x-keep-action") !== "1") return new Response("missing header", { status: 403 });
        const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
        const accepted = typeof body?.action === "string" && (await requestAction(config.dataDir, body.action));
        if (!accepted) return new Response("unknown action", { status: 400 });
        // Pick up the agent's result quickly instead of waiting for the next 5 s refresh.
        setTimeout(async () => (slow.jobs = await collectJobs(config.dataDir)), 3000);
        return new Response(null, { status: 202 });
      },
    },
    "/api/history": (request: Request) => {
      const params = new URL(request.url).searchParams;
      const range = params.get("range") as RangeName | null;
      if (!range || range === "live" || !(range in RANGES)) return new Response("bad range", { status: 400 });
      const keys = (params.get("keys") ?? "").split(",").filter(Boolean).slice(0, 64);
      return Response.json(historyDb.query(range, keys, Date.now()));
    },
    "/api/minutes": (request: Request) => {
      const params = new URL(request.url).searchParams;
      const key = params.get("key") ?? "";
      const from = Number(params.get("from"));
      const to = Number(params.get("to"));
      // A bar's worth of detail, not a dump of the database.
      if (!key || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 2 * 3600)
        return new Response("key, from, to (at most 2 h)", { status: 400 });
      return Response.json(historyDb.minutes(key, from, to));
    },
    "/api/activity": async () => {
      const host = JSON.parse((await readText(`${config.dataDir}/activity.json`)) ?? "{}") as Partial<ActivityPayload>;
      const network = JSON.parse((await readText(`${config.dataDir}/network-devices.json`)) ?? "{}") as Partial<{
        devices: NetworkDevice[];
      }>;
      const payload: ActivityPayload = {
        updatedAt: host.updatedAt ?? null,
        devices: host.devices ?? [],
        networkDevices: network.devices ?? [],
        openSessions: host.openSessions ?? [],
        events: host.events ?? [],
        dokploySessions,
        deploys,
        viewers: viewers.list(),
        actions: slow.jobs.actions,
        cleanupRuns: slow.apps.cleanupRuns,
        publicIp: slow.publicIp,
      };
      return Response.json(payload);
    },
    "/api/snapshot": (request: Request) => {
      viewers.seen(request);
      if (!latest) return new Response("warming up", { status: 503 });
      const payload: InitialPayload = { snapshot: latest, history: history.toJSON(), historySize: config.historySize };
      return Response.json(payload);
    },
    "/api/stream": (request: Request, server: Server<unknown>) => {
      server.timeout(request, 0);
      const closed = viewers.streaming(request);
      let self: ReadableStreamDefaultController<string> | null = null;
      const stream = new ReadableStream<string>({
        start(controller) {
          self = controller;
          subscribers.add(controller);
          controller.enqueue("retry: 2000\n\n");
        },
        cancel() {
          if (self) subscribers.delete(self);
          closed();
        },
      });
      return new Response(stream, {
        // No Connection header: it is illegal over HTTP/2, which Traefik speaks to browsers.
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    },
    "/healthz": () => new Response(latest ? "ok" : "warming up", { status: latest ? 200 : 503 }),
  }, process.env.KEEP_GATE),
});

console.log(`keep-dashboard on :${server.port}`);
