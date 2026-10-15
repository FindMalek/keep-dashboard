import { expect, test } from "bun:test";
import { allowed } from "./server";

test("only the container list gets through; inspect, logs, exec and writes don't", () => {
  const get = (path: string, method = "GET") => allowed(new Request(`http://docker-proxy:2375${path}`, { method }));
  expect(get("/containers/json?all=1")?.search).toBe("?all=1");
  expect(get("/v1.47/containers/json")?.pathname).toBe("/containers/json");
  expect(get("/containers/json?all=1&filters=x")?.search).toBe("?all=1");
  expect(get("/containers/abc/json")).toBeNull();
  expect(get("/containers/abc/logs")).toBeNull();
  expect(get("/containers/create", "POST")).toBeNull();
  expect(get("/containers/json", "POST")).toBeNull();
  expect(get("/images/json")).toBeNull();
});
