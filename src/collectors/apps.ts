import type {
  AppProject,
  AppService,
  AppsStats,
  CleanupRun,
  ContainerStats,
  DeployEvent,
  DokploySession,
  ServiceKind,
} from "../shared/types";
import { readText } from "../lib/host";

interface DokployService {
  name: string;
  appName?: string;
  applicationStatus?: string;
  composeStatus?: string;
  [key: string]: unknown;
}

interface DokployProject {
  projectId: string;
  name: string;
  description: string | null;
  environments: ({ name: string; environmentId: string } & Partial<Record<string, DokployService[]>>)[];
}

interface DokployDeployment {
  deploymentId: string;
  status: string;
  title: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface DokployDetail {
  appName: string;
  domains?: { host: string }[];
  deployments?: DokployDeployment[];
}

interface DokploySessionRow {
  id: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AppsCollection {
  stats: AppsStats;
  deploys: DeployEvent[];
  sessions: DokploySession[];
}

const KINDS: { key: string; kind: ServiceKind; id: string }[] = [
  { key: "applications", kind: "application", id: "applicationId" },
  { key: "compose", kind: "compose", id: "composeId" },
  { key: "postgres", kind: "postgres", id: "postgresId" },
  { key: "redis", kind: "redis", id: "redisId" },
  { key: "mysql", kind: "mysql", id: "mysqlId" },
  { key: "mariadb", kind: "mariadb", id: "mariadbId" },
  { key: "mongo", kind: "mongo", id: "mongoId" },
  { key: "libsql", kind: "libsql", id: "libsqlId" },
];

async function readRuns(path: string): Promise<CleanupRun[]> {
  try {
    return (JSON.parse((await readText(path)) ?? "[]") as CleanupRun[] | null) ?? [];
  } catch {
    return [];
  }
}

function durationOf(deployment: DokployDeployment): number | null {
  if (!deployment.startedAt || !deployment.finishedAt) return null;
  return (Date.parse(deployment.finishedAt) - Date.parse(deployment.startedAt)) / 1000;
}

export function createAppsCollector(
  baseUrl: string | null,
  publicUrl: string,
  envPath: string,
  cleanupPath: string,
): (containers: ContainerStats[]) => Promise<AppsCollection> {
  let apiKey: string | null = null;

  return async (containers) => {
    const cleanupRuns = await readRuns(cleanupPath);
    const offline: AppsCollection = { stats: { reachable: false, projects: [], cleanupRuns }, deploys: [], sessions: [] };
    if (!baseUrl) return offline;
    apiKey ??= /^DOKPLOY_API_KEY=(.+)$/m.exec((await readText(envPath)) ?? "")?.[1]?.trim() ?? null;
    if (!apiKey) return offline;

    const get = async <T>(procedure: string): Promise<T> => {
      const response = await fetch(`${baseUrl}/api/${procedure}`, {
        headers: { "x-api-key": apiKey ?? "" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`${procedure}: ${response.status}`);
      return (await response.json()) as T;
    };

    try {
      const deploys: DeployEvent[] = [];
      const [projects, sessionRows] = await Promise.all([
        get<DokployProject[]>("project.all"),
        get<DokploySessionRow[]>("user.listSessions").catch(() => []),
      ]);

      const result: AppProject[] = await Promise.all(
        projects.map(async (project) => ({
          id: project.projectId,
          name: project.name,
          description: project.description || null,
          environments: await Promise.all(
            project.environments.map(async (environment) => {
              const services: AppService[] = [];
              for (const { key, kind, id } of KINDS) {
                for (const service of environment[key] ?? []) {
                  const serviceId = String(service[id]);
                  // Only deployable services have domains and a deploy history.
                  const detail =
                    kind === "application" || kind === "compose"
                      ? await get<DokployDetail>(`${kind}.one?${id}=${serviceId}`).catch(() => null)
                      : null;
                  const appName = detail?.appName ?? service.appName ?? "";
                  const own = containers.filter((container) => container.stack === appName);
                  const history = (detail?.deployments ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                  const last = history[0];

                  for (const deployment of history) {
                    deploys.push({
                      id: deployment.deploymentId,
                      at: deployment.createdAt,
                      project: project.name,
                      service: service.name,
                      status: deployment.status,
                      title: deployment.title,
                      durationSec: durationOf(deployment),
                    });
                  }

                  services.push({
                    id: serviceId,
                    name: service.name,
                    kind,
                    status: service.composeStatus ?? service.applicationStatus ?? "unknown",
                    domains: [
                      ...new Set([...(detail?.domains?.map((domain) => domain.host) ?? []), ...own.flatMap((container) => container.domains)]),
                    ],
                    lastDeploy: last
                      ? { status: last.status, title: last.title, at: last.createdAt, durationSec: durationOf(last) }
                      : null,
                    running: own.filter((container) => container.state === "running").length,
                    total: own.length,
                    cpu: own.reduce((sum, container) => sum + container.cpu, 0),
                    memBytes: own.reduce((sum, container) => sum + container.memBytes, 0),
                    url: `${publicUrl}/dashboard/project/${project.projectId}/environment/${environment.environmentId}/services/${kind}/${serviceId}`,
                  });
                }
              }
              return { name: environment.name, services };
            }),
          ),
        })),
      );

      return {
        stats: { reachable: true, projects: result.sort((a, b) => a.name.localeCompare(b.name)), cleanupRuns },
        deploys: deploys.sort((a, b) => b.at.localeCompare(a.at)),
        sessions: sessionRows.map((row) => ({
          id: row.id,
          email: row.email,
          ip: row.ipAddress,
          userAgent: row.userAgent ?? "",
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
        })),
      };
    } catch {
      return offline;
    }
  };
}
