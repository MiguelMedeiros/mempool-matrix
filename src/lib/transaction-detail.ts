export type TransactionScript = {
  hex: string;
  asm: string;
  type: string;
  address?: string;
};

export type TransactionPrevout = {
  value: number;
  script: TransactionScript;
};

export type TransactionInput = {
  index: number;
  isCoinbase: boolean;
  txid?: string;
  vout?: number;
  sequence: number;
  sequenceType: "final" | "locktime" | "rbf";
  prevout?: TransactionPrevout;
  scriptSig: {
    hex: string;
    asm: string;
  };
  witness: string[];
  innerRedeemScriptAsm: string;
  innerWitnessScriptAsm: string;
};

export type TransactionOutputSpend = {
  known: boolean;
  spent: boolean;
  txid?: string;
  vin?: number;
  confirmed?: boolean;
  blockHeight?: number;
  blockTime?: number;
};

export type TransactionOutput = {
  index: number;
  value: number;
  script: TransactionScript;
  spend: TransactionOutputSpend;
};

export type TransactionDetail = {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  baseSize: number;
  witnessSize: number;
  weight: number;
  vsize: number;
  adjustedVsize?: number;
  sigops?: number;
  fee: number;
  feeRate: number;
  effectiveFeeRate?: number;
  inputValue: number;
  outputValue: number;
  value: number;
  inputs: number;
  outputs: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  rbf: boolean;
  isCoinbase: boolean;
  hasWitness: boolean;
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
  rawHex: string;
};

export function normalizeTransactionDetail(
  raw: Record<string, unknown>,
  rawOutspends: unknown = [],
  rawHex = "",
): TransactionDetail {
  const rawInputs = recordArray(raw.vin);
  const rawOutputs = recordArray(raw.vout);
  const outspends = Array.isArray(rawOutspends) ? rawOutspends : [];
  const vin = rawInputs.map(normalizeInput);
  const vout = rawOutputs.map((output, index) => normalizeOutput(output, outspends[index], index));
  const fee = safeNumber(raw.fee);
  const size = safeNumber(raw.size);
  const reportedWeight = safeNumber(raw.weight);
  const weight = reportedWeight > 0 ? reportedWeight : size * 4;
  const vsize = Math.max(1, Math.ceil(weight / 4));
  const baseSize = Math.max(0, Math.round((weight - size) / 3));
  const outputValue = vout.reduce((sum, output) => sum + output.value, 0);
  const inputValue = vin.reduce((sum, input) => sum + (input.prevout?.value ?? 0), 0);
  const status = raw.status && typeof raw.status === "object"
    ? raw.status as Record<string, unknown>
    : {};
  const adjustedVsize = optionalNumber(raw.adjustedVsize);
  const sigops = optionalNumber(raw.sigops);
  const effectiveFeeRate = optionalNumber(raw.effectiveFeePerVsize);

  return {
    txid: stringValue(raw.txid),
    version: safeNumber(raw.version),
    locktime: safeNumber(raw.locktime),
    size,
    baseSize,
    witnessSize: Math.max(0, size - baseSize),
    weight,
    vsize,
    ...(adjustedVsize !== undefined ? { adjustedVsize } : {}),
    ...(sigops !== undefined ? { sigops } : {}),
    fee,
    feeRate: roundRate(fee / vsize),
    ...(effectiveFeeRate !== undefined ? { effectiveFeeRate: roundRate(effectiveFeeRate) } : {}),
    inputValue,
    outputValue,
    value: outputValue,
    inputs: vin.length,
    outputs: vout.length,
    vin,
    vout,
    rbf: vin.some((input) => !input.isCoinbase && input.sequence < 0xfffffffe),
    isCoinbase: vin.some((input) => input.isCoinbase),
    hasWitness: vin.some((input) => input.witness.length > 0),
    confirmed: status.confirmed === true,
    ...(status.confirmed === true ? {
      blockHeight: safeNumber(status.block_height),
      blockHash: stringValue(status.block_hash),
      blockTime: safeNumber(status.block_time),
    } : {}),
    rawHex: /^[0-9a-f]+$/i.test(rawHex) ? rawHex.toLowerCase() : "",
  };
}

function normalizeInput(input: Record<string, unknown>, index: number): TransactionInput {
  const isCoinbase = input.is_coinbase === true;
  const prevout = input.prevout && typeof input.prevout === "object"
    ? input.prevout as Record<string, unknown>
    : null;
  const sequence = safeNumber(input.sequence);
  const txid = stringValue(input.txid);
  const vout = optionalNumber(input.vout);

  return {
    index,
    isCoinbase,
    ...(!isCoinbase && txid ? { txid } : {}),
    ...(!isCoinbase && vout !== undefined ? { vout } : {}),
    sequence,
    sequenceType: sequence < 0xfffffffe
      ? "rbf"
      : sequence === 0xfffffffe
        ? "locktime"
        : "final",
    ...(prevout ? {
      prevout: {
        value: safeNumber(prevout.value),
        script: normalizeScript(prevout),
      },
    } : {}),
    scriptSig: {
      hex: stringValue(input.scriptsig),
      asm: stringValue(input.scriptsig_asm),
    },
    witness: Array.isArray(input.witness)
      ? input.witness.filter((item): item is string => typeof item === "string")
      : [],
    innerRedeemScriptAsm: stringValue(input.inner_redeemscript_asm),
    innerWitnessScriptAsm: stringValue(input.inner_witnessscript_asm),
  };
}

function normalizeOutput(
  output: Record<string, unknown>,
  rawOutspend: unknown,
  index: number,
): TransactionOutput {
  return {
    index,
    value: safeNumber(output.value),
    script: normalizeScript(output),
    spend: normalizeOutspend(rawOutspend),
  };
}

function normalizeScript(raw: Record<string, unknown>): TransactionScript {
  const address = stringValue(raw.scriptpubkey_address);
  return {
    hex: stringValue(raw.scriptpubkey),
    asm: stringValue(raw.scriptpubkey_asm),
    type: stringValue(raw.scriptpubkey_type) || "unknown",
    ...(address ? { address } : {}),
  };
}

function normalizeOutspend(raw: unknown): TransactionOutputSpend {
  if (!raw || typeof raw !== "object") return { known: false, spent: false };
  const outspend = raw as Record<string, unknown>;
  const status = outspend.status && typeof outspend.status === "object"
    ? outspend.status as Record<string, unknown>
    : {};
  const txid = stringValue(outspend.txid);
  const vin = optionalNumber(outspend.vin);
  return {
    known: true,
    spent: outspend.spent === true,
    ...(txid ? { txid } : {}),
    ...(vin !== undefined ? { vin } : {}),
    ...(outspend.spent === true ? {
      confirmed: status.confirmed === true,
      ...(status.confirmed === true ? {
        blockHeight: safeNumber(status.block_height),
        blockTime: safeNumber(status.block_time),
      } : {}),
    } : {}),
  };
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function safeNumber(value: unknown): number {
  return optionalNumber(value) ?? 0;
}

function roundRate(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}
