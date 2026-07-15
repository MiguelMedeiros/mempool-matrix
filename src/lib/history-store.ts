import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  downsampleHistoryPoints,
  parseHistoryPoint,
  type MempoolHistoryPoint,
} from "./history";

type HistoryQuery = {
  from: number;
  to: number;
  limit: number;
  directory?: string;
};

const HISTORY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export function getHistoryDirectory(): string {
  return process.env.MEMPOOL_HISTORY_DIR
    ?? "/tmp/mempool-matrix-history";
}

export function getHistorySampleInterval(): number {
  return parseBoundedInteger(process.env.MEMPOOL_HISTORY_INTERVAL_MS, 60_000, 15_000, 3_600_000);
}

export function getHistoryRetentionDays(): number {
  return parseBoundedInteger(process.env.MEMPOOL_HISTORY_RETENTION_DAYS, 30, 1, 365);
}

export async function appendHistoryPoint(
  point: MempoolHistoryPoint,
  directory = getHistoryDirectory(),
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const filename = `${point.fetchedAt.slice(0, 10)}.jsonl`;
  await appendFile(
    path.join(/*turbopackIgnore: true*/ directory, filename),
    `${JSON.stringify(point)}\n`,
    "utf8",
  );
}

export async function readHistoryPoints({
  from,
  to,
  limit,
  directory = getHistoryDirectory(),
}: HistoryQuery): Promise<MempoolHistoryPoint[]> {
  const entries = await historyFiles(directory);
  const fromDate = new Date(from).toISOString().slice(0, 10);
  const toDate = new Date(to).toISOString().slice(0, 10);
  const relevant = entries.filter((filename) => {
    const date = filename.slice(0, 10);
    return date >= fromDate && date <= toDate;
  });

  const batches = await Promise.all(relevant.map(async (filename) => {
    try {
      const contents = await readFile(
        path.join(/*turbopackIgnore: true*/ directory, filename),
        "utf8",
      );
      return contents
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return parseHistoryPoint(JSON.parse(line));
          } catch {
            return null;
          }
        })
        .filter((point): point is MempoolHistoryPoint => Boolean(point));
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }));

  const points = batches
    .flat()
    .filter((point) => {
      const timestamp = Date.parse(point.fetchedAt);
      return timestamp >= from && timestamp <= to;
    })
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));

  return downsampleHistoryPoints(points, limit);
}

export async function pruneHistory(
  retentionDays = getHistoryRetentionDays(),
  directory = getHistoryDirectory(),
  now = Date.now(),
): Promise<void> {
  const entries = await historyFiles(directory);
  const cutoffDate = new Date(now - Math.max(1, retentionDays) * DAY_MILLISECONDS)
    .toISOString()
    .slice(0, 10);

  await Promise.all(entries
    .filter((filename) => filename.slice(0, 10) < cutoffDate)
    .map(async (filename) => {
      try {
        await unlink(path.join(/*turbopackIgnore: true*/ directory, filename));
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }));
}

async function historyFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(/*turbopackIgnore: true*/ directory))
      .filter((filename) => HISTORY_FILE.test(filename))
      .sort();
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
