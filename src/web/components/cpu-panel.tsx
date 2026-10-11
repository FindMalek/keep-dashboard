import type { CpuStats, SensorReading } from "../../shared/types";
import { percent, temperature } from "../lib/format";
import { HEAT, levelClass } from "../lib/level";
import { Meter } from "./meter";
import { Panel } from "./panel";
import { Sparkline, type SeriesView } from "./sparkline";

interface CpuPanelProps {
  cpu: CpuStats;
  sensors: SensorReading[];
  series: SeriesView;
}

export function CpuPanel({ cpu, sensors, series }: CpuPanelProps) {
  const packageTemp = sensors.find((sensor) => sensor.group === "cpu" && sensor.label === "package")?.tempC ?? null;

  return (
    <Panel title="cpu" area="cpu" meta={`${cpu.model.toLowerCase()} · ${cpu.cores.length} cores`}>
      <div className="headline">
        <span className={`big ${levelClass(cpu.usage)}`}>{percent(cpu.usage)}</span>
        <dl className="facts">
          <div>
            <dt>clock</dt>
            <dd>{cpu.freqMhz === null ? "—" : `${(cpu.freqMhz / 1000).toFixed(2)} GHz`}</dd>
          </div>
          <div>
            <dt>load</dt>
            <dd>{cpu.load.map((value) => value.toFixed(2)).join("  ")}</dd>
          </div>
          <div>
            <dt>package</dt>
            <dd className={levelClass((packageTemp ?? 0) / 100, HEAT)}>{temperature(packageTemp)}</dd>
          </div>
        </dl>
      </div>
      <Sparkline {...series} max={1} format={percent} height={104} label="cpu usage" />
      <ul className="cores">
        {cpu.cores.map((usage, index) => (
          <li key={index}>
            <span className="muted">core {index}</span>
            <Meter value={usage} label={`core ${index}`} />
            <span className={`num ${levelClass(usage)}`}>{percent(usage)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
