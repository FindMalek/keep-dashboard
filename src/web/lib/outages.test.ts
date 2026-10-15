import { expect, test } from "bun:test";
import { outages } from "./outages";

test("down minutes join into runs; a fully up minute splits them", () => {
  const at = (minute: number, avg: number) => ({ ts: 1_000_000 + minute * 60, avg });
  expect(outages([at(0, 1), at(1, 0), at(2, 0.5), at(3, 1), at(4, 0), at(5, 1)])).toEqual([
    { from: 1_000_060, to: 1_000_180 },
    { from: 1_000_240, to: 1_000_300 },
  ]);
  expect(outages([at(0, 1), at(1, 1)])).toEqual([]);
});
