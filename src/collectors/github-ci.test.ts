import { expect, mock, test } from "bun:test";

process.env.KEEP_GITHUB_TOKEN = "t";
process.env.KEEP_GITHUB_REPOS = "a/b";

test("github is asked once a minute, and the last good answer survives a failure", async () => {
  let calls = 0;
  let failing = false;
  globalThis.fetch = mock(async (url: string) => {
    calls++;
    if (failing) return new Response("rate limited", { status: 403 });
    return Response.json(url.includes("/runners") ? { runners: [{ id: 1, name: "r", status: "online", busy: false, labels: [] }] } : { workflow_runs: [] });
  }) as unknown as typeof fetch;
  const { collectGitHubCi } = await import("./github-ci");

  const first = await collectGitHubCi();
  await collectGitHubCi();
  expect(calls).toBe(2);
  expect(first?.runners).toHaveLength(1);

  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  failing = true;
  try {
    expect((await collectGitHubCi())?.runners).toHaveLength(1);
  } finally {
    Date.now = realNow;
  }
});
