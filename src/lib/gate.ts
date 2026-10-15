import { timingSafeEqual } from "node:crypto";

/*
 * Only the tailnet route may use the API. Traefik's tailnet router adds `x-keep-gate: <KEEP_GATE>` (overwriting any
 * value a client sent), so a browser on the tailnet gets in and anything else that can reach this port directly
 * (every container on the shared Docker network) gets 403. /healthz stays open for uptime checks.
 */

const HEADER = "x-keep-gate";

type Handler = (request: Request, ...rest: never[]) => Response | Promise<Response>;

export function passes(request: Request, secret: string | undefined): boolean {
  if (!secret) return true;
  const sent = Buffer.from(request.headers.get(HEADER) ?? "");
  const wanted = Buffer.from(secret);
  return sent.length === wanted.length && timingSafeEqual(sent, wanted);
}

function guard<T extends Handler>(handler: T, secret: string | undefined): T {
  return ((request: Request, ...rest: never[]) =>
    passes(request, secret) ? handler(request, ...rest) : new Response("forbidden", { status: 403 })) as T;
}

/** Every handler route behind the gate; static pages (HTML bundles) and the listed open paths as they are. */
export function gated<R extends Record<string, unknown>>(routes: R, secret: string | undefined, open: string[] = ["/healthz"]): R {
  if (!secret) return routes;
  return Object.fromEntries(
    Object.entries(routes).map(([path, route]) => {
      if (open.includes(path)) return [path, route];
      if (typeof route === "function") return [path, guard(route as Handler, secret)];
      if (route && typeof route === "object" && !("index" in route) && Object.keys(route).every((key) => /^[A-Z]+$/.test(key)))
        return [path, Object.fromEntries(Object.entries(route).map(([method, handler]) => [method, guard(handler as Handler, secret)]))];
      return [path, route];
    }),
  ) as R;
}
