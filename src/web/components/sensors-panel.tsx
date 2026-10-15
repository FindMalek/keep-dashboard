import type { SensorReading } from "../../shared/types";
import { temperature } from "../lib/format";
import { HEAT, levelClass } from "../lib/level";
import { Meter } from "./meter";
import { Panel } from "./panel";
import { Sparkline, type SeriesView } from "./sparkline";

const SCALE_C = 100;

/** Now on the meters; over a chosen range (`series`), the main temperature's averages with its peaks. */
export function SensorsPanel({ sensors, series }: { sensors: SensorReading[]; series?: SeriesView }) {
  const hottest = sensors.reduce<number | null>((max, sensor) => Math.max(max ?? 0, sensor.tempC), null);

  return (
    <Panel
      title="temperatures"
      area="sens"
      meta={<span className={levelClass((hottest ?? 0) / SCALE_C, HEAT)}>max {temperature(hottest)}</span>}
    >
      {series && <Sparkline {...series} minTop={SCALE_C / 2} format={(value) => temperature(value)} label="temperature" height={40} />}
      <ul className="list sensors">
        {sensors.map((sensor) => (
          <li key={`${sensor.group}-${sensor.label}`}>
            <span>
              <span className="muted">{sensor.group}</span> {sensor.label === sensor.group ? "" : sensor.label}
            </span>
            <Meter value={sensor.tempC / SCALE_C} thresholds={HEAT} label={`${sensor.group} ${sensor.label}`} />
            <span className={`num ${levelClass(sensor.tempC / SCALE_C, HEAT)}`}>{temperature(sensor.tempC)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
