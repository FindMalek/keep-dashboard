import { navigate } from "../lib/router";
import { levelClass, type Thresholds } from "../lib/level";
import { Meter } from "./meter";
import { Sparkline } from "./sparkline";

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  /** 0..1, drives the meter and the orange/red color. */
  ratio?: number;
  thresholds?: Thresholds;
  /** Recent values for a mini graph (drawn instead of a meter). */
  series?: number[];
  seriesMax?: number;
  format?: (value: number) => string;
  href?: string;
  /** Overrides the color when the value is "bad" by its own rules (e.g. sites down). */
  tone?: "warn" | "crit";
}

/** One row of small equal tiles: the whole machine at a glance. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <section className="tiles" aria-label="at a glance" style={{ gridArea: "tiles" }}>
      {tiles.map((tile) => {
        const tone = tile.tone ? `level-${tile.tone}` : tile.ratio !== undefined ? levelClass(tile.ratio, tile.thresholds) : "";
        const body = (
          <>
            <span className="tile-label">{tile.label}</span>
            <span className={`tile-value ${tone}`}>{tile.value}</span>
            <span className="tile-sub">{tile.sub ?? " "}</span>
            <div className="tile-graph">
              {tile.series ? (
                <Sparkline
                  values={tile.series}
                  capacity={Math.max(tile.series.length, 2)}
                  stepSec={1}
                  max={tile.seriesMax}
                  format={tile.format ?? ((value) => value.toFixed(0))}
                  height={22}
                  label={`${tile.label} recent`}
                />
              ) : tile.ratio !== undefined ? (
                <Meter value={tile.ratio} thresholds={tile.thresholds} label={tile.label} />
              ) : null}
            </div>
          </>
        );
        return tile.href ? (
          <a key={tile.label} className="tile tile-link" href={tile.href} onClick={tile.href.startsWith("/") ? navigate : undefined}>
            {body}
          </a>
        ) : (
          <div key={tile.label} className="tile">
            {body}
          </div>
        );
      })}
    </section>
  );
}
