import type { ServiceCheck } from "../shared/types";
import type { ServiceConfig } from "../lib/config";

export async function checkServices(services: ServiceConfig[]): Promise<ServiceCheck[]> {
  return Promise.all(
    services.map(async ({ name, url }) => {
      const started = performance.now();
      try {
        const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
        // Anything below 500 means the app answered; 401/403/404 are fine for APIs like S3.
        return {
          name,
          url,
          ok: response.status < 500,
          status: response.status,
          latencyMs: Math.round(performance.now() - started),
        };
      } catch {
        return { name, url, ok: false, status: null, latencyMs: null };
      }
    }),
  );
}
