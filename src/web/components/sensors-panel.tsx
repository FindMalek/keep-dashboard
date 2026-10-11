import type { SensorReading } from "../../shared/types";
import { temperature } from "../lib/format";
import { HEAT, levelClass } from "../lib/level";
import { Meter } from "./meter";
import { Panel } from "./panel";

const SCALE_C = 100;

export function SensorsPanel({ sensors }: { sensors: SensorReading[] }) {
  const hottest = sensors.reduce<number | null>((max, sensor) => Math.max(max ?? 0, sensor.tempC), null);

  return (
    <Panel
      title="temperatures"
      area="sens"
      meta={<span className={levelClass((hottest ?? 0) / SCALE_C, HEAT)}>max {temperature(hottest)}</span>}
    >
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
