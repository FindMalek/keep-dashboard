import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { DnsStats, HomeStats, InternetStats, MusicStats, ReadingStats } from "../shared/types";
import { readText } from "../lib/host";

const NAVIDROME = "http://navidrome:4533";
const ADGUARD = "http://adguard:80";
const MINIFLUX = "http://miniflux:8080";
const TIMEOUT = 6000;

type Secrets = Record<string, string>;

async function secrets(path: string): Promise<Secrets> {
  const text = (await readText(path)) ?? "";
  return Object.fromEntries(text.split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

async function json<T>(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return { body: (await response.json()) as T, headers: response.headers };
}

const emptyMusic: MusicStats = { reachable: false, songs: 0, albums: 0, artists: 0, nowPlaying: [], recentlyAdded: [], lastImport: null };

async function music(env: Secrets, dataDir: string): Promise<MusicStats> {
  const lastImport = JSON.parse((await readText(`${dataDir}/music-import.json`)) ?? "null") as MusicStats["lastImport"];
  if (!env.NAVIDROME_USER) return { ...emptyMusic, lastImport };
  try {
    // Native API for counts (X-Total-Count), Subsonic API for now playing and recent albums.
    const { body: login } = await json<{ token: string }>(`${NAVIDROME}/auth/login`, { "Content-Type": "application/json" }, {
      method: "POST",
      body: JSON.stringify({ username: env.NAVIDROME_USER, password: env.NAVIDROME_PASS }),
    });
    const auth = { "x-nd-authorization": `Bearer ${login.token}` };
    const total = async (resource: string) => Number((await json(`${NAVIDROME}/api/${resource}?_end=1`, auth)).headers.get("x-total-count") ?? 0);
    const salt = randomBytes(6).toString("hex");
    const subsonic = new URLSearchParams({
      u: env.NAVIDROME_USER ?? "", s: salt, t: createHash("md5").update(`${env.NAVIDROME_PASS}${salt}`).digest("hex"), v: "1.16.1", c: "keep-dashboard", f: "json",
    });
    const sub = async <T>(endpoint: string, extra = "") => (await json<{ "subsonic-response": T }>(`${NAVIDROME}/rest/${endpoint}?${subsonic}${extra}`)).body["subsonic-response"];

    const [songs, albums, artists, playing, newest] = await Promise.all([
      total("song"),
      total("album"),
      total("artist"),
      sub<{ nowPlaying?: { entry?: { username: string; title: string; artist: string; album: string; minutesAgo: number; playerName: string }[] } }>("getNowPlaying"),
      sub<{ albumList2?: { album?: { name: string; artist: string; year?: number }[] } }>("getAlbumList2", "&type=newest&size=4"),
    ]);
    return {
      reachable: true,
      songs,
      albums,
      artists,
      nowPlaying: (playing.nowPlaying?.entry ?? []).map((entry) => ({
        user: entry.username, title: entry.title, artist: entry.artist, album: entry.album, minutesAgo: entry.minutesAgo, player: entry.playerName,
      })),
      recentlyAdded: (newest.albumList2?.album ?? []).map((album) => ({ album: album.name, artist: album.artist, year: album.year ?? null })),
      lastImport,
    };
  } catch {
    return { ...emptyMusic, lastImport };
  }
}

const emptyDns: DnsStats = { reachable: false, protection: false, queries: 0, blocked: 0, avgMs: 0, hourlyQueries: [], hourlyBlocked: [], topBlocked: [] };

async function dns(env: Secrets): Promise<DnsStats> {
  if (!env.ADGUARD_USER) return emptyDns;
  const auth = { Authorization: `Basic ${btoa(`${env.ADGUARD_USER}:${env.ADGUARD_PASS}`)}` };
  try {
    const [{ body: stats }, { body: status }] = await Promise.all([
      json<{
        num_dns_queries: number; num_blocked_filtering: number; avg_processing_time: number;
        dns_queries: number[]; blocked_filtering: number[]; top_blocked_domains: Record<string, number>[];
      }>(`${ADGUARD}/control/stats`, auth),
      json<{ protection_enabled: boolean }>(`${ADGUARD}/control/status`, auth),
    ]);
    return {
      reachable: true,
      protection: status.protection_enabled,
      queries: stats.num_dns_queries,
      blocked: stats.num_blocked_filtering,
      avgMs: stats.avg_processing_time * 1000,
      hourlyQueries: stats.dns_queries,
      hourlyBlocked: stats.blocked_filtering,
      topBlocked: stats.top_blocked_domains.slice(0, 4).map((entry) => {
        const [domain = "", count = 0] = Object.entries(entry)[0] ?? [];
        return { domain, count };
      }),
    };
  } catch {
    return emptyDns;
  }
}

function internet(path: string): InternetStats {
  try {
    // Speedtest Tracker's SQLite uses the default rollback journal, so a read-only open is safe while it writes.
    const db = new Database(path, { readonly: true });
    const rows = db
      .query<{ ping: number; download: number; upload: number; created_at: string; data: string | null }, []>(
        "SELECT ping, download, upload, created_at, data FROM results WHERE status = 'completed' ORDER BY id DESC LIMIT 42",
      )
      .all();
    db.close();
    const history = rows.map((row) => ({ at: `${row.created_at.replace(" ", "T")}Z`, downBps: row.download, upBps: row.upload, pingMs: row.ping })).reverse();
    const newest = rows[0];
    let isp: string | null = null;
    let server: string | null = null;
    try {
      const data = JSON.parse(newest?.data ?? "{}") as { isp?: string; server?: { name?: string; location?: string } };
      isp = data.isp ?? null;
      server = data.server ? `${data.server.name ?? ""}${data.server.location ? ` · ${data.server.location}` : ""}` : null;
    } catch {
      // Older rows may not carry the raw Ookla payload.
    }
    const latest = history.at(-1);
    return { latest: latest ? { ...latest, isp, server } : null, history };
  } catch {
    return { latest: null, history: [] };
  }
}

const emptyReading: ReadingStats = { reachable: false, unread: 0, feeds: 0, latest: [] };

async function reading(env: Secrets): Promise<ReadingStats> {
  if (!env.MINIFLUX_API_KEY) return emptyReading;
  const auth = { "X-Auth-Token": env.MINIFLUX_API_KEY };
  try {
    const [{ body: counters }, { body: feeds }, { body: entries }] = await Promise.all([
      json<{ unreads: Record<string, number> }>(`${MINIFLUX}/v1/feeds/counters`, auth),
      json<unknown[]>(`${MINIFLUX}/v1/feeds`, auth),
      json<{ entries: { title: string; url: string; published_at: string; feed: { title: string } }[] }>(
        `${MINIFLUX}/v1/entries?status=unread&order=published_at&direction=desc&limit=4`,
        auth,
      ),
    ]);
    return {
      reachable: true,
      unread: Object.values(counters.unreads).reduce((sum, count) => sum + count, 0),
      feeds: feeds.length,
      latest: entries.entries.map((entry) => ({ title: entry.title, feed: entry.feed.title, url: entry.url, publishedAt: entry.published_at })),
    };
  } catch {
    return emptyReading;
  }
}

/** Music, ad blocking, internet speed and reading: the "home" row of the overview. */
export function createHomeCollector(dataDir: string, speedtestDb: string): () => Promise<HomeStats> {
  return async () => {
    const env = await secrets(`${dataDir}/integrations.env`);
    const [musicStats, dnsStats, readingStats] = await Promise.all([music(env, dataDir), dns(env), reading(env)]);
    return { music: musicStats, dns: dnsStats, internet: internet(speedtestDb), reading: readingStats };
  };
}
