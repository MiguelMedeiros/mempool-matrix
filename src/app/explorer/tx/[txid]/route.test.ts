import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import { GET } from "./route";

const txid = "ab".repeat(32);
const originalExplorerPublicUrl = process.env.EXPLORER_PUBLIC_URL;

async function redirectDestination(requestTxid = txid): Promise<string> {
  try {
    await GET(
      new Request(`http://localhost/explorer/tx/${requestTxid}`),
      { params: Promise.resolve({ txid: requestTxid }) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("redirect:")) return message.slice("redirect:".length);
    throw error;
  }
  throw new Error("Expected redirect");
}

beforeEach(() => {
  delete process.env.EXPLORER_PUBLIC_URL;
});

afterEach(() => {
  if (originalExplorerPublicUrl === undefined) delete process.env.EXPLORER_PUBLIC_URL;
  else process.env.EXPLORER_PUBLIC_URL = originalExplorerPublicUrl;
  redirect.mockClear();
});

describe("public transaction explorer redirect", () => {
  it("defaults to the public mempool.space explorer", async () => {
    await expect(redirectDestination()).resolves.toBe(`https://mempool.space/tx/${txid}`);
  });

  it("uses a generic configured explorer and removes trailing slashes", async () => {
    process.env.EXPLORER_PUBLIC_URL = "https://explorer.example///";
    await expect(redirectDestination()).resolves.toBe(`https://explorer.example/tx/${txid}`);
  });

  it.each([
    ["an empty value", ""],
    ["a malformed URL", "not a URL"],
    ["a non-HTTP(S) protocol", "ftp://explorer.example"],
  ])("falls back to mempool.space for %s", async (_label, configuredUrl) => {
    process.env.EXPLORER_PUBLIC_URL = configuredUrl;

    await expect(redirectDestination()).resolves.toBe(`https://mempool.space/tx/${txid}`);
  });

  it("rejects an unsafe transaction path", async () => {
    await expect(redirectDestination("../settings")).resolves.toBe("http://localhost/");
  });
});
