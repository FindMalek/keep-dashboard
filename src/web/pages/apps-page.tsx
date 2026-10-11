import type { AppService, AppsStats } from "../../shared/types";
import { CleanupPanel } from "../components/cleanup-panel";
import { DomainList } from "../components/domain-list";
import { PageHeader } from "../components/page-header";
import { StatusSquare } from "../components/status-square";
import { allServices, appStatus } from "../lib/app-status";
import { bytes, duration, percent } from "../lib/format";

const STATUS_TEXT: Record<string, string> = {
  done: "deployed",
  running: "deploying",
  idle: "not deployed",
  error: "failed",
};

function since(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return seconds < 60 ? "just now" : `${duration(seconds)} ago`;
}

function ServiceRow({ service }: { service: AppService }) {
  const deploy = service.lastDeploy;
  const isDatabase = service.kind !== "application" && service.kind !== "compose";

  return (
    <tr>
      <td>
        <StatusSquare status={appStatus(service)} />
      </td>
      <td>
        <a className="row-link" href={service.url} target="_blank" rel="noreferrer">
          {service.name}
        </a>
      </td>
      <td className="muted hide-narrow">{service.kind}</td>
      <td className="hide-narrow">
        {service.domains.length === 0 ? (
          <span className="faint">{isDatabase ? "internal" : "no domain"}</span>
        ) : (
          <DomainList domains={service.domains} />
        )}
      </td>
      <td className="num right">
        {service.total ? (
          <span className={service.running < service.total ? "level-warn" : ""}>
            {service.running}/{service.total}
          </span>
        ) : (
          <span className="faint">—</span>
        )}
      </td>
      <td className="num right hide-narrow">{service.running ? percent(service.cpu) : "—"}</td>
      <td className="num right hide-narrow">{service.running ? bytes(service.memBytes) : "—"}</td>
      <td className="right">
        {deploy ? (
          <>
            <span className={deploy.status === "error" ? "level-crit" : ""}>{STATUS_TEXT[deploy.status] ?? deploy.status}</span>{" "}
            <span className="muted">
              {since(deploy.at)}
              {deploy.durationSec !== null && <span className="hide-narrow"> · {Math.round(deploy.durationSec)}s</span>}
            </span>
          </>
        ) : (
          <span className="muted">{STATUS_TEXT[service.status] ?? service.status}</span>
        )}
      </td>
    </tr>
  );
}

export function AppsPage({ apps }: { apps: AppsStats }) {
  const services = allServices(apps);
  const failing = services.filter((service) => appStatus(service) !== "ok").length;

  return (
    <>
      <PageHeader
        title="apps"
        meta={
          apps.reachable
            ? `${services.length} services · ${apps.projects.length} projects${failing ? ` · ${failing} need attention` : ""}`
            : "dokploy unreachable"
        }
      />
      <div className="stack">
        {apps.projects.map((project) => (
          <section className="panel" key={project.id} aria-label={project.name}>
            <header className="panel-header">
              <h2>{project.name.toLowerCase()}</h2>
              <span className="panel-meta">{project.description ?? ""}</span>
            </header>
            <div className="panel-body">
              {project.environments.map((environment) => (
                <div key={environment.name}>
                  {project.environments.length > 1 && <h3 className="subhead env">{environment.name}</h3>}
                  {environment.services.length === 0 ? (
                    <p className="empty">no services</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th aria-label="status" />
                          <th>service</th>
                          <th className="hide-narrow">type</th>
                          <th className="hide-narrow">domains</th>
                          <th className="right">containers</th>
                          <th className="right hide-narrow">cpu</th>
                          <th className="right hide-narrow">memory</th>
                          <th className="right">last deploy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {environment.services.map((service) => (
                          <ServiceRow key={service.id} service={service} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <CleanupPanel runs={apps.cleanupRuns} />
      </div>
    </>
  );
}
