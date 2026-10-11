import type { HostInfo, ServiceCheck, UptimeStats } from "../../shared/types";
import { shortHost } from "../lib/format";
import { StatusSquare } from "./status-square";
import { Panel } from "./panel";

interface ServicesPanelProps {
  services: ServiceCheck[];
  uptime: UptimeStats;
  host: HostInfo;
}

/** Kuma's site checks when it's reachable; the dashboard's own quick checks otherwise. */
function rows(services: ServiceCheck[], uptime: UptimeStats): ServiceCheck[] {
  if (!uptime.reachable) return services;
  return uptime.monitors
    .filter((monitor) => monitor.type !== "docker")
    .map((monitor) => ({
      name: monitor.name,
      url: monitor.url ?? "",
      ok: monitor.status === 1,
      status: null,
      latencyMs: monitor.responseMs,
    }));
}

export function ServicesPanel({ services: own, uptime, host }: ServicesPanelProps) {
  const services = rows(own, uptime);
  const up = services.filter((service) => service.ok).length;
  const dnsKnown = host.dnsIp !== null && host.publicIp !== null;
  const dnsInSync = host.dnsIp === host.publicIp;

  return (
    <Panel title="sites" area="svc" meta={`${up}/${services.length} up${uptime.reachable ? " · kuma" : ""}`}>
      <table className="table">
        <tbody>
          {services.map((service) => (
            <tr key={service.name}>
              <td>
                <StatusSquare status={service.ok ? "ok" : "down"} />
              </td>
              <td>{service.name}</td>
              <td className="muted">{shortHost(service.url)}</td>
              <td className="num right muted">{service.status ?? "—"}</td>
              <td className="num right">{service.latencyMs === null ? "—" : `${service.latencyMs} ms`}</td>
            </tr>
          ))}
          <tr>
            <td>
              <StatusSquare status={!dnsKnown ? "warn" : dnsInSync ? "ok" : "down"} />
            </td>
            <td>dns</td>
            <td className="muted">home → {host.dnsIp ?? "—"}</td>
            <td className="right muted" colSpan={2}>
              {!dnsKnown ? "checking" : dnsInSync ? "in sync" : `public ${host.publicIp}`}
            </td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}
