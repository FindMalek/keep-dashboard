import { statfs } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { DiskStats, MountStats } from "../shared/types";
import type { MountConfig } from "../lib/config";
import { HOST_PROC, HOST_SYS, listDir, readNumber, readText, resolvePath } from "../lib/host";

const SECTOR_BYTES = 512;
const WHOLE_DISK = /^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|mmcblk\d+)$/;

interface Counters {
  reads: number;
  readSectors: number;
  writes: number;
  writeSectors: number;
  ioMs: number;
}

async function hostMounts(): Promise<Map<string, string>> {
  const text = (await readText(`${HOST_PROC}/1/mounts`)) ?? "";
  const byPath = new Map<string, string>();
  for (const line of text.split("\n")) {
    const [device, path] = line.split(" ");
    if (device?.startsWith("/dev/") && path) byPath.set(path, device);
  }
  return byPath;
}

/** `/dev/mapper/vg-lv` or `/dev/sda1` → the whole disks underneath, e.g. `["sdb"]`. */
async function disksBehind(device: string): Promise<string[]> {
  let partitions: string[] = [basename(device)];

  if (device.startsWith("/dev/mapper/")) {
    const name = basename(device);
    partitions = [];
    for (const dm of (await listDir(`${HOST_SYS}/block`)).filter((block) => block.startsWith("dm-"))) {
      if ((await readText(`${HOST_SYS}/block/${dm}/dm/name`))?.trim() === name) {
        partitions = await listDir(`${HOST_SYS}/block/${dm}/slaves`);
      }
    }
  }

  const disks = await Promise.all(
    partitions.map(async (partition) => {
      const real = await resolvePath(`${HOST_SYS}/class/block/${partition}`);
      if (!real) return null;
      return WHOLE_DISK.test(basename(real)) ? basename(real) : basename(dirname(real));
    }),
  );
  return [...new Set(disks.filter((disk): disk is string => disk !== null))];
}

async function diskTemperatures(): Promise<Map<string, number>> {
  const byDevice = new Map<string, number>();
  for (const hwmon of await listDir(`${HOST_SYS}/class/hwmon`)) {
    const base = `${HOST_SYS}/class/hwmon/${hwmon}`;
    if ((await readText(`${base}/name`))?.trim() !== "drivetemp") continue;
    const device = await resolvePath(`${base}/device`);
    const milli = await readNumber(`${base}/temp1_input`);
    if (device && milli !== null) byDevice.set(device, milli / 1000);
  }
  return byDevice;
}

export async function collectMounts(mounts: MountConfig[]): Promise<MountStats[]> {
  const devices = await hostMounts();
  return Promise.all(
    mounts.map(async ({ label, path, probe }) => {
      try {
        const fs = await statfs(probe);
        return {
          label,
          path,
          device: devices.get(path) ?? null,
          total: fs.blocks * fs.bsize,
          used: (fs.blocks - fs.bfree) * fs.bsize,
        };
      } catch {
        return { label, path, device: devices.get(path) ?? null, total: 0, used: 0 };
      }
    }),
  );
}

export function createDiskCollector(): () => Promise<DiskStats[]> {
  let previous = new Map<string, Counters>();
  let previousAt = 0;

  return async () => {
    const now = performance.now();
    const elapsedSec = previousAt ? (now - previousAt) / 1000 : 0;
    previousAt = now;

    const text = (await readText(`${HOST_PROC}/diskstats`)) ?? "";
    const current = new Map<string, Counters>();
    for (const line of text.split("\n")) {
      const fields = line.trim().split(/\s+/);
      const name = fields[2];
      if (!name || !WHOLE_DISK.test(name)) continue;
      const value = (index: number): number => Number(fields[index] ?? 0);
      current.set(name, { reads: value(3), readSectors: value(5), writes: value(7), writeSectors: value(9), ioMs: value(12) });
    }

    const [mounts, temps] = await Promise.all([hostMounts(), diskTemperatures()]);
    const mountsByDisk = new Map<string, string[]>();
    for (const [path, device] of mounts) {
      for (const disk of await disksBehind(device)) {
        mountsByDisk.set(disk, [...(mountsByDisk.get(disk) ?? []), path]);
      }
    }

    const disks = await Promise.all(
      [...current].map(async ([name, counters]) => {
        const before = previous.get(name);
        const rate = (key: keyof Counters): number =>
          before && elapsedSec > 0 ? Math.max(0, (counters[key] - before[key]) / elapsedSec) : 0;
        const device = await resolvePath(`${HOST_SYS}/block/${name}/device`);

        return {
          name,
          model: (await readText(`${HOST_SYS}/block/${name}/device/model`))?.trim() || null,
          sizeBytes: ((await readNumber(`${HOST_SYS}/block/${name}/size`)) ?? 0) * SECTOR_BYTES,
          readBps: rate("readSectors") * SECTOR_BYTES,
          writeBps: rate("writeSectors") * SECTOR_BYTES,
          readIops: rate("reads"),
          writeIops: rate("writes"),
          busy: Math.min(1, rate("ioMs") / 1000),
          tempC: device ? (temps.get(device) ?? null) : null,
          mounts: (mountsByDisk.get(name) ?? []).sort(),
        };
      }),
    );

    previous = current;
    return disks.sort((a, b) => a.name.localeCompare(b.name));
  };
}
