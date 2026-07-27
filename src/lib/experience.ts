export { normalizeTransactionDetail, type TransactionDetail } from "./transaction-detail";

export type FeeRecommendations = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};

export type FeeTier = "low" | "medium" | "high" | "priority" | "extreme";
export type PressureLevel = "calm" | "active" | "heavy" | "critical";
export type VisualMode = "matrix" | "constellation" | "heatmap" | "race" | "ambient";
export type Highlight = "high-value" | "high-fee" | "consolidation" | "fan-out";

export type BlockSummary = {
  height: number;
  txCount: number;
  size: number;
  timestamp: number;
  id?: string;
};

export type ExperienceSnapshot = {
  fetchedAt: string;
  count: number;
  vsize: number;
  blockHeight: number;
};

const MODES: VisualMode[] = ["matrix", "constellation", "heatmap", "race", "ambient"];

export function getPressure(vsize: number): { label: PressureLevel; intensity: number } {
  if (vsize < 10_000_000) return { label: "calm", intensity: 0.15 };
  if (vsize < 50_000_000) return { label: "active", intensity: 0.45 };
  if (vsize < 100_000_000) return { label: "heavy", intensity: 0.75 };
  return { label: "critical", intensity: 1 };
}

export function classifyFee(rate: number, fees: FeeRecommendations): FeeTier {
  if (rate >= Math.max(fees.fastestFee * 5, 100)) return "extreme";
  if (rate >= fees.fastestFee) return "priority";
  if (rate >= fees.halfHourFee) return "high";
  if (rate >= fees.hourFee) return "medium";
  return "low";
}

export function detectBlockEvent(previousHeight: number, block: BlockSummary): BlockSummary | null {
  return block.height > previousHeight ? block : null;
}

export function blockAnimationProgress(startedAt: number, now: number, duration = 6_000): number {
  if (startedAt <= 0 || now < startedAt) return -1;
  const elapsed = now - startedAt;
  return elapsed < duration ? elapsed / duration : -1;
}

export function appendHistory(
  history: ExperienceSnapshot[],
  snapshot: ExperienceSnapshot,
  limit = 120,
): ExperienceSnapshot[] {
  return history.concat(snapshot).slice(-Math.max(1, limit));
}

export function snapshotRate(previous: ExperienceSnapshot, current: ExperienceSnapshot): number {
  const elapsedSeconds = (Date.parse(current.fetchedAt) - Date.parse(previous.fetchedAt)) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  return Math.max(0, Math.round(((current.count - previous.count) / elapsedSeconds) * 10) / 10);
}

export function detectHighlights(transaction: {
  value: number;
  feeRate: number;
  inputs: number;
  outputs: number;
}): Highlight[] {
  const highlights: Highlight[] = [];
  if (transaction.value >= 100_000_000) highlights.push("high-value");
  if (transaction.feeRate >= 100) highlights.push("high-fee");
  if (transaction.inputs >= 30) highlights.push("consolidation");
  if (transaction.outputs >= 50) highlights.push("fan-out");
  return highlights;
}

export function normalizeMode(value: unknown): VisualMode {
  return typeof value === "string" && MODES.includes(value as VisualMode)
    ? value as VisualMode
    : "matrix";
}

export type MatrixCommand = "rabbit" | "spoon" | "red-pill" | "blue-pill" | "zion";

export function parseMatrixCommand(value: string): MatrixCommand | null {
  const command = value.trim().toLowerCase().replace(/\s+/g, " ");
  return ({
    "follow the white rabbit": "rabbit",
    "there is no spoon": "spoon",
    "red pill": "red-pill",
    "blue pill": "blue-pill",
    zion: "zion",
  } as Record<string, MatrixCommand>)[command] ?? null;
}

export function parseTransactionSearch(value: string): string | null {
  const match = value.trim().match(/(?:^|[^0-9a-f])([0-9a-f]{64})(?:$|[^0-9a-f])/i);
  return match?.[1]?.toLowerCase() ?? null;
}
