import { afterEach, describe, expect, it } from "vitest";
import { getSettingsAccess, isSettingsRequestAuthorized } from "./settings-auth";

const originalToken = process.env.MEMPOOL_SETTINGS_TOKEN;
const originalAllowUnauthenticated = process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS;

afterEach(() => {
  if (originalToken === undefined) delete process.env.MEMPOOL_SETTINGS_TOKEN;
  else process.env.MEMPOOL_SETTINGS_TOKEN = originalToken;
  if (originalAllowUnauthenticated === undefined) delete process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS;
  else process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = originalAllowUnauthenticated;
});

describe("settings bearer authorization", () => {
  it("defaults to read-only when no token is configured", () => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    delete process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS;
    const request = new Request("http://localhost/api/settings");
    expect(getSettingsAccess(request)).toBe("read-only");
    expect(isSettingsRequestAuthorized(request)).toBe(false);
  });

  it("allows unauthenticated mutation only for an exact true opt-in", () => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    for (const value of ["TRUE", "1", " true", "true "]) {
      process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = value;
      expect(getSettingsAccess(new Request("http://localhost/api/settings"))).toBe("read-only");
    }
    process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = "true";
    expect(getSettingsAccess(new Request("http://localhost/api/settings"))).toBe("authorized");
  });

  it("requires an exact bearer token when configured even if the opt-in is enabled", () => {
    process.env.MEMPOOL_SETTINGS_TOKEN = "administrative-secret";
    process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = "true";
    expect(getSettingsAccess(new Request("http://localhost/api/settings"))).toBe("unauthorized");
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings", {
      headers: { Authorization: "Bearer wrong" },
    }))).toBe(false);
    expect(isSettingsRequestAuthorized(new Request("http://localhost/api/settings", {
      headers: { Authorization: "Bearer administrative-secret" },
    }))).toBe(true);
  });

  it("rejects wrong configured tokens regardless of their length", () => {
    process.env.MEMPOOL_SETTINGS_TOKEN = "administrative-secret";
    for (const received of ["x", "administrative-secre", "administrative-secret-extra"]) {
      expect(getSettingsAccess(new Request("http://localhost/api/settings", {
        headers: { Authorization: `Bearer ${received}` },
      }))).toBe("unauthorized");
    }
  });
});
