import { describe, expect, it } from "vitest";
import {
  applyUnlockStatus,
  invalidateSettingsStatus,
  isCurrentSettingsRequest,
  resolveInitialDialog,
  settingsAuthorizationHeaders,
} from "./settings-ui";

const publicStatus = { type: "mempool-api", canConfigure: false, tokenRequired: true, readOnly: false } as const;

describe("settings unlock state", () => {
  it("accepts an authenticated editable status", () => {
    const editable = { ...publicStatus, canConfigure: true, configuration: { baseUrl: "http://node/api", label: "node" } };
    expect(applyUnlockStatus(publicStatus, editable)).toEqual({ ok: true, status: editable });
  });

  it("keeps public status intact when the token did not unlock settings", () => {
    expect(applyUnlockStatus(publicStatus, publicStatus)).toEqual({
      ok: false,
      status: publicStatus,
      error: "Invalid settings token.",
    });
  });

  it("adds bearer authorization only for a non-empty token", () => {
    expect(settingsAuthorizationHeaders("")).toEqual({});
    expect(settingsAuthorizationHeaders("secret")).toEqual({ Authorization: "Bearer secret" });
  });

  it("invalidates editable authorization immediately when the token changes", () => {
    const editable = { ...publicStatus, canConfigure: true, configuration: { baseUrl: "http://node/api", label: "node" } };
    expect(invalidateSettingsStatus(editable)).toEqual({
      ...publicStatus,
      canConfigure: false,
      configuration: undefined,
    });
    expect(invalidateSettingsStatus(null)).toBeNull();
  });

  it("rejects results from an older generation or a changed token", () => {
    const current = { generation: 4, token: "token-b" };
    expect(isCurrentSettingsRequest(current, current)).toBe(true);
    expect(isCurrentSettingsRequest({ generation: 3, token: "token-b" }, current)).toBe(false);
    expect(isCurrentSettingsRequest({ generation: 4, token: "token-a" }, current)).toBe(false);
  });
});

describe("initial dialog selection", () => {
  it("gives settings precedence when both URL dialogs are requested", () => {
    expect(resolveInitialDialog(new URLSearchParams("search=1&settings=1"))).toBe("settings");
    expect(resolveInitialDialog(new URLSearchParams("search=1"))).toBe("search");
    expect(resolveInitialDialog(new URLSearchParams("settings=1"))).toBe("settings");
    expect(resolveInitialDialog(new URLSearchParams("search=0&settings=0"))).toBeNull();
  });
});
