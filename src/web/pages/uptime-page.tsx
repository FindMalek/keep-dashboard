import { useEffect, useMemo, useState } from "react";
import type { KumaMonitor, RangeHistory, UptimeStats } from "../../shared/types";
import { PageHeader } from "../components/page-header";
import { Panel } from "../components/panel";
import { StatusSquare, type Status } from "../components/status-square";
import { shortHost } from "../lib/format";
import { clockTime, outages } from "../lib/outages";
import { useRangeHistory } from "../lib/use-range-history";

const BARS = 48;

function statusOf(monitor: KumaMonitor): Status {
  if (monitor.status === 1) return "ok";
  if (monitor.status === 0) return "down";
  return "warn";
}

function ratio(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1) return "100%";
  return `${(Math.floor(value * 10000) / 100).toFixed(2)}%`;
}

function ratioClass(value: number | null): string {
  if (value === null || value >= 0.999) return "";
  return value >= 0.99 ? "level-warn" : "level-crit";
}

function certClass(days: number | null): string {
  if (days === null) return "";
  if (days < 7) return "level-crit";
  return days < 14 ? "level-warn" : "";
}

/** 24 h of 5-minute buckets folded into 48 half-hour bars (average of "up", null when there is no data). */
function bars(history: RangeHistory | null, id: string): (number | null)[] {
  const values = history?.series[`kuma:${id}:up`]?.avg ?? [];
  const size = Math.max(1, Math.floor(values.length / BARS));
  return Array.from({ length: BARS }, (_, bar) => {
    const slice = values.slice(bar * size, bar * size + size).filter((value): value is number => value !== null);
    return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
  });
}

interface Detail {
  loading: boolean;
  runs: { from: number; to: number }[];
}

/** Each bar's minutes, fetched the first time it's hovered (kept for the page's life). */
const details = new Map<string, Promise<{ ts: number; avg: number }[]>>();
function minutesOf(key: string, from: number, to: number): Promise<{ ts: number; avg: number }[]> {
  const id = `${key}:${from}`;
  if (!details.has(id))
    details.set(
      id,
      fetch(`/api/minutes?${new URLSearchParams({ key, from: String(from), to: String(to) })}`)
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []),
    );
  return details.get(id) as Promise<{ ts: number; avg: number }[]>;
}

/**
 * The 48 half-hour bars of one check. Hover a bar (or focus the strip and use ←/→) for its half hour, how much of it
 * was up, and the minutes it wasn't.
 */
function Bars({ values, monitorId, start, barSec }: { values: (number | null)[]; monitorId: string; start: number; barSec: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const from = active === null ? 0 : start + active * barSec;
  const to = from + barSec;
  const value = active === null ? null : values[active];

  useEffect(() => {
    if (active === null || value === null || value === undefined || value >= 0.999) return setDetail(null);
    let current = true;
    setDetail({ loading: true, runs: [] });
    void minutesOf(`kuma:${monitorId}:up`, from, to).then((minutes) => current && setDetail({ loading: false, runs: outages(minutes) }));
    return () => {
      current = false;
    };
  }, [active, value, monitorId, from, to]);

  return (
    <div
      className="bars"
      tabIndex={0}
      role="group"
      aria-label="last 24 hours, half-hour steps"
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onFocus={() => setActive((current) => current ?? values.length - 1)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setActive((current) => Math.max(0, Math.min(values.length - 1, (current ?? values.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
      }}
    >
      {values.map((bar, index) => (
        <span
          key={index}
          className={`${bar === null ? "bar bar-none" : bar >= 0.999 ? "bar bar-up" : bar > 0 ? "bar bar-partial" : "bar bar-down"}${index === active ? " bar-active" : ""}`}
          onPointerEnter={() => setActive(index)}
        />
      ))}
      {active !== null && (
        <span className="bars-tip" role="status" style={{ left: `${((active + 0.5) / values.length) * 100}%` }}>
          <span>
            <span className="muted">
              {clockTime(from)}–{clockTime(to)}
            </span>{" "}
            {value === null || value === undefined ? "no data" : value >= 0.999 ? "up the whole time" : `${Math.round(value * 100)}% up`}
            {detail?.loading && <span className="muted"> · …</span>}
          </span>
          {detail?.runs.map((run) => (
            <span key={run.from} className="bars-tip-line level-crit">
              down {clockTime(run.from)}–{clockTime(run.to)} ({Math.round((run.to - run.from) / 60)} min)
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Same columns for sites and containers so the two tables line up. */
function MonitorTable({ monitors, history }: { monitors: KumaMonitor[]; history: RangeHistory | null }) {
  return (
    <table className="table uptime">
      <thead>
        <tr>
          <th aria-label="status" />
          <th>check</th>
          <th className="hide-narrow">last 24 hours</th>
          <th className="right">response</th>
          <th className="right">24h</th>
          <th className="right hide-narrow">30d</th>
          <th className="right hide-narrow">cert</th>
        </tr>
      </thead>
      <tbody>
        {monitors.map((monitor) => (
          <tr key={monitor.id}>
            <td>
              <StatusSquare status={statusOf(monitor)} />
            </td>
            <td>
              {monitor.name.replace(/^container: /, "")}
              {monitor.url && <span className="muted hide-narrow"> · {shortHost(monitor.url)}</span>}
            </td>
            <td className="hide-narrow">
              <Bars
                values={bars(history, monitor.id)}
                monitorId={monitor.id}
                start={history?.start ?? 0}
                barSec={history ? Math.max(1, Math.floor((history.series[`kuma:${monitor.id}:up`]?.avg.length ?? 0) / BARS)) * history.stepSec : 1800}
              />
            </td>
            <td className="num right">{monitor.responseMs === null ? "—" : `${monitor.responseMs} ms`}</td>
            <td className={`num right ${ratioClass(monitor.uptime1d)}`}>{ratio(monitor.uptime1d)}</td>
            <td className={`num right hide-narrow ${ratioClass(monitor.uptime30d)}`}>{ratio(monitor.uptime30d)}</td>
            <td className={`num right hide-narrow ${certClass(monitor.certDays)}`}>
              {monitor.certDays === null ? "—" : `${monitor.certDays}d`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UptimePage({ uptime, kumaUrl }: { uptime: UptimeStats; kumaUrl: string | null }) {
  const keys = useMemo(() => uptime.monitors.map((monitor) => `kuma:${monitor.id}:up`), [uptime.monitors]);
  const history = useRangeHistory("24h", keys);
  const sites = uptime.monitors.filter((monitor) => monitor.type !== "docker");
  const containers = uptime.monitors.filter((monitor) => monitor.type === "docker");
  const down = uptime.monitors.filter((monitor) => monitor.status === 0).length;

  return (
    <>
      <PageHeader
        title="uptime"
        meta={
          uptime.reachable ? (
            <span>
              <span className={down ? "level-crit" : ""}>
                {uptime.monitors.length - down}/{uptime.monitors.length} up
              </span>{" "}
              · checked every 60s by uptime kuma · alerts to your phone via ntfy
            </span>
          ) : (
            <span className="level-crit">uptime kuma unreachable</span>
          )
        }
      >
        {kumaUrl && (
          <a className="button" href={kumaUrl} target="_blank" rel="noreferrer">
            edit checks ↗
          </a>
        )}
      </PageHeader>
      <div className="stack">
        <Panel title="sites" area="sites" meta={`${sites.length} checks`}>
          <MonitorTable monitors={sites} history={history} />
        </Panel>
        <Panel title="containers" area="containers" meta={`${containers.length} checks`}>
          <MonitorTable monitors={containers} history={history} />
        </Panel>
      </div>
    </>
  );
}
