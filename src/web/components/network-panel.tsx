import type { NetStats } from "../../shared/types";
import { bytes, rate } from "../lib/format";
import { Panel } from "./panel";
import { Sparkline, type SeriesView } from "./sparkline";

interface NetworkPanelProps {
  network: NetStats[];
  view: (key: string, secondaryKey?: string) => SeriesView;
}

function linkSpeed(mbps: number | null): string {
  if (mbps === null) return "virtual";
  return mbps >= 1000 ? `${mbps / 1000} Gb/s` : `${mbps} Mb/s`;
}

export function NetworkPanel({ network, view }: NetworkPanelProps) {
  return (
    <Panel title="network" area="net" meta="↓ in  ↑ out">
      {network.map((net) => (
        <div className="block" key={net.name}>
          <div className="row">
            <span>
              {net.label} <span className="muted">{net.name}</span>
            </span>
            <span className="muted">{linkSpeed(net.speedMbps)}</span>
          </div>
          <div className="rates">
            <span className="num">↓ {rate(net.rxBps)}</span>
            <span className="num muted">↑ {rate(net.txBps)}</span>
          </div>
          <Sparkline
            {...view(`net:${net.name}:rx`, `net:${net.name}:tx`)}
            format={rate}
            minTop={10_000}
            height={36}
            label={`${net.label} traffic`}
          />
          <div className="row small muted">
            <span>since boot</span>
            <span className="num">
              ↓ {bytes(net.rxTotal)}  ↑ {bytes(net.txTotal)}
            </span>
          </div>
        </div>
      ))}
    </Panel>
  );
}
