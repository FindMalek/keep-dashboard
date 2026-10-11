import type { History, Snapshot } from "../../shared/types";
import { DnsPanel, InternetPanel, MusicPanel, ReadingPanel } from "../components/home-panels";
import { PageHeader } from "../components/page-header";
import { ServicesPanel } from "../components/services-panel";
import { SpacePanel } from "../components/space-panel";
import { StatTiles, type Tile } from "../components/stat-tiles";
import { bytes, mbps, percent, rate, temperature } from "../lib/format";
import { HEAT } from "../lib/level";

const TILE_SECONDS = 120;

interface OverviewPageProps {
  snapshot: Snapshot;
  history: History;
}

/** At a glance: eight tiles, the home services, then space and sites. Details live on the system page. */
export function OverviewPage({ snapshot, history }: OverviewPageProps) {
  const recent = (key: string) => (history[key] ?? []).slice(-TILE_SECONDS);
  const lan = snapshot.network.find((net) => net.label === "lan") ?? snapshot.network[0];
  const data = snapshot.mounts.find((mount) => mount.path === "/srv");
  const hottest = snapshot.sensors.reduce((max, sensor) => Math.max(max, sensor.tempC), 0);
  const sites = snapshot.uptime.monitors;
  const sitesDown = sites.filter((monitor) => monitor.status === 0).length;
  const dns = snapshot.home.dns;
  const speed = snapshot.home.internet.latest;

  const tiles: Tile[] = [
    { label: "cpu", value: percent(snapshot.cpu.usage), sub: `load ${snapshot.cpu.load[0].toFixed(2)}`, ratio: snapshot.cpu.usage, series: recent("cpu"), seriesMax: 1, format: percent, href: "/system" },
    {
      label: "memory",
      value: bytes(snapshot.memory.used),
      sub: `of ${bytes(snapshot.memory.total)}`,
      ratio: snapshot.memory.used / (snapshot.memory.total || 1),
      series: recent("mem"),
      seriesMax: 1,
      format: percent,
      href: "/system",
    },
    { label: "data disk", value: data ? percent(data.used / (data.total || 1)) : "—", sub: data ? `${bytes(data.total - data.used)} free` : "", ratio: data ? data.used / (data.total || 1) : 0, href: "/system" },
    { label: "temperature", value: temperature(hottest), sub: "hottest sensor", ratio: hottest / 100, thresholds: HEAT, href: "/system" },
    {
      label: "network ↓",
      value: lan ? rate(lan.rxBps) : "—",
      sub: lan ? `↑ ${rate(lan.txBps)}` : "",
      series: lan ? recent(`net:${lan.name}:rx`) : [],
      format: rate,
      href: "/system",
    },
    {
      label: "sites",
      value: snapshot.uptime.reachable ? `${sites.length - sitesDown}/${sites.length}` : "—",
      sub: sitesDown ? `${sitesDown} down` : "all up",
      tone: sitesDown ? "crit" : undefined,
      href: "/uptime",
    },
    { label: "ads blocked", value: dns.reachable ? percent(dns.queries ? dns.blocked / dns.queries : 0) : "—", sub: dns.reachable ? `${dns.blocked.toLocaleString()} of ${dns.queries.toLocaleString()}` : "adguard down" },
    { label: "internet ↓", value: speed ? mbps(speed.downBps, 0) : "—", sub: speed ? `↑ ${mbps(speed.upBps, 0)} · ${Math.round(speed.pingMs)} ms` : "no test yet" },
  ];

  return (
    <>
      <PageHeader title="overview" meta="at a glance · details on system" />
      <div className="grid overview">
        <StatTiles tiles={tiles} />
        <MusicPanel music={snapshot.home.music} link={snapshot.links.navidrome} />
        <DnsPanel dns={snapshot.home.dns} />
        <InternetPanel internet={snapshot.home.internet} />
        <ReadingPanel reading={snapshot.home.reading} link={snapshot.links.miniflux} />
        <SpacePanel garage={snapshot.garage} usage={snapshot.usage} mounts={snapshot.mounts} />
        <ServicesPanel services={snapshot.services} uptime={snapshot.uptime} host={snapshot.host} />
      </div>
    </>
  );
}
