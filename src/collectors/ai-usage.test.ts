import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readAiUsage, recordAiUsage } from "./ai-usage";

test("keeps one entry per tool and machine and alerts once when weekly crosses 80", async () => {
  const dir = await mkdtemp(`${tmpdir()}/keep-ai-`);
  const sent: string[] = [];
  const notify = async (m: string) => void sent.push(m);
  const post = (weeklyPct: number) => recordAiUsage(dir, { tool: "claude", machine: "mac", weeklyPct }, notify);

  await post(50);
  await post(85);
  await post(90);

  const all = await readAiUsage(dir);
  expect(all).toHaveLength(1);
  expect(all[0]?.weeklyPct).toBe(90);
  expect(sent).toHaveLength(1);
  expect(await recordAiUsage(dir, { tool: "../x", machine: "mac", weeklyPct: 1 })).toBeNull();
});
