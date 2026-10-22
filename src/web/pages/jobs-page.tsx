import type { GitHubCiStatus, GitHubRunner, GitHubRun, JobStatus, JobsStats } from "../../shared/types";
import { ActionButton } from "../components/action-button";
import { Chip } from "../components/chip";
import { PageHeader } from "../components/page-header";
import { StatusSquare, type Status } from "../components/status-square";
import { bytes, duration } from "../lib/format";
import { since } from "../lib/time";

function relative(unixSec: number | null): string {
  if (unixSec === null) return "—";
  const delta = unixSec - Date.now() / 1000;
  if (Math.abs(delta) < 60) return delta >= 0 ? "in <1m" : "just now";
  return delta >= 0 ? `in ${duration(delta)}` : `${duration(-delta)} ago`;
}

function jobStatus(job: JobStatus): Status | null {
  if (job.planned) return "warn";
  if (job.lastResult === "failed") return "down";
  if (job.lastResult === "running") return "warn";
  return job.lastResult === "success" ? "ok" : null;
}

function JobRow({ job }: { job: JobStatus }) {
  const status = jobStatus(job);
  return (
    <tr>
      <td>{status ? <StatusSquare status={status} /> : <span className="status-square status-none" aria-label="no runs yet" />}</td>
      <td>
        {job.name}
        <div className="muted small wrap">{job.description}</div>
      </td>
      <td className={`hide-narrow ${job.planned ? "level-warn" : "muted"}`}>{job.schedule}</td>
      <td className="num right">
        <span className={job.lastResult === "failed" ? "level-crit" : ""}>{relative(job.lastRun)}</span>
        {job.durationSec !== null && <span className="muted hide-narrow"> · {job.durationSec}s</span>}
      </td>
      <td className="num right muted hide-narrow">{relative(job.nextRun)}</td>
      <td className="right">
        {job.runnable ? (
          <ActionButton action={`run:${job.name}`} label="run now" />
        ) : job.planned ? (
          <Chip tone="warn">not set up</Chip>
        ) : (
          <span className="faint">dokploy</span>
        )}
      </td>
    </tr>
  );
}

function runnerStatus(runner: GitHubRunner): Status {
  if (runner.status === "offline") return "down";
  return runner.busy ? "warn" : "ok";
}

function runStatus(run: GitHubRun): Status | null {
  if (run.status === "queued") return "warn";
  if (run.status === "in_progress") return "warn";
  if (run.conclusion === "success") return "ok";
  if (run.conclusion === "failure") return "down";
  return null;
}

function GitHubCiPanel({ github }: { github: GitHubCiStatus | null }) {
  if (!github) return null;
  const online = github.runners.filter((r) => r.status === "online").length;
  const busy = github.runners.filter((r) => r.busy).length;
  return (
    <section className="panel" aria-label="github runners">
      <header className="panel-header">
        <h2>github runners</h2>
        <span className="panel-meta">
          {online}/{github.runners.length} online · {busy} busy
          {github.updatedAt && ` · ${since(Date.parse(github.updatedAt) / 1000)}`}
        </span>
      </header>
      <div className="panel-body">
        {github.runners.length === 0 ? (
          <p className="empty">no runners configured</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th aria-label="status" />
                <th>runner</th>
                <th className="hide-narrow">repo</th>
                <th className="hide-narrow">labels</th>
                <th className="right">state</th>
              </tr>
            </thead>
            <tbody>
              {github.runners.map((runner) => (
                <tr key={`${runner.repo}-${runner.id}`}>
                  <td>
                    <StatusSquare status={runnerStatus(runner)} />
                  </td>
                  <td>{runner.name}</td>
                  <td className="muted hide-narrow">{runner.repo}</td>
                  <td className="muted hide-narrow">{runner.labels.join(", ")}</td>
                  <td className="num right">{runner.busy ? "busy" : runner.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {github.runs.length > 0 && (
          <table className="table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th aria-label="status" />
                <th>workflow</th>
                <th className="hide-narrow">repo</th>
                <th className="hide-narrow">branch</th>
                <th className="right">started</th>
              </tr>
            </thead>
            <tbody>
              {github.runs.map((run) => (
                <tr key={`${run.repo}-${run.id}`}>
                  <td>{runStatus(run) ? <StatusSquare status={runStatus(run)!} /> : <span className="status-square status-none" />}</td>
                  <td>
                    <a href={run.url} target="_blank" rel="noreferrer">
                      {run.workflow}
                    </a>
                  </td>
                  <td className="muted hide-narrow">{run.repo}</td>
                  <td className="muted hide-narrow">{run.branch}</td>
                  <td className="num right muted">{run.startedAt ? since(Date.parse(run.startedAt) / 1000) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function JobsPage({ jobs }: { jobs: JobsStats }) {
  const failing = jobs.jobs.filter((job) => job.lastResult === "failed").length;

  return (
    <>
      <PageHeader title="jobs" meta={`${jobs.jobs.length} scheduled${failing ? ` · ${failing} failed` : ""} · times in utc`} />
      <div className="stack">
        <section className="panel" aria-label="scheduled jobs">
          <header className="panel-header">
            <h2>scheduled</h2>
            <span className="panel-meta">{jobs.updatedAt ? `checked ${relative(Date.parse(jobs.updatedAt) / 1000)}` : "agent not reporting"}</span>
          </header>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th aria-label="status" />
                  <th>job</th>
                  <th className="hide-narrow">schedule</th>
                  <th className="right">last run</th>
                  <th className="right hide-narrow">next run</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {jobs.jobs.map((job) => (
                  <JobRow key={job.name} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GitHubCiPanel github={jobs.github} />

        <section className="panel" aria-label="server actions">
          <header className="panel-header">
            <h2>server</h2>
            <span className="panel-meta">via keep-agent</span>
          </header>
          <div className="panel-body actions">
            {jobs.switches.map((app) => (
              <div className="action" key={app.name}>
                <div>
                  <h3>{app.name}</h3>
                  <p className="muted small">
                    {app.running ? "running" : "asleep"}
                    {app.description && ` · ${app.description}`}
                  </p>
                </div>
                {app.running ? (
                  <ActionButton action={`stop:${app.name}`} label="stop" confirm="click again to stop" />
                ) : (
                  <ActionButton action={`start:${app.name}`} label="start" />
                )}
              </div>
            ))}
            <div className="action">
              <div>
                <h3>tidy up</h3>
                <p className="muted small">
                  docker leftovers, old logs, caches. data untouched.
                  {jobs.tidy && ` last: ${relative(Date.parse(jobs.tidy.at) / 1000)}, freed ${bytes(jobs.tidy.freedBytes)}.`}
                </p>
              </div>
              <ActionButton action="tidy" label="tidy now" />
            </div>
            <div className="action">
              <div>
                <h3>reboot</h3>
                <p className="muted small">back in about 90 seconds.</p>
              </div>
              <ActionButton action="reboot" label="reboot" confirm="click again to reboot" danger />
            </div>
          </div>
        </section>

        <section className="panel" aria-label="recent actions">
          <header className="panel-header">
            <h2>recent actions</h2>
            <span className="panel-meta">last 20</span>
          </header>
          <div className="panel-body">
            {jobs.actions.length === 0 ? (
              <p className="empty">nothing yet</p>
            ) : (
              <table className="table">
                <tbody>
                  {jobs.actions.map((record) => (
                    <tr key={`${record.at}-${record.action}`}>
                      <td>
                        <StatusSquare status={record.status === "done" ? "ok" : record.status === "refused" ? "warn" : "down"} />
                      </td>
                      <td>{record.action}</td>
                      <td className="muted">{record.detail}</td>
                      <td className="num right muted">{relative(Date.parse(record.at) / 1000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
