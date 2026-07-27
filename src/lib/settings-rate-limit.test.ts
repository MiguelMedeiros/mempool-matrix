import { afterEach, describe, expect, it } from "vitest";
import {
  clearSettingsRateLimits,
  getSettingsRateLimitSize,
  isSettingsTestRateLimited,
} from "./settings-auth";

const originalTrustProxy = process.env.MEMPOOL_TRUST_PROXY;
afterEach(() => {
  clearSettingsRateLimits();
  if (originalTrustProxy === undefined) delete process.env.MEMPOOL_TRUST_PROXY;
  else process.env.MEMPOOL_TRUST_PROXY = originalTrustProxy;
});

describe("settings probe rate limit", () => {
  it("ignores spoofable forwarding headers by default", () => {
    delete process.env.MEMPOOL_TRUST_PROXY;
    for (let index = 0; index < 6; index += 1) {
      expect(isSettingsTestRateLimited(new Request("http://local", {
        headers: { "x-forwarded-for": `198.51.100.${index}` },
      }), 1_000)).toBe(false);
    }
    expect(isSettingsTestRateLimited(new Request("http://local", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    }), 1_000)).toBe(true);
  });

  it("trusts right-most forwarding identity only in explicit proxy mode", () => {
    process.env.MEMPOOL_TRUST_PROXY = "true";
    for (let index = 0; index < 6; index += 1) {
      expect(isSettingsTestRateLimited(new Request("http://local", {
        headers: { "x-forwarded-for": `spoof-${index}, 10.0.0.2` },
      }), 1_000)).toBe(false);
    }
    expect(isSettingsTestRateLimited(new Request("http://local", {
      headers: { "x-forwarded-for": "new-spoof, 10.0.0.2" },
    }), 1_000)).toBe(true);
  });

  it("expires entries and bounds memory", () => {
    process.env.MEMPOOL_TRUST_PROXY = "true";
    for (let index = 0; index < 1_100; index += 1) {
      isSettingsTestRateLimited(new Request("http://local", {
        headers: { "x-forwarded-for": `10.0.${Math.floor(index / 255)}.${index % 255}` },
      }), 1_000);
    }
    expect(getSettingsRateLimitSize()).toBeLessThanOrEqual(1_024);
    expect(isSettingsTestRateLimited(new Request("http://local"), 62_000)).toBe(false);
  });
});
