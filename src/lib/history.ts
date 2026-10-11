import type { History, Points } from "../shared/types";

export class HistoryStore {
  private readonly series = new Map<string, number[]>();

  constructor(private readonly size: number) {}

  push(points: Points): void {
    for (const [key, value] of Object.entries(points)) {
      const values = this.series.get(key) ?? [];
      values.push(value);
      if (values.length > this.size) values.shift();
      this.series.set(key, values);
    }
  }

  toJSON(): History {
    return Object.fromEntries(this.series);
  }
}
