import { useMemo, useState } from "react";
import type { History, RangeName, Snapshot } from "../../shared/types";
import { ContainersPanel } from "../components/containers-panel";
import { CpuPanel } from "../components/cpu-panel";
import { MemoryPanel } from "../components/memory-panel";
import { NetworkPanel } from "../components/network-panel";
import { PageHeader, Tabs } from "../components/page-header";
import { SensorsPanel } from "../components/sensors-panel";
import type { SeriesView } from "../components/sparkline";
import { StoragePanel } from "../components/storage-panel";
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

  const keys = useMemo(
    () => [
      "cpu",
      "mem",
      ...snapshot.network.flatMap((net) => [`net:${net.name}:rx`, `net:${net.name}:tx`]),
      ...snapshot.disks.flatMap((disk) => [`disk:${disk.name}:read`, `disk:${disk.name}:write`]),
    ],
    [snapshot.network, snapshot.disks],
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
      <PageHeader title="system" meta={range === "live" ? "last 5 minutes, every second" : `averages, last ${range}`}>
        <Tabs options={RANGES} value={range} onChange={selectRange} label="time range" />
      </PageHeader>
      <div className="grid system">
        <CpuPanel cpu={snapshot.cpu} sensors={snapshot.sensors} series={view("cpu")} />
        <MemoryPanel memory={snapshot.memory} series={view("mem")} />
        <NetworkPanel network={snapshot.network} view={view} />
        <StoragePanel mounts={snapshot.mounts} disks={snapshot.disks} view={view} />
        <SensorsPanel sensors={snapshot.sensors} />
        <ContainersPanel containers={snapshot.containers} />
      </div>
    </>
  );
}
