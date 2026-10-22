export interface HostInfo {
  hostname: string;
  os: string;
  kernel: string;
  uptimeSec: number;
  processes: number;
  lanIp: string | null;
  tailscaleIp: string | null;
  publicIp: string | null;
  dnsIp: string | null;
}

export interface CpuStats {
  model: string;
  usage: number;
  cores: number[];
  freqMhz: number | null;
  load: [number, number, number];
}

export interface MemoryStats {
  total: number;
  used: number;
  cached: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
}

export interface MountStats {
  label: string;
  path: string;
  device: string | null;
  total: number;
  used: number;
}

export interface DiskStats {
  name: string;
  model: string | null;
  sizeBytes: number;
  readBps: number;
  writeBps: number;
  readIops: number;
  writeIops: number;
  busy: number;
  tempC: number | null;
  mounts: string[];
}

export interface SmartDisk {
  device: string;
  health: "passed" | "failed" | "unknown";
  wearPercent: number | null;
  temperatureC: number | null;
}

export interface SmartStats {
  at: string | null;
  disks: SmartDisk[];
}

export interface NetStats {
  name: string;
  label: string;
  rxBps: number;
  txBps: number;
  rxTotal: number;
  txTotal: number;
  speedMbps: number | null;
}

export interface SensorReading {
  group: string;
  label: string;
  tempC: number;
}

export interface ContainerStats {
  id: string;
  name: string;
  project: string | null;
  /** Raw compose project or swarm service name; matches a Dokploy appName. */
  stack: string | null;
  /** From the `keep.domains` label, for routes Dokploy doesn't know about (e.g. Traefik file routes). */
  domains: string[];
  state: string;
  health: string | null;
  status: string;
  cpu: number;
  memBytes: number;
}

export interface BucketStats {
  name: string;
  bytes: number;
  objects: number;
  quotaBytes: number | null;
}

export interface GarageStats {
  healthy: boolean | null;
  buckets: BucketStats[];
}

export interface ServiceCheck {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
}

export type ServiceKind = "application" | "compose" | "postgres" | "redis" | "mysql" | "mariadb" | "mongo" | "libsql";

export interface AppService {
  id: string;
  name: string;
  kind: ServiceKind;
  status: string;
  domains: string[];
  lastDeploy: { status: string; title: string; at: string; durationSec: number | null } | null;
  running: number;
  total: number;
  cpu: number;
  memBytes: number;
  url: string;
}

export interface AppEnvironment {
  name: string;
  services: AppService[];
}

export interface AppProject {
  id: string;
  name: string;
  description: string | null;
  environments: AppEnvironment[];
}

export type CleanupItem =
  | {
      type: "deployment";
      /** Null only for runs recorded before ids were kept. */
      id: string | null;
      project: string;
      service: string;
      title: string;
      status: string;
      createdAt: string;
      reason: string;
    }
  | { type: "folder"; id: string; path: string; reason: string };

/** One `keep-cleanup` run on the host, newest first in `cleanup-runs.json`. */
export interface CleanupRun {
  id: string;
  at: string;
  durationMs: number | null;
  removed: CleanupItem[];
  unmanaged: { id?: string; name: string; state: string; stack: string | null }[];
}

export interface AppsStats {
  reachable: boolean;
  projects: AppProject[];
  cleanupRuns: CleanupRun[];
}

export interface JobStatus {
  name: string;
  description: string;
  schedule: string;
  /** Unix seconds. */
  lastRun: number | null;
  lastResult: "success" | "failed" | "running" | null;
  durationSec: number | null;
  nextRun: number | null;
  runnable: boolean;
  /** Listed so it isn't forgotten, but not set up yet. */
  planned?: boolean;
}

export interface ActionRecord {
  action: string;
  at: string;
  status: "done" | "failed" | "refused";
  detail: string;
}

export interface TidySummary {
  at: string;
  freedBytes: number;
  steps: { label: string; ok: boolean }[];
}

/** Written by `keep-agent` / `keep-tidy` on the host. */
/** An app that sleeps when idle, with start/stop buttons (agent.json `switches`). */
export interface SwitchStatus {
  name: string;
  description: string;
  running: boolean;
}

export interface JobsStats {
  updatedAt: string | null;
  jobs: JobStatus[];
  switches: SwitchStatus[];
  actions: ActionRecord[];
  tidy: TidySummary | null;
}

/** Where the "open ↗" links on panels point; each is optional and hidden when unset. */
export interface Links {
  kuma: string | null;
  navidrome: string | null;
  miniflux: string | null;
}

export interface Snapshot {
  at: number;
  links: Links;
  host: HostInfo;
  cpu: CpuStats;
  memory: MemoryStats;
  mounts: MountStats[];
  disks: DiskStats[];
  network: NetStats[];
  sensors: SensorReading[];
  smart: SmartStats;
  containers: ContainerStats[];
  garage: GarageStats;
  services: ServiceCheck[];
  apps: AppsStats;
  jobs: JobsStats;
  uptime: UptimeStats;
  usage: UsageStats;
  home: HomeStats;
}

/** One sample per tick, keyed like `cpu`, `mem`, `net:enp5s0:rx`, `disk:sda:write`. */
export type Points = Record<string, number>;

export type History = Record<string, number[]>;

export interface InitialPayload {
  snapshot: Snapshot;
  history: History;
  historySize: number;
}

export interface TickPayload {
  snapshot: Snapshot;
  points: Points;
}

export type RangeName = "live" | "1h" | "24h" | "7d" | "30d";

export interface RangeSeries {
  avg: (number | null)[];
  max: (number | null)[];
}

export interface RangeHistory {
  range: Exclude<RangeName, "live">;
  stepSec: number;
  /** Unix seconds of the first bucket. */
  start: number;
  series: Record<string, RangeSeries>;
}

export interface Device {
  name: string;
  os: string;
  self: boolean;
  tailscaleIp: string | null;
  lanIp: string | null;
  online: boolean;
  lastSeen: string | null;
  route: string;
  rxBytes: number;
  txBytes: number;
}

export interface OpenSession {
  id: string;
  user: string | null;
  source: string | null;
  since: number | null;
}

export interface HostEvent {
  /** Unix seconds. */
  at: number;
  kind: "ssh" | "ssh-failed" | "sudo" | "boot";
  user: string | null;
  source: string | null;
  detail: string;
  key: string | null;
  endedAt: number | null;
}

export interface DokploySession {
  id: string;
  email: string;
  ip: string | null;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
}

export interface DeployEvent {
  id: string;
  at: string;
  project: string;
  service: string;
  status: string;
  title: string;
  durationSec: number | null;
}

export interface Viewer {
  ip: string;
  userAgent: string;
  firstSeen: number;
  lastSeen: number;
  live: boolean;
}

export interface ActivityPayload {
  updatedAt: string | null;
  devices: Device[];
  openSessions: OpenSession[];
  events: HostEvent[];
  dokploySessions: DokploySession[];
  deploys: DeployEvent[];
  viewers: Viewer[];
  actions: ActionRecord[];
  cleanupRuns: CleanupRun[];
  publicIp: string | null;
}

/** One Uptime Kuma check, from its Prometheus /metrics endpoint. */
export interface KumaMonitor {
  id: string;
  name: string;
  type: string;
  url: string | null;
  /** 0 down, 1 up, 2 pending, 3 maintenance. */
  status: number;
  responseMs: number | null;
  uptime1d: number | null;
  uptime30d: number | null;
  certDays: number | null;
}

export interface UptimeStats {
  reachable: boolean;
  monitors: KumaMonitor[];
}

/** Written every 15 min by `keep-usage` on the host: bytes per path under /srv. */
export interface UsageItem {
  key: string;
  label: string;
  detail: string;
  used: number;
  limit: number | null;
  /** Enforced by the app itself (bucket quota, Seafile quota); otherwise the limit only triggers alerts. */
  hard: boolean;
}

export interface UsageStats {
  at: string | null;
  paths: Record<string, number>;
  items?: UsageItem[];
}

export interface MusicStats {
  reachable: boolean;
  songs: number;
  albums: number;
  artists: number;
  nowPlaying: { user: string; title: string; artist: string; album: string; minutesAgo: number; player: string }[];
  recentlyAdded: { album: string; artist: string; year: number | null }[];
  lastImport: { at: string; imported: number; waiting: number; leftInInbox: number } | null;
}

export interface DnsStats {
  reachable: boolean;
  protection: boolean;
  queries: number;
  blocked: number;
  avgMs: number;
  /** Last 24 hours, one value per hour, oldest first. */
  hourlyQueries: number[];
  hourlyBlocked: number[];
  topBlocked: { domain: string; count: number }[];
}

export interface SpeedResult {
  at: string;
  downBps: number;
  upBps: number;
  pingMs: number;
}

export interface InternetStats {
  latest: (SpeedResult & { isp: string | null; server: string | null }) | null;
  /** Oldest first. */
  history: SpeedResult[];
}

export interface ReadingStats {
  reachable: boolean;
  unread: number;
  feeds: number;
  latest: { title: string; feed: string; url: string; publishedAt: string }[];
}

export interface HomeStats {
  music: MusicStats;
  dns: DnsStats;
  internet: InternetStats;
  reading: ReadingStats;
}
