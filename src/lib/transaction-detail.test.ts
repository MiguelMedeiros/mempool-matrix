import { describe, expect, it } from "vitest";
import { normalizeTransactionDetail } from "./transaction-detail";

describe("transaction detail normalization", () => {
  it("preserves scripts, witness data, spend status and confirmation fields", () => {
    const detail = normalizeTransactionDetail({
      txid: "a".repeat(64),
      version: 2,
      locktime: 0,
      size: 222,
      weight: 561,
      fee: 338,
      adjustedVsize: 140.25,
      sigops: 1,
      effectiveFeePerVsize: 2.41,
      vin: [{
        is_coinbase: false,
        txid: "b".repeat(64),
        vout: 0,
        sequence: 0xfffffffd,
        prevout: {
          value: 20_000_000,
          scriptpubkey: "0014abcd",
          scriptpubkey_asm: "OP_0 OP_PUSHBYTES_20 abcd",
          scriptpubkey_address: "bc1qsource",
          scriptpubkey_type: "v0_p2wpkh",
        },
        scriptsig: "",
        scriptsig_asm: "",
        witness: ["signature", "public-key"],
      }],
      vout: [{
        value: 19_999_662,
        scriptpubkey: "5120abcd",
        scriptpubkey_asm: "OP_PUSHNUM_1 OP_PUSHBYTES_32 abcd",
        scriptpubkey_address: "bc1pdestination",
        scriptpubkey_type: "v1_p2tr",
      }],
      status: {
        confirmed: true,
        block_height: 958_094,
        block_hash: "c".repeat(64),
        block_time: 1_784_089_512,
      },
    }, [{
      spent: true,
      txid: "d".repeat(64),
      vin: 2,
      status: { confirmed: true, block_height: 958_100, block_time: 1_784_090_000 },
    }], "010000000001");

    expect(detail).toMatchObject({
      version: 2,
      size: 222,
      baseSize: 113,
      witnessSize: 109,
      weight: 561,
      vsize: 141,
      adjustedVsize: 140.25,
      sigops: 1,
      feeRate: 2.4,
      effectiveFeeRate: 2.4,
      inputValue: 20_000_000,
      outputValue: 19_999_662,
      rbf: true,
      hasWitness: true,
      confirmed: true,
      blockHeight: 958_094,
      blockHash: "c".repeat(64),
      rawHex: "010000000001",
    });
    expect(detail.vin[0]).toMatchObject({
      sequenceType: "rbf",
      prevout: { script: { type: "v0_p2wpkh", address: "bc1qsource" } },
    });
    expect(detail.vout[0]).toMatchObject({
      script: { type: "v1_p2tr", address: "bc1pdestination" },
      spend: { spent: true, txid: "d".repeat(64), vin: 2, confirmed: true },
    });
  });

  it("handles coinbase inputs without previous outputs", () => {
    const detail = normalizeTransactionDetail({
      txid: "e".repeat(64),
      version: 1,
      locktime: 0,
      size: 200,
      weight: 800,
      fee: 0,
      vin: [{ is_coinbase: true, sequence: 0xffffffff, scriptsig: "abcd" }],
      vout: [{ value: 312_500_000, scriptpubkey: "0014abcd", scriptpubkey_type: "v0_p2wpkh" }],
      status: { confirmed: true, block_height: 958_095, block_time: 1_784_090_100 },
    });

    expect(detail).toMatchObject({
      isCoinbase: true,
      inputValue: 0,
      outputValue: 312_500_000,
      rbf: false,
    });
    expect(detail.vin[0]).toMatchObject({
      isCoinbase: true,
      sequenceType: "final",
    });
    expect(detail.vin[0]).not.toHaveProperty("prevout");
  });

  it("distinguishes an unavailable outspend lookup from a known unspent output", () => {
    const raw = {
      txid: "f".repeat(64),
      size: 100,
      weight: 400,
      vin: [],
      vout: [{ value: 1_000 }],
      status: { confirmed: false },
    };

    const unavailable = normalizeTransactionDetail(raw, { spent: true }, "not-hex");
    const knownUnspent = normalizeTransactionDetail(raw, [{ spent: false }]);

    expect(unavailable.vout[0].spend).toEqual({ known: false, spent: false });
    expect(knownUnspent.vout[0].spend).toEqual({ known: true, spent: false });
    expect(unavailable.rawHex).toBe("");
  });
});
