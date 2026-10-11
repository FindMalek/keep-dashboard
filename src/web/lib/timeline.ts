import type { ActivityPayload } from "../../shared/types";
import { browserOf, whoIs } from "./devices";
import { duration } from "./format";

export type TimelineFilter = "all" | "logins" | "commands" | "deploys" | "system";

export interface TimelineEvent {
  at: number;
  kind: string;
  tone: "plain" | "warn" | "crit" | "solid";
  filter: Exclude<TimelineFilter, "all">;
  who: string;
  via: string | null;
  what: string;
  ref: string | null;
  /** Consecutive events with the same key fold into one row. */
  group: string;
}

export interface TimelineRow {
  first: TimelineEvent;
  events: TimelineEvent[];
}

const GROUP_GAP_MS = 15 * 60 * 1000;
const MAX_COMMAND = 140;

function shortCommand(command: string): string {
  const flat = command.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > MAX_COMMAND ? `${flat.slice(0, MAX_COMMAND)}…` : flat;
}

/** "3 ssh logins · 7 sudo" for a folded row mixing kinds. */
export function summarize(events: TimelineEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${count} ${kind === "sudo" ? (count === 1 ? "command" : "commands") : kind === "ssh login" ? (count === 1 ? "login" : "logins") : kind}`).join(" · ");
}

export function buildTimeline(data: ActivityPayload): TimelineEvent[] {
  const who = (ip: string | null) => whoIs(ip, data.devices, data.publicIp);
  const events: TimelineEvent[] = [];

  for (const event of data.events) {
    const at = event.at * 1000;
    if (event.kind === "ssh") {
      const source = who(event.source);
      const length = event.endedAt ? ` · ${event.endedAt - event.at < 60 ? `${event.endedAt - event.at}s` : duration(event.endedAt - event.at)}` : "";
      events.push({
        at, kind: "ssh login", tone: "plain", filter: "logins", who: `${event.user} · ${source.name}`, via: source.via,
        what: `${event.detail}${length}`, ref: event.key ? `key …${event.key}` : null, group: `session|${event.user}`,
      });
    } else if (event.kind === "ssh-failed") {
      const source = who(event.source);
      events.push({
        at, kind: "failed login", tone: "crit", filter: "logins", who: `${event.user ?? "?"} · ${source.name}`, via: source.via,
        what: "rejected", ref: event.source, group: `fail|${event.source}`,
      });
    } else if (event.kind === "sudo") {
      events.push({
        at, kind: "sudo", tone: "plain", filter: "commands", who: event.user ?? "?", via: null,
        what: shortCommand(event.detail), ref: null, group: `session|${event.user}`,
      });
    } else {
      events.push({ at, kind: "boot", tone: "warn", filter: "system", who: "server", via: null, what: event.detail, ref: null, group: `boot|${at}` });
    }
  }

  for (const deploy of data.deploys) {
    events.push({
      at: Date.parse(deploy.at), kind: "deploy", tone: deploy.status === "error" ? "crit" : "plain", filter: "deploys",
      who: `${deploy.project.toLowerCase()} / ${deploy.service}`, via: null,
      what: `${deploy.title.toLowerCase()} · ${deploy.status === "done" ? "ok" : deploy.status}${deploy.durationSec !== null ? ` · ${Math.round(deploy.durationSec)}s` : ""}`,
      ref: deploy.id.slice(0, 10), group: `deploy|${deploy.project}|${deploy.service}`,
    });
  }

  for (const run of data.cleanupRuns) {
    events.push({
      at: Date.parse(run.at), kind: "cleanup", tone: "plain", filter: "deploys", who: "keep-cleanup", via: null,
      what: run.removed.length ? `removed ${run.removed.length}` : "nothing to remove", ref: `run ${run.id}`, group: `cleanup|${run.id}`,
    });
  }

  for (const action of data.actions) {
    events.push({
      at: Date.parse(action.at), kind: "action", tone: action.status === "done" ? "plain" : action.status === "refused" ? "warn" : "crit",
      filter: "commands", who: "dashboard", via: null, what: `${action.action} · ${action.detail}`, ref: null, group: `action|${action.at}`,
    });
  }

  for (const session of data.dokploySessions) {
    const source = who(session.ip);
    events.push({
      at: Date.parse(session.createdAt), kind: "dokploy login", tone: "plain", filter: "logins",
      who: `${session.email} · ${source.name}`, via: source.via, what: browserOf(session.userAgent), ref: session.id.slice(0, 10),
      group: `dokploy|${session.id}`,
    });
  }

  for (const viewer of data.viewers) {
    const source = who(viewer.ip);
    events.push({
      at: viewer.firstSeen, kind: "dashboard", tone: "plain", filter: "logins", who: source.name, via: source.via,
      what: `opened · ${browserOf(viewer.userAgent)}`, ref: null, group: `viewer|${viewer.ip}`,
    });
  }

  return events.sort((a, b) => b.at - a.at);
}

/** Folds runs like 40 ssh logins from the same laptop in a few minutes into one expandable row. */
export function groupTimeline(events: TimelineEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const event of events) {
    const row = rows.at(-1);
    const previous = row?.events.at(-1);
    if (row && previous && row.first.group === event.group && previous.at - event.at < GROUP_GAP_MS) row.events.push(event);
    else rows.push({ first: event, events: [event] });
  }
  return rows;
}
