/** Human descriptions for the services on the apps page. */
export const APP_DESCRIPTIONS: Record<string, string> = {
  // Infrastructure
  dokploy: "deploys apps and composes; management panel",
  garage: "s3-compatible object store for app data and backups",
  "uptime-kuma": "monitors public services and sends alerts",
  adguard: "dns ad blocker for the lan and tailnet",
  dozzle: "live container logs",
  traefik: "reverse proxy and tls termination",

  // Personal
  navidrome: "music server and library",
  beets: "tags and organizes incoming music files",
  ente: "self-hosted photo gallery",
  seafile: "self-hosted file sync and storage",
  vaultwarden: "self-hosted password manager",

  // Tools
  karakeep: "bookmark and read-later service with full-page archives",
  meilisearch: "search index for karakeep",
  chrome: "headless browser for karakeep archiving",
  miniflux: "rss reader",
  speedtest: "internet speed tracker",

  // Games
  minecraft: "fabric minecraft server for friends",
  "minecraft-site": "companion site for the minecraft server",
  backups: "nightly minecraft world backups",

  // Dashboard
  dashboard: "this dashboard: system, uptime, apps, jobs, activity",
  "docker-proxy": "restricted docker socket proxy for the dashboard",

  // Other projects that may appear in dokploy
  balkiss: "pottery studio client project: web, dashboard and api",
  lyterion: "moves a spotify library into navidrome",
  sonaraem: "ai-powered spotify library classification and playlists",
  findplate: "project starter and scaffolding cli",
  burnrate: "track ai coding tool quota usage",
  memry: "personal operating system for notes, journal and tasks",
  "balkiss-db": "balkiss postgres database",
  "balkiss-api": "balkiss api server",
  "balkiss-web": "balkiss public website",
  "balkiss-dashboard": "balkiss admin dashboard",
};

export function descriptionFor(name: string): string | undefined {
  return APP_DESCRIPTIONS[name.toLowerCase()];
}
