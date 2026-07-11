export type MempoolTransaction = {
  txid: string;
  fee: number;
  vsize: number;
  value: number;
  feeRate: number;
};

export type MatrixDrop = MempoolTransaction & {
  x: number;
  y: number;
  speed: number;
  opacity: number;
  fontSize: number;
  trailLength: number;
};

type RawTransaction = Partial<Record<"txid" | "fee" | "vsize" | "value", unknown>>;

const TXID_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeTransaction(raw: RawTransaction): MempoolTransaction | null {
  if (typeof raw.txid !== "string" || !TXID_PATTERN.test(raw.txid)) return null;
  const fee = finiteNumber(raw.fee);
  const vsize = Math.max(1, finiteNumber(raw.vsize));
  const value = finiteNumber(raw.value);
  return {
    txid: raw.txid.toLowerCase(),
    fee,
    vsize,
    value,
    feeRate: Math.max(0, Math.min(10_000, Math.round(fee / vsize))),
  };
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function mergeTransactions(
  current: MempoolTransaction[],
  incoming: MempoolTransaction[],
  limit = 120,
): MempoolTransaction[] {
  const merged = new Map(current.map((transaction) => [transaction.txid, transaction]));
  for (const transaction of incoming) merged.delete(transaction.txid);
  for (const transaction of incoming) merged.set(transaction.txid, transaction);
  return Array.from(merged.values()).reverse().slice(0, limit);
}

export function shortTxid(txid: string, length = 20): string {
  if (txid.length <= length) return txid;
  const edge = Math.max(4, Math.floor(length / 2));
  return `${txid.slice(0, edge)}…${txid.slice(-edge)}`;
}

function hashNumber(value: string, offset: number): number {
  const sample = value.slice(offset, offset + 8).padEnd(8, "0");
  return Number.parseInt(sample, 16) / 0xffffffff;
}

export function createDrop(
  transaction: MempoolTransaction,
  width: number,
  height: number,
): MatrixDrop {
  const lanePadding = Math.min(24, width * 0.05);
  const availableWidth = Math.max(1, width - lanePadding * 2);
  const feeEnergy = Math.min(1, Math.log2(transaction.feeRate + 1) / 8);
  return {
    ...transaction,
    x: lanePadding + hashNumber(transaction.txid, 0) * availableWidth,
    y: -40 - hashNumber(transaction.txid, 8) * Math.max(100, height * 0.65),
    speed: 42 + feeEnergy * 96 + hashNumber(transaction.txid, 16) * 34,
    opacity: 0.38 + feeEnergy * 0.58,
    fontSize: width < 640 ? 10 + hashNumber(transaction.txid, 24) * 3 : 12 + hashNumber(transaction.txid, 24) * 5,
    trailLength: 2 + Math.floor(feeEnergy * 7),
  };
}
