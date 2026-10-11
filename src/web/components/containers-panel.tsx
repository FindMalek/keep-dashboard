import type { ContainerStats } from "../../shared/types";
import { bytes, percent } from "../lib/format";
import { StatusSquare, type Status } from "./status-square";
import { Panel } from "./panel";

function statusOf(container: ContainerStats): Status {
  if (container.state !== "running") return "down";
  if (container.health === "unhealthy" || container.health === "health: starting") return "warn";
  return "ok";
}

export function ContainersPanel({ containers }: { containers: ContainerStats[] }) {
  const running = containers.filter((container) => container.state === "running").length;

  return (
    <Panel title="containers" area="ctr" meta={`${running} running / ${containers.length}`}>
      <table className="table">
        <thead>
          <tr>
            <th aria-label="status" />
            <th>name</th>
            <th className="hide-narrow">project</th>
            <th className="right">cpu</th>
            <th className="right">memory</th>
            <th className="right hide-narrow">status</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((container) => (
            <tr key={container.id}>
              <td>
                <StatusSquare status={statusOf(container)} />
              </td>
              <td>{container.name}</td>
              <td className="muted hide-narrow">{container.project ?? "—"}</td>
              <td className="num right">{container.state === "running" ? percent(container.cpu) : "—"}</td>
              <td className="num right">{container.state === "running" ? bytes(container.memBytes) : "—"}</td>
              <td className="right muted hide-narrow">{container.health ?? container.status.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
