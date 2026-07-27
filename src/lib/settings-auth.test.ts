import { afterEach, describe, expect, it } from "vitest";
import { isSettingsRequestAuthorized } from "./settings-auth";

const originalToken = process.env.MEMPOOL_SETTINGS_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.MEMPOOL_SETTINGS_TOKEN;
  else process.env.MEMPOOL_SETTINGS_TOKEN = originalToken;
});

describe("settings bearer authorization", () => {
  it("allows trusted-network mode when no token is configured", () => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings"))).toBe(true);
  });

  it("requires an exact bearer token when configured", () => {
    process.env.MEMPOOL_SETTINGS_TOKEN = "administrative-secret";
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings"))).toBe(false);
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings", {
      headers: { Authorization: "Bearer wrong" },
    }))).toBe(false);
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings", {
      headers: { Authorization: "Bearer administrative-secret" },
    }))).toBe(true);
  });
});
