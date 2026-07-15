import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MempoolHistoryPoint } from "./history";
import { appendHistoryPoint, pruneHistory, readHistoryPoints } from "./history-store";

const directories: string[] = [];

const basePoint: MempoolHistoryPoint = {
  fetchedAt: "2026-07-15T00:00:00.000Z",
  transactions: 10_000,
  vsize: 8_000_000,
  totalFee: 500_000,
  fastestFee: 8,
  halfHourFee: 6,
  hourFee: 4,
  economyFee: 2,
  minimumFee: 1,
  blockHeight: 958_000,
  blockTxCount: 3_500,
  blockSize: 1_500_000,
  blockTimestamp: 1_783_000_000,
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("history store", () => {
  it("appends daily JSONL points and reads a bounded time range", async () => {
    const directory = await temporaryDirectory();
    const points = [
      { ...basePoint, fetchedAt: "2026-07-14T23:59:00.000Z", transactions: 9_900 },
      basePoint,
      { ...basePoint, fetchedAt: "2026-07-15T00:01:00.000Z", transactions: 10_100 },
    ];
    for (const point of points) await appendHistoryPoint(point, directory);

    const result = await readHistoryPoints({
      from: Date.parse("2026-07-15T00:00:00.000Z"),
      to: Date.parse("2026-07-15T00:02:00.000Z"),
      limit: 100,
      directory,
    });

    expect(result.map((point) => point.transactions)).toEqual([10_000, 10_100]);
    expect(await readdir(directory)).toEqual(["2026-07-14.jsonl", "2026-07-15.jsonl"]);
  });

  it("removes daily files outside the retention window", async () => {
    const directory = await temporaryDirectory();
    await appendHistoryPoint({ ...basePoint, fetchedAt: "2026-07-10T12:00:00.000Z" }, directory);
    await appendHistoryPoint({ ...basePoint, fetchedAt: "2026-07-14T12:00:00.000Z" }, directory);
    await appendHistoryPoint({ ...basePoint, fetchedAt: "2026-07-15T12:00:00.000Z" }, directory);

    await pruneHistory(2, directory, Date.parse("2026-07-15T12:00:00.000Z"));

    expect(await readdir(directory)).toEqual(["2026-07-14.jsonl", "2026-07-15.jsonl"]);
  });

  it("returns an empty history when the storage directory does not exist", async () => {
    const directory = path.join(tmpdir(), `missing-history-${Date.now()}`);
    await expect(readHistoryPoints({
      from: 0,
      to: Date.now(),
      limit: 100,
      directory,
    })).resolves.toEqual([]);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "mempool-history-"));
  directories.push(directory);
  return directory;
}
