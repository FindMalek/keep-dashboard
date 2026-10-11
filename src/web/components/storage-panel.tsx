import type { DiskStats, MountStats } from "../../shared/types";
import { bytes, percent, rate, temperature } from "../lib/format";
import { levelClass } from "../lib/level";
import { Meter } from "./meter";
import { Panel } from "./panel";
import { Sparkline, type SeriesView } from "./sparkline";

interface StoragePanelProps {
  mounts: MountStats[];
  disks: DiskStats[];
  view: (key: string, secondaryKey?: string) => SeriesView;
}

export function StoragePanel({ mounts, disks, view }: StoragePanelProps) {
  const used = mounts.reduce((sum, mount) => sum + mount.used, 0);
  const total = mounts.reduce((sum, mount) => sum + mount.total, 0);

  return (
    <Panel title="storage" area="disk" meta={`${bytes(used)} / ${bytes(total)}`}>
      <h3 className="subhead">volumes</h3>
      <ul className="list">
        {mounts.map((mount) => {
          const ratio = mount.total ? mount.used / mount.total : 0;
          return (
            <li className="volume" key={mount.path}>
              <span>
                {mount.label} <span className="muted">{mount.path}</span>
              </span>
              <Meter value={ratio} label={`${mount.label} used`} />
              <span className="num">
                {bytes(mount.used)} <span className="muted">/ {bytes(mount.total)}</span>
              </span>
              <span className={`num pct ${levelClass(ratio)}`}>{percent(ratio)}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="subhead">disks</h3>
      <div className="disks">
        {disks.map((disk) => (
          <div className="block" key={disk.name}>
            <div className="row">
              <span>
                {disk.name} <span className="muted">{disk.model ?? "disk"} · {bytes(disk.sizeBytes)}</span>
              </span>
              <span className="muted">{disk.mounts.filter((path) => !path.startsWith("/boot")).join(" ") || "—"}</span>
            </div>
            <div className="rates">
              <span className="num">r {rate(disk.readBps)}</span>
              <span className="num muted">w {rate(disk.writeBps)}</span>
              <span className="num muted">{Math.round(disk.readIops + disk.writeIops)} iops</span>
              <span className="num muted">busy {percent(disk.busy)}</span>
              <span className="num muted">{temperature(disk.tempC)}</span>
            </div>
            <Sparkline
              {...view(`disk:${disk.name}:read`, `disk:${disk.name}:write`)}
              format={rate}
              minTop={10_000}
              height={36}
              label={`${disk.name} read and write`}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}
