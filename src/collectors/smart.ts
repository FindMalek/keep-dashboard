import { readFileSync } from "node:fs";
import type { SmartStats } from "../shared/types";
import { HOST_ETC } from "../lib/host";

const PATH = `${HOST_ETC}/keep-dashboard/smart.json`;

export function smart(): SmartStats {
  try {
    const data = JSON.parse(readFileSync(PATH, "utf8")) as SmartStats;
    return { at: data.at ?? null, disks: data.disks ?? [] };
  } catch {
    return { at: null, disks: [] };
  }
}
