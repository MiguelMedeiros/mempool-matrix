import type { DataSourceStatus } from "./data-source-types";

type UnlockStatus = Pick<DataSourceStatus, "canConfigure" | "configuration">;

export type SettingsRequestIdentity = {
  generation: number;
  token: string;
};

export function settingsAuthorizationHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function applyUnlockStatus<TCurrent extends UnlockStatus, TReceived extends UnlockStatus>(
  current: TCurrent,
  received: TReceived,
) {
  if (received.canConfigure && received.configuration) {
    return { ok: true as const, status: received };
  }
  return { ok: false as const, status: current, error: "Invalid settings token." };
}

export function invalidateSettingsStatus<T extends UnlockStatus>(status: T | null): T | null {
  return status ? { ...status, canConfigure: false, configuration: undefined } : null;
}

export function isCurrentSettingsRequest(
  request: SettingsRequestIdentity,
  current: SettingsRequestIdentity,
): boolean {
  return request.generation === current.generation && request.token === current.token;
}

export function resolveInitialDialog(
  params: Pick<URLSearchParams, "get">,
): "settings" | "search" | null {
  if (params.get("settings") === "1") return "settings";
  if (params.get("search") === "1") return "search";
  return null;
}
