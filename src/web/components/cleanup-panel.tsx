import { Fragment } from "react";
import type { CleanupItem, CleanupRun } from "../../shared/types";
import { stamp, since } from "../lib/time";
import { Chip } from "./chip";
import { Panel } from "./panel";

type Block = { kind: "run"; run: CleanupRun } | { kind: "quiet"; runs: CleanupRun[] };

/** Runs that removed something get their own block; stretches of empty runs collapse into one line. */
function blocks(runs: CleanupRun[]): Block[] {
  const result: Block[] = [];
  for (const run of runs) {
    const previous = result.at(-1);
    if (run.removed.length > 0) result.push({ kind: "run", run });
    else if (previous?.kind === "quiet") previous.runs.push(run);
    else result.push({ kind: "quiet", runs: [run] });
  }
  return result;
}

function reasonTone(reason: string): "crit" | "warn" | "plain" {
  if (reason === "failed") return "crit";
  if (reason === "stuck") return "warn";
  return "plain";
}

function ItemRow({ item }: { item: CleanupItem }) {
  return (
    <tr>
      <td>
        <Chip>{item.type}</Chip>
      </td>
      <td>
        {item.type === "deployment" ? (
          <>
            {item.project.toLowerCase()} <span className="muted">/</span> {item.service}
          </>
        ) : (
          <span className="mono">{item.path}</span>
        )}
      </td>
      <td className="muted hide-narrow">
        {item.type === "deployment" ? `${item.title.toLowerCase()} · ${item.status} · ${stamp(Date.parse(item.createdAt))}` : "folder"}
      </td>
      <td className="mono muted hide-narrow" title={item.id ?? "not recorded"}>
        {item.id ? item.id.slice(0, 10) : "—"}
      </td>
      <td className="right">
        <Chip tone={reasonTone(item.reason)}>{item.reason}</Chip>
      </td>
    </tr>
  );
}

export function CleanupPanel({ runs }: { runs: CleanupRun[] }) {
  const last = runs[0];
  const total = runs.reduce((sum, run) => sum + run.removed.length, 0);
  const unmanaged = last?.unmanaged ?? [];

  return (
    <Panel title="cleanup" area="cleanup" meta="newest 3 kept · 04:30 utc">
      <dl className="stats">
        <div>
          <dt>last run</dt>
          <dd>{last ? since(Date.parse(last.at)) : "never"}</dd>
        </div>
        <div>
          <dt>took</dt>
          <dd>{last?.durationMs != null ? `${last.durationMs} ms` : "—"}</dd>
        </div>
        <div>
          <dt>removed last run</dt>
          <dd>{last?.removed.length ?? 0}</dd>
        </div>
        <div>
          <dt>removed, last {runs.length} runs</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>unmanaged containers</dt>
          <dd className={unmanaged.length ? "level-warn" : ""}>{unmanaged.length}</dd>
        </div>
      </dl>

      {unmanaged.length > 0 && (
        <>
          <h3 className="subhead">unmanaged · never removed automatically</h3>
          <table className="table">
            <tbody>
              {unmanaged.map((container) => (
                <tr key={container.id ?? container.name}>
                  <td>
                    <Chip tone="warn">unmanaged</Chip>
                  </td>
                  <td>{container.name}</td>
                  <td className="muted">{container.stack ?? "no compose project"}</td>
                  <td className="mono muted">{container.id?.slice(0, 12) ?? "—"}</td>
                  <td className="right muted">{container.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {runs.length === 0 ? (
        <p className="empty">no runs yet</p>
      ) : (
        <table className="table log">
          <thead>
            <tr>
              <th>type</th>
              <th>target</th>
              <th className="hide-narrow">item</th>
              <th className="hide-narrow">id</th>
              <th className="right">reason</th>
            </tr>
          </thead>
          <tbody>
            {blocks(runs).map((block) =>
              block.kind === "quiet" ? (
                <tr className="log-run log-quiet" key={`q-${block.runs[0]?.id}`}>
                  <td colSpan={5}>
                    {block.runs.length === 1
                      ? `run ${block.runs[0]?.id} · ${stamp(Date.parse(block.runs[0]?.at ?? ""))} · nothing to remove`
                      : `${block.runs.length} runs with nothing to remove · ${stamp(Date.parse(block.runs.at(-1)?.at ?? ""))} → ${stamp(Date.parse(block.runs[0]?.at ?? ""))}`}
                  </td>
                </tr>
              ) : (
                <Fragment key={block.run.id}>
                  <tr className="log-run">
                    <td colSpan={5}>
                      <span className="mono">run {block.run.id}</span>
                      <span className="muted">
                        {" "}
                        · {stamp(Date.parse(block.run.at))} · {block.run.removed.length} removed
                        {block.run.durationMs != null && ` · ${block.run.durationMs} ms`}
                      </span>
                    </td>
                  </tr>
                  {block.run.removed.map((item, index) => (
                    <ItemRow key={`${block.run.id}-${item.id ?? index}`} item={item} />
                  ))}
                </Fragment>
              ),
            )}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
