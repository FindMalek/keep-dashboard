import type { MemoryStats } from "../../shared/types";
import { bytes, percent } from "../lib/format";
import { levelClass } from "../lib/level";
import { Meter } from "./meter";
import { Panel } from "./panel";
import { Sparkline, type SeriesView } from "./sparkline";

interface MemoryPanelProps {
  memory: MemoryStats;
  series: SeriesView;
}

export function MemoryPanel({ memory, series }: MemoryPanelProps) {
  const total = memory.total || 1;
  const cached = Math.min(memory.cached, memory.total - memory.used);

  return (
    <Panel title="memory" area="mem" meta={bytes(memory.total)}>
      <div className="headline">
        <span className={`big ${levelClass(memory.used / total)}`}>{bytes(memory.used)}</span>
        <span className={`muted ${levelClass(memory.used / total)}`}>{percent(memory.used / total)} used</span>
      </div>
      <Meter
        label="memory"
        value={[
          { value: memory.used / total, tone: "strong" },
          { value: cached / total, tone: "dim" },
        ]}
      />
      <dl className="legend">
        <div>
          <dt><span className="swatch swatch-strong" />used</dt>
          <dd>{bytes(memory.used)}</dd>
        </div>
        <div>
          <dt><span className="swatch swatch-dim" />cache</dt>
          <dd>{bytes(cached)}</dd>
        </div>
        <div>
          <dt><span className="swatch" />available</dt>
          <dd>{bytes(memory.available)}</dd>
        </div>
        <div>
          <dt>swap</dt>
          <dd>{memory.swapTotal ? `${bytes(memory.swapUsed)} / ${bytes(memory.swapTotal)}` : "off"}</dd>
        </div>
      </dl>
      <Sparkline {...series} max={1} format={percent} label="memory usage" height={40} />
    </Panel>
  );
}
