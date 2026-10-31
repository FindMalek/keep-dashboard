import type { GitHubCiStatus, GitHubRun, GitHubRunner } from "../shared/types";

const repos = (): string[] =>
  (process.env.KEEP_GITHUB_REPOS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

const token = (): string => process.env.KEEP_GITHUB_TOKEN ?? "";
const REFRESH_MS = 60_000;
const TIMEOUT_MS = 8_000;

let last: { at: number; status: GitHubCiStatus | null } = { at: 0, status: null };
let pending: Promise<GitHubCiStatus | null> | null = null;

interface ApiRunner {
  id: number;
  name: string;
  status: "online" | "offline";
  busy: boolean;
  labels: { name: string }[];
}

interface ApiRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  html_url: string;
  run_started_at: string | null;
}

async function github<T>(path: string): Promise<T | null> {
  if (!token()) return null;
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "keep-dashboard",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`GitHub API error ${res.status}: ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`GitHub API fetch failed: ${path}`, err);
    return null;
  }
}

/** Called every 5 s with the rest of the jobs data: GitHub is asked once a minute, and the last good answer stands in when it fails. */
export async function collectGitHubCi(): Promise<GitHubCiStatus | null> {
  if (repos().length === 0 || !token()) return null;
  if (Date.now() - last.at < REFRESH_MS) return last.status;
  pending ??= fetchGitHubCi().finally(() => (pending = null));
  return (await pending) ?? last.status;
}

async function fetchGitHubCi(): Promise<GitHubCiStatus | null> {
  const results = await Promise.all(
    repos().map(async (repo) => {
      const [runnersData, runsData] = await Promise.all([
        github<{ runners: ApiRunner[] }>(`/repos/${repo}/actions/runners`),
        github<{ workflow_runs: ApiRun[] }>(`/repos/${repo}/actions/runs?per_page=5`),
      ]);

      const runners: GitHubRunner[] =
        runnersData?.runners.map((r) => ({
          id: r.id,
          name: r.name,
          repo,
          status: r.status,
          busy: r.busy,
          labels: r.labels.map((l) => l.name),
        })) ?? [];

      const runs: GitHubRun[] =
        runsData?.workflow_runs.map((r) => ({
          id: r.id,
          repo,
          workflow: r.name,
          status: r.status,
          conclusion: r.conclusion,
          branch: r.head_branch,
          url: r.html_url,
          startedAt: r.run_started_at,
        })) ?? [];

      return { runners, runs };
    })
  );

  const runners = results.flatMap((r) => r.runners);
  const runs = results.flatMap((r) => r.runs).sort((a, b) => {
    const aTime = a.startedAt ? Date.parse(a.startedAt) : 0;
    const bTime = b.startedAt ? Date.parse(b.startedAt) : 0;
    return bTime - aTime;
  });

  const status = { updatedAt: new Date().toISOString(), runners, runs: runs.slice(0, 20) };
  // Every call failed (rate limit, outage): keep showing the last good panel and try again next tick.
  if (!runners.length && !runs.length && last.status) {
    last = { at: Date.now(), status: last.status };
    return null;
  }
  last = { at: Date.now(), status };
  return status;
}
