import { Fragment, useMemo, useState } from "react";
import type { ActivityPayload } from "../../shared/types";
import { Chip } from "../components/chip";
import { PageHeader, Tabs } from "../components/page-header";
import { Panel } from "../components/panel";
import { StatusSquare } from "../components/status-square";
import { browserOf, whoIs } from "../lib/devices";
import { bytes } from "../lib/format";
import { buildTimeline, groupTimeline, summarize, type TimelineFilter, type TimelineRow } from "../lib/timeline";
import { clock, dayLabel, since, until } from "../lib/time";
import { useActivity } from "../lib/use-activity";

const FILTERS = ["all", "logins", "commands", "deploys", "system"] as const satisfies readonly TimelineFilter[];
const PAGE_ROWS = 80;

function DevicesPanel({ data }: { data: ActivityPayload }) {
  return (
    <Panel title="devices" area="devices" meta={`${data.devices.filter((device) => device.online).length} online · tailnet`}>
      <table className="table">
        <thead>
          <tr>
            <th aria-label="online" />
            <th>device</th>
            <th className="hide-narrow">tailscale ip</th>
            <th className="hide-narrow">route</th>
            <th className="right hide-narrow">in / out</th>
            <th className="right">seen</th>
          </tr>
        </thead>
        <tbody>
          {data.devices.map((device) => (
            <tr key={device.name}>
              <td>{device.online ? <StatusSquare status="ok" /> : <span className="status-square status-none" aria-label="offline" />}</td>
              <td>
                {device.name} <span className="muted">{device.self ? "this server" : device.os.toLowerCase()}</span>
              </td>
              <td className="mono muted hide-narrow">{device.tailscaleIp ?? "—"}</td>
              <td className="muted hide-narrow">{device.route}</td>
              <td className="num right muted hide-narrow">{device.self ? "—" : `${bytes(device.rxBytes)} / ${bytes(device.txBytes)}`}</td>
              <td className="right">{device.online ? "now" : device.lastSeen ? since(Date.parse(device.lastSeen)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function NetworkDevicesPanel({ data }: { data: ActivityPayload }) {
  const online = data.networkDevices.filter((device) => device.online).length;
  return (
    <Panel title="lan devices" area="lan" meta={`${online} online · ${data.networkDevices.length} seen`}>
      {data.networkDevices.length === 0 ? (
        <p className="empty">no lan scan yet</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th aria-label="online" />
              <th>device</th>
              <th className="hide-narrow">ip</th>
              <th className="hide-narrow">mac</th>
              <th className="right hide-narrow">storage</th>
            </tr>
          </thead>
          <tbody>
            {data.networkDevices.map((device) => (
              <tr key={device.ip}>
                <td>{device.online ? <StatusSquare status="ok" /> : <span className="status-square status-none" aria-label="offline" />}</td>
                <td>{device.name}</td>
                <td className="mono muted hide-narrow">{device.ip}</td>
                <td className="mono muted hide-narrow">{device.mac ?? "—"}</td>
                <td className="num right muted hide-narrow">
                  {device.storage ? `${bytes(device.storage.used)} / ${bytes(device.storage.total)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function ConnectedPanel({ data }: { data: ActivityPayload }) {
  const who = (ip: string | null) => whoIs(ip, data.devices, data.publicIp);
  const recentViewers = data.viewers.filter((viewer) => viewer.live || Date.now() - viewer.lastSeen < 3600_000);
  const total = data.openSessions.length + data.dokploySessions.length + recentViewers.filter((viewer) => viewer.live).length;

  return (
    <Panel title="connected now" area="connected" meta={`${total} active`}>
      <h3 className="subhead">ssh</h3>
      {data.openSessions.length === 0 ? (
        <p className="empty">no open sessions</p>
      ) : (
        <ul className="list connected">
          {data.openSessions.map((session) => {
            const source = who(session.source);
            return (
              <li key={session.id}>
                <span>
                  {session.user} <span className="muted">· {source.name}</span>
                </span>
                <span className="muted">{source.via}</span>
                <span className="num right muted">{session.since ? since(session.since * 1000) : "—"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="subhead">dokploy</h3>
      {data.dokploySessions.length === 0 ? (
        <p className="empty">nobody signed in</p>
      ) : (
        <ul className="list connected">
          {data.dokploySessions.map((session) => {
            const source = who(session.ip);
            return (
              <li key={session.id}>
                <span>
                  {session.email} <span className="muted">· {source.name}</span>
                </span>
                <span className="muted">{browserOf(session.userAgent)}</span>
                <span className="num right muted">expires {until(Date.parse(session.expiresAt))}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="subhead">this dashboard · last hour</h3>
      {recentViewers.length === 0 ? (
        <p className="empty">nobody</p>
      ) : (
        <ul className="list connected">
          {recentViewers.map((viewer) => {
            const source = who(viewer.ip);
            return (
              <li key={viewer.ip}>
                <span>
                  {source.name} <span className="muted">· {source.via}</span>
                </span>
                <span className="muted">{browserOf(viewer.userAgent)}</span>
                <span className="right">{viewer.live ? <Chip tone="solid">live</Chip> : <span className="muted">{since(viewer.lastSeen)}</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Row({ row }: { row: TimelineRow }) {
  const [open, setOpen] = useState(false);
  const { first, events } = row;
  const folded = events.length > 1;
  const oldest = events.at(-1)?.at ?? first.at;
  const mixed = folded && events.some((event) => event.kind !== first.kind);
  // A folded burst is attributed to wherever its logins came from, if any.
  const login = events.find((event) => event.via);

  return (
    <>
      <tr className={folded ? "timeline-group" : undefined} onClick={folded ? () => setOpen(!open) : undefined}>
        <td className="num muted nowrap">{folded ? `${clock(oldest)}–${clock(first.at)}` : clock(first.at, true)}</td>
        <td>
          <Chip tone={first.tone}>{mixed ? "session" : first.kind}</Chip>
        </td>
        <td className="nowrap">
          {(login ?? first).who}
          {(login ?? first).via && <span className="muted"> · {(login ?? first).via}</span>}
        </td>
        <td className="wrap what">
          {folded ? (
            <>
              {mixed || first.kind === "sudo" || first.kind === "ssh login" ? summarize(events) : <><span className="count">{events.length}×</span> {first.what}</>}
              <span className="muted"> {open ? "▾" : "▸"}</span>
            </>
          ) : (
            <span className={first.kind === "sudo" ? "mono" : undefined}>{first.what}</span>
          )}
        </td>
        <td className="mono muted right hide-narrow">{first.ref ?? ""}</td>
      </tr>
      {open &&
        events.map((event, index) => (
          <tr key={index} className="timeline-child">
            <td className="num muted">{clock(event.at, true)}</td>
            <td>{mixed && <Chip>{event.kind}</Chip>}</td>
            <td />
            <td className={`wrap what${event.kind === "sudo" ? " mono" : ""}`}>{event.what}</td>
            <td className="mono muted right hide-narrow">{event.ref ?? ""}</td>
          </tr>
        ))}
    </>
  );
}

function TimelinePanel({ data }: { data: ActivityPayload }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [limit, setLimit] = useState(PAGE_ROWS);
  const rows = useMemo(() => {
    const events = buildTimeline(data).filter((event) => filter === "all" || event.filter === filter);
    return groupTimeline(events);
  }, [data, filter]);
  const failed = data.events.filter((event) => event.kind === "ssh-failed").length;

  return (
    <Panel
      title="timeline"
      area="timeline"
      meta={
        <span>
          last 7 days{failed > 0 && <span className="level-crit"> · {failed} failed logins</span>}
        </span>
      }
    >
      <Tabs options={FILTERS} value={filter} onChange={(next) => (setFilter(next), setLimit(PAGE_ROWS))} label="filter" />
      {rows.length === 0 ? (
        <p className="empty">nothing in the last 7 days</p>
      ) : (
        <table className="table timeline">
          <tbody>
            {rows.slice(0, limit).map((row, index, shown) => {
              const day = dayLabel(row.first.at);
              const newDay = index === 0 || dayLabel(shown[index - 1]?.first.at ?? 0) !== day;
              return (
                <Fragment key={`${row.first.group}-${row.first.at}`}>
                  {newDay && (
                    <tr className="day">
                      <td colSpan={5}>{day}</td>
                    </tr>
                  )}
                  <Row row={row} />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > limit && (
        <button type="button" className="button more" onClick={() => setLimit(limit + PAGE_ROWS)}>
          show {Math.min(PAGE_ROWS, rows.length - limit)} more
        </button>
      )}
    </Panel>
  );
}

export function ActivityPage() {
  const data = useActivity();

  return (
    <>
      <PageHeader
        title="activity"
        meta={data?.updatedAt ? `who's connected and what happened · host log read ${since(Date.parse(data.updatedAt))}` : "loading"}
      />
      {data && (
        <div className="grid activity">
          <DevicesPanel data={data} />
          <NetworkDevicesPanel data={data} />
          <ConnectedPanel data={data} />
          <TimelinePanel data={data} />
        </div>
      )}
    </>
  );
}
