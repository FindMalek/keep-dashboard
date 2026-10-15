/** Minutes a check wasn't fully up, joined into runs: [{ from, to }] in seconds, `to` the end of the last minute. */
export function outages(minutes: { ts: number; avg: number }[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  for (const minute of minutes) {
    if (minute.avg >= 0.999) continue;
    const last = runs.at(-1);
    if (last && last.to === minute.ts) last.to = minute.ts + 60;
    else runs.push({ from: minute.ts, to: minute.ts + 60 });
  }
  return runs;
}

export function clockTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
