import type { CpuStats } from "../shared/types";
import { HOST_PROC, HOST_SYS, listDir, readNumber, readText } from "../lib/host";

interface Times {
  idle: number;
  total: number;
}

function parseTimes(line: string): Times {
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = fields;
  return { idle: idle + iowait, total: user + nice + system + idle + iowait + irq + softirq + steal };
}

function usage(previous: Times | undefined, current: Times): number {
  if (!previous) return 0;
  const total = current.total - previous.total;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (current.idle - previous.idle) / total));
}

export function createCpuCollector(): () => Promise<CpuStats> {
  let previous: Times[] = [];
  let model = "";

  return async () => {
    if (!model) {
      const cpuinfo = (await readText(`${HOST_PROC}/cpuinfo`)) ?? "";
      model = /model name\s*:\s*(.+)/.exec(cpuinfo)?.[1]?.replace(/\(R\)|\(TM\)|CPU @.*/g, "").trim() ?? "cpu";
    }

    const stat = (await readText(`${HOST_PROC}/stat`)) ?? "";
    const current = stat
      .split("\n")
      .filter((line) => /^cpu\d*\s/.test(line))
      .map(parseTimes);
    const [total, ...cores] = current.map((times, index) => usage(previous[index], times));
    previous = current;

    const cpuDirs = (await listDir(`${HOST_SYS}/devices/system/cpu`)).filter((name) => /^cpu\d+$/.test(name));
    const freqs = await Promise.all(
      cpuDirs.map((dir) => readNumber(`${HOST_SYS}/devices/system/cpu/${dir}/cpufreq/scaling_cur_freq`)),
    );
    const known = freqs.filter((freq): freq is number => freq !== null);
    const freqMhz = known.length ? known.reduce((sum, freq) => sum + freq, 0) / known.length / 1000 : null;

    const loadavg = ((await readText(`${HOST_PROC}/loadavg`)) ?? "0 0 0").split(" ").map(Number);

    return {
      model,
      usage: total ?? 0,
      cores,
      freqMhz,
      load: [loadavg[0] ?? 0, loadavg[1] ?? 0, loadavg[2] ?? 0],
    };
  };
}
