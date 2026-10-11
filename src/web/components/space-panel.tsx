import type { GarageStats, MountStats, UsageStats } from "../../shared/types";
import { bytes, percent } from "../lib/format";
import { QUOTA, levelClass } from "../lib/level";
import { since } from "../lib/time";
import { Meter } from "./meter";
import { Panel } from "./panel";

/** What each app takes on the data disk against its limit. Hard limits are enforced by the app; soft ones alert. */
export function SpacePanel({ garage, usage, mounts }: { garage: GarageStats; usage: UsageStats; mounts: MountStats[] }) {
  const data = mounts.find((mount) => mount.path === "/srv");
  const free = data ? data.total - data.used : null;
  const items = usage.items ?? [];

  return (
    <Panel
      title="space"
      area="bkt"
      meta={`${free === null ? "" : `${bytes(free)} free · `}${garage.healthy === false ? "garage unreachable" : "alerts at 80%"}`}
    >
      {items.length === 0 ? (
        <p className="empty">measuring · every 15 min</p>
      ) : (
        <ul className="list space">
          {items.map((item) => {
            const ratio = item.limit ? item.used / item.limit : 0;
            return (
              <li key={item.key} title={item.hard ? "hard limit: the app refuses writes past it" : "soft limit: alert only"}>
                <span>
                  {item.label} <span className="muted small">{item.detail}</span>
                </span>
                <Meter value={ratio} thresholds={QUOTA} label={`${item.label} limit used`} />
                <span className="num">
                  {bytes(item.used)}
                  {item.limit !== null && <span className="muted"> / {bytes(item.limit)}</span>}
                </span>
                <span className={`num pct muted ${levelClass(ratio, QUOTA)}`}>{percent(ratio)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {usage.at && <p className="faint small">measured {since(Date.parse(usage.at))} · hover a row for hard or soft</p>}
    </Panel>
  );
}
