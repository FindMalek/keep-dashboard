import type { GitHubCiStatus, GitHubRun, GitHubRunner } from "../shared/types";

const REPOS = (process.env.KEEP_GITHUB_REPOS ?? "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const TOKEN = process.env.KEEP_GITHUB_TOKEN ?? "";

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
  if (!TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "keep-dashboard",
      },
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

export async function collectGitHubCi(): Promise<GitHubCiStatus | null> {
  if (REPOS.length === 0 || !TOKEN) return null;

  const results = await Promise.all(
    REPOS.map(async (repo) => {
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

  return {
    updatedAt: new Date().toISOString(),
    runners,
    runs: runs.slice(0, 20),
  };
}
