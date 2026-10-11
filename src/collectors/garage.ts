import type { BucketStats, GarageStats } from "../shared/types";
import { readText } from "../lib/host";

interface BucketListItem {
  id: string;
  globalAliases: string[];
}

interface BucketInfo {
  bytes: number;
  objects: number;
  quotas?: { maxSize: number | null };
}

export function createGarageCollector(adminUrl: string | null, configPath: string): () => Promise<GarageStats> {
  let token: string | null = null;

  return async () => {
    if (!adminUrl) return { healthy: null, buckets: [] };
    token ??= /^admin_token\s*=\s*"([^"]+)"/m.exec((await readText(configPath)) ?? "")?.[1] ?? null;
    if (!token) return { healthy: null, buckets: [] };

    const get = async <T>(path: string): Promise<T> => {
      const response = await fetch(`${adminUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return (await response.json()) as T;
    };

    try {
      const [health, list] = await Promise.all([
        get<{ status: string }>("/v2/GetClusterHealth"),
        get<BucketListItem[]>("/v2/ListBuckets"),
      ]);
      const buckets: BucketStats[] = await Promise.all(
        list.map(async (bucket) => {
          const info = await get<BucketInfo>(`/v2/GetBucketInfo?id=${bucket.id}`);
          return {
            name: bucket.globalAliases[0] ?? bucket.id.slice(0, 12),
            bytes: info.bytes,
            objects: info.objects,
            quotaBytes: info.quotas?.maxSize ?? null,
          };
        }),
      );
      return { healthy: health.status === "healthy", buckets: buckets.sort((a, b) => a.name.localeCompare(b.name)) };
    } catch {
      return { healthy: false, buckets: [] };
    }
  };
}
