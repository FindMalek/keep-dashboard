import type { Viewer } from "../shared/types";

const FORGET_AFTER_MS = 7 * 86400 * 1000;

/** Who has had the dashboard open, by client IP (Traefik passes it in X-Real-Ip). */
export class ViewerLog {
  private readonly viewers = new Map<string, Viewer & { streams: number }>();

  private touch(request: Request): (Viewer & { streams: number }) | null {
    const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!ip) return null;
    const now = Date.now();
    const viewer = this.viewers.get(ip) ?? { ip, userAgent: "", firstSeen: now, lastSeen: now, live: false, streams: 0 };
    viewer.lastSeen = now;
    viewer.userAgent = request.headers.get("user-agent") ?? viewer.userAgent;
    this.viewers.set(ip, viewer);
    return viewer;
  }

  seen(request: Request): void {
    this.touch(request);
  }

  /** Marks a live stream open; call the returned function when it closes. */
  streaming(request: Request): () => void {
    const viewer = this.touch(request);
    if (!viewer) return () => {};
    viewer.streams += 1;
    return () => {
      viewer.streams = Math.max(0, viewer.streams - 1);
      viewer.lastSeen = Date.now();
    };
  }

  list(): Viewer[] {
    const cutoff = Date.now() - FORGET_AFTER_MS;
    return [...this.viewers.values()]
      .filter((viewer) => viewer.lastSeen > cutoff)
      .map(({ streams, ...viewer }) => ({ ...viewer, live: streams > 0 }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }
}
