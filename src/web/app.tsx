import { ICONS, Sidebar, type NavItem } from "./components/sidebar";
import { StatusBar } from "./components/status-bar";
import { TitleBar } from "./components/title-bar";
import { allServices, appStatus } from "./lib/app-status";
import { usePath } from "./lib/router";
import { useLiveData } from "./lib/use-live-data";
import { ActivityPage } from "./pages/activity-page";
import { AppsPage } from "./pages/apps-page";
import { JobsPage } from "./pages/jobs-page";
import { OverviewPage } from "./pages/overview-page";
import { SystemPage } from "./pages/system-page";
import { UptimePage } from "./pages/uptime-page";

export function App() {
  const { snapshot, history, historySize, connection } = useLiveData();
  const path = usePath();

  const unhealthyApps = snapshot ? allServices(snapshot.apps).filter((service) => appStatus(service) === "down").length : 0;
  const failedJobs = snapshot ? snapshot.jobs.jobs.filter((job) => job.lastResult === "failed").length : 0;
  const downChecks = snapshot ? snapshot.uptime.monitors.filter((monitor) => monitor.status === 0).length : 0;
  const items: NavItem[] = [
    { path: "/", label: "overview", icon: ICONS.overview },
    { path: "/system", label: "system", icon: ICONS.system },
    { path: "/uptime", label: "uptime", icon: ICONS.uptime, alerts: downChecks },
    { path: "/apps", label: "apps", icon: ICONS.apps, alerts: unhealthyApps },
    { path: "/jobs", label: "jobs", icon: ICONS.jobs, alerts: failedJobs },
    { path: "/activity", label: "activity", icon: ICONS.activity },
  ];

  return (
    <div className="app">
      <TitleBar host={snapshot?.host ?? null} connection={connection} />
      <div className="shell">
        <Sidebar items={items} path={path} />
        <main className="page">
          {!snapshot ? (
            <div className="loading">
              <span className="muted">{connection === "offline" ? "server unreachable, retrying" : "connecting"}</span>
            </div>
          ) : path === "/apps" ? (
            <AppsPage apps={snapshot.apps} />
          ) : path === "/jobs" ? (
            <JobsPage jobs={snapshot.jobs} />
          ) : path === "/system" ? (
            <SystemPage snapshot={snapshot} history={history} historySize={historySize} />
          ) : path === "/uptime" ? (
            <UptimePage uptime={snapshot.uptime} kumaUrl={snapshot.links.kuma} />
          ) : path === "/activity" ? (
            <ActivityPage />
          ) : (
            <OverviewPage snapshot={snapshot} history={history} />
          )}
        </main>
      </div>
      <StatusBar host={snapshot?.host ?? null} />
    </div>
  );
}
