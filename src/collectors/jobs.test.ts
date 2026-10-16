import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { requestAction } from "./jobs";

test("queues start/stop for a named app, nothing with stray characters", async () => {
  const dir = await mkdtemp(`${tmpdir()}/keep-jobs-`);
  expect(await requestAction(dir, "stop:minecraft")).toBe(true);
  expect(await requestAction(dir, "start:minecraft; reboot")).toBe(false);
  expect(await readdir(`${dir}/requests`)).toHaveLength(1);
});
