import type { SmartStats } from "../../shared/types";
import { Panel } from "./panel";

export function SmartPanel({ smart }: { smart: SmartStats }) {
  const failing = smart.disks.filter((disk) => disk.health === "failed").length;
  const unknown = smart.disks.filter((disk) => disk.health === "unknown").length;

  return (
    <Panel
      title="disk health"
      area="smart"
      meta={
        failing ? (
          <span className="level-crit">{failing} failed</span>
        ) : unknown ? (
          <span className="level-warn">{unknown} unknown</span>
        ) : smart.disks.length ? (
          <span className="level-ok">{smart.disks.length} ok</span>
        ) : (
          <span className="faint">not checked</span>
        )
      }
    >
      {smart.disks.length === 0 ? (
        <p className="empty">smart data not available</p>
      ) : (
        <ul className="list smart">
          {smart.disks.map((disk) => (
            <li key={disk.device}>
              <span className="mono">{disk.device}</span>
              <span className={disk.health === "passed" ? "level-ok" : disk.health === "failed" ? "level-crit" : "level-warn"}>
                {disk.health}
              </span>
              <span className="num">{disk.wearPercent !== null ? `${disk.wearPercent}% wear` : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
