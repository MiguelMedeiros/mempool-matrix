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

export type TransactionDetail = {
  txid: string;
  fee: number;
  vsize: number;
  value: number;
  feeRate: number;
  inputs: number;
  outputs: number;
  rbf: boolean;
  confirmed: boolean;
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

export function normalizeTransactionDetail(raw: Record<string, unknown>): TransactionDetail {
  const vin = Array.isArray(raw.vin) ? raw.vin as Array<Record<string, unknown>> : [];
  const vout = Array.isArray(raw.vout) ? raw.vout as Array<Record<string, unknown>> : [];
  const fee = safeNumber(raw.fee);
  const weight = Math.max(4, safeNumber(raw.weight));
  const vsize = Math.ceil(weight / 4);
  const status = raw.status && typeof raw.status === "object"
    ? raw.status as Record<string, unknown>
    : {};
  return {
    txid: typeof raw.txid === "string" ? raw.txid : "",
    fee,
    vsize,
    value: vout.reduce((sum, output) => sum + safeNumber(output.value), 0),
    feeRate: Math.round((fee / vsize) * 10) / 10,
    inputs: vin.length,
    outputs: vout.length,
    rbf: vin.some((input) => safeNumber(input.sequence) < 0xfffffffe),
    confirmed: status.confirmed === true,
  };
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
