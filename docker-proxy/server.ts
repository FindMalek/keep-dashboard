/*
 * The dashboard's only way to Docker: forwards exactly `GET /containers/json` (the container list) to the socket and
 * refuses everything else. A general socket proxy would also allow `GET /containers/{id}/json`, which returns every
 * container's environment, secrets included.
 */

const SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const PORT = Number(process.env.PORT ?? 2375);

export function allowed(request: Request): URL | null {
  const url = new URL(request.url);
  if (request.method !== "GET" || !/^(\/v[\d.]+)?\/containers\/json$/.test(url.pathname)) return null;
  // Only the "include stopped" flag; no filters that could be abused for anything else.
  const query = new URLSearchParams(url.searchParams.get("all") === "1" ? { all: "1" } : {});
  return new URL(`http://docker/containers/json?${query}`);
}

if (import.meta.main)
  Bun.serve({
    port: PORT,
    async fetch(request) {
      const target = allowed(request);
      if (!target) return new Response("not allowed", { status: 403 });
      const response = await fetch(target, { unix: SOCKET }).catch(() => null);
      if (!response) return new Response("docker unreachable", { status: 502 });
      return new Response(response.body, { status: response.status, headers: { "content-type": "application/json" } });
    },
  });
