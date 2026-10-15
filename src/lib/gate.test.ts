import { expect, test } from "bun:test";
import { gated } from "./gate";

test("without the gate header the api answers 403, with it the handler runs; health and pages stay open", async () => {
  const page = { index: "<html>" };
  const routes = gated(
    {
      "/": page,
      "/healthz": () => new Response("ok"),
      "/api/snapshot": () => new Response("data"),
      "/api/actions": { POST: () => new Response(null, { status: 202 }) },
    },
    "s3cret",
  );
  const call = (handler: unknown, headers: Record<string, string> = {}) =>
    (handler as (request: Request) => Response)(new Request("http://dashboard/x", { method: "POST", headers }));

  expect(call(routes["/api/snapshot"]).status).toBe(403);
  expect(call(routes["/api/actions"].POST, { "x-keep-action": "1" }).status).toBe(403);
  expect(call(routes["/api/actions"].POST, { "x-keep-gate": "wrong!" }).status).toBe(403);
  expect(call(routes["/api/actions"].POST, { "x-keep-gate": "s3cret" }).status).toBe(202);
  expect(await call(routes["/healthz"]).text()).toBe("ok");
  expect(routes["/"]).toBe(page);
});
