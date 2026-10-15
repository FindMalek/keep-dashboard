import { useMemo, useState } from "react";
import type { History, RangeHistory, RangeName, Snapshot } from "../../shared/types";
import { ContainersPanel } from "../components/containers-panel";
import { CpuPanel } from "../components/cpu-panel";
import { MemoryPanel } from "../components/memory-panel";
import { NetworkPanel } from "../components/network-panel";
import { PageHeader, Tabs } from "../components/page-header";
import { SensorsPanel } from "../components/sensors-panel";
import type { SeriesView } from "../components/sparkline";
import { StoragePanel } from "../components/storage-panel";
import { rangeLabel as meta } from "../lib/range-label";
import { useRangeHistory } from "../lib/use-range-history";

const RANGES = ["live", "1h", "24h", "7d", "30d"] as const satisfies readonly RangeName[];
const RANGE_KEY = "keep:range";

function storedRange(): RangeName {
  try {
    const value = localStorage.getItem(RANGE_KEY);
    return RANGES.includes(value as RangeName) ? (value as RangeName) : "live";
  } catch {
    return "live";
  }
}

interface SystemPageProps {
  snapshot: Snapshot;
  history: History;
  historySize: number;
}

/** The machine itself: cpu, memory, network, disks, temperatures, containers, over a chosen time range. */
export function SystemPage({ snapshot, history, historySize }: SystemPageProps) {
  const [range, setRange] = useState<RangeName>(storedRange);
  // The temperature worth a graph: the cpu package, else the hottest sensor.
  const mainSensor =
    snapshot.sensors.find((sensor) => sensor.group === "cpu" && sensor.label === "package") ??
    [...snapshot.sensors].sort((a, b) => b.tempC - a.tempC)[0];
  const tempKey = mainSensor ? `temp:${mainSensor.group}:${mainSensor.label}` : "temp:none";

  const keys = useMemo(
    () => [
      "cpu",
      "mem",
      ...snapshot.network.flatMap((net) => [`net:${net.name}:rx`, `net:${net.name}:tx`]),
      ...snapshot.disks.flatMap((disk) => [`disk:${disk.name}:read`, `disk:${disk.name}:write`]),
      tempKey,
      "containers",
    ],
    [snapshot.network, snapshot.disks, tempKey],
  );
  const longTerm = useRangeHistory(range, keys);

  function selectRange(next: RangeName): void {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      // Remembering the range is a convenience only.
    }
  }

  function view(key: string, secondaryKey?: string): SeriesView {
    // Loading another range: an empty graph, not the live one under the wrong label.
    if (range !== "live" && !longTerm) return { values: [], capacity: 1, stepSec: 1 };
    if (range === "live" || !longTerm) {
      return {
        values: history[key] ?? [],
        secondary: secondaryKey ? (history[secondaryKey] ?? []) : undefined,
        capacity: historySize,
        stepSec: 1,
      };
    }
    const series = longTerm.series[key];
    const values = series?.avg ?? [];
    // Over long ranges a single-series graph shows its peaks underneath the average.
    const secondary = secondaryKey ? longTerm.series[secondaryKey]?.avg : series?.max;
    return { values, secondary, capacity: values.length || 1, stepSec: longTerm.stepSec };
  }

  return (
    <>
      <PageHeader title="system" meta={meta(range, longTerm)}>
        <Tabs options={RANGES} value={range} onChange={selectRange} label="time range" />
      </PageHeader>
      <div className="grid system">
        <CpuPanel cpu={snapshot.cpu} sensors={snapshot.sensors} series={view("cpu")} />
        <MemoryPanel memory={snapshot.memory} series={view("mem")} />
        <NetworkPanel network={snapshot.network} view={view} />
        <StoragePanel mounts={snapshot.mounts} disks={snapshot.disks} view={view} />
        <SensorsPanel sensors={snapshot.sensors} series={range === "live" ? undefined : view(tempKey)} />
        <ContainersPanel containers={snapshot.containers} series={range === "live" ? undefined : view("containers")} />
      </div>
    </>
  );
}
