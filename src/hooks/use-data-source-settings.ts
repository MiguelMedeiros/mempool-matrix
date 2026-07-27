"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DataSourceErrorResponse,
  DataSourceProbeResult,
  DataSourceStatus,
} from "@/lib/data-source-types";
import {
  commitDataSourceToStorage,
  DATA_SOURCE_FORM_STORAGE_KEY,
  parseDataSourceFormValues,
} from "@/lib/data-source-persistence";
import {
  applyUnlockStatus,
  invalidateSettingsStatus,
  isCurrentSettingsRequest,
  settingsAuthorizationHeaders,
  type SettingsRequestIdentity,
} from "@/lib/settings-ui";

const TOKEN_STORAGE_KEY = "mempool-matrix-settings-token";

export function useDataSourceSettings() {
  const [status, setStatus] = useState<DataSourceStatus | null>(null);
  const statusRef = useRef<DataSourceStatus | null>(null);
  const [token, setTokenState] = useState("");
  const tokenRef = useRef("");
  const [baseUrl, setBaseUrlState] = useState("");
  const [label, setLabelState] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"idle" | "testing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<DataSourceProbeResult | null>(null);
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const generationRef = useRef(0);
  const statusRequestRef = useRef(0);
  const statusAbortRef = useRef<AbortController | null>(null);
  const pendingControllersRef = useRef(new Set<AbortController>());

  const currentIdentity = useCallback((): SettingsRequestIdentity => ({
    generation: generationRef.current,
    token: tokenRef.current,
  }), []);

  const requestIsCurrent = useCallback((identity: SettingsRequestIdentity) => (
    isCurrentSettingsRequest(identity, currentIdentity())
  ), [currentIdentity]);

  const createController = useCallback(() => {
    const controller = new AbortController();
    pendingControllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseController = useCallback((controller: AbortController) => {
    pendingControllersRef.current.delete(controller);
  }, []);

  const hydrateStatus = useCallback((nextStatus: DataSourceStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    if (!nextStatus.configuration) return;
    const values = nextStatus.configuration;
    setBaseUrlState(values.baseUrl);
    setLabelState(values.label);
    commitDataSourceToStorage(window.localStorage, values);
  }, []);

  const refreshWithToken = useCallback(async (authorizationToken: string, unlocking = false) => {
    const identity = currentIdentity();
    const requestId = statusRequestRef.current + 1;
    statusRequestRef.current = requestId;
    statusAbortRef.current?.abort();
    const controller = createController();
    statusAbortRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/settings/data-source", {
        cache: "no-store",
        headers: settingsAuthorizationHeaders(authorizationToken),
        signal: controller.signal,
      });
      if (!requestIsCurrent(identity) || requestId !== statusRequestRef.current) return false;
      if (!response.ok) throw new Error("Data-source settings are unavailable.");
      const nextStatus = await response.json() as DataSourceStatus;
      if (!requestIsCurrent(identity) || requestId !== statusRequestRef.current) return false;
      if (unlocking) {
        const transition = applyUnlockStatus(statusRef.current ?? nextStatus, nextStatus);
        if (!transition.ok) {
          window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          setError(transition.error);
          return false;
        }
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, authorizationToken);
      }
      hydrateStatus(nextStatus);
      setError(null);
      return true;
    } catch (reason) {
      if (isAbortError(reason) || !requestIsCurrent(identity) || requestId !== statusRequestRef.current) return false;
      setError(reason instanceof Error ? reason.message : "Data-source settings are unavailable.");
      return false;
    } finally {
      releaseController(controller);
      if (statusAbortRef.current === controller) statusAbortRef.current = null;
      if (requestIsCurrent(identity) && requestId === statusRequestRef.current) setLoading(false);
    }
  }, [createController, currentIdentity, hydrateStatus, releaseController, requestIsCurrent]);

  const refresh = useCallback(
    () => refreshWithToken(token),
    [refreshWithToken, token],
  );

  useEffect(() => {
    const pendingControllers = pendingControllersRef.current;
    const initial = window.setTimeout(async () => {
      const storedValues = parseDataSourceFormValues(
        window.localStorage.getItem(DATA_SOURCE_FORM_STORAGE_KEY),
      );
      if (storedValues) {
        setBaseUrlState(storedValues.baseUrl);
        setLabelState(storedValues.label);
      } else window.localStorage.removeItem(DATA_SOURCE_FORM_STORAGE_KEY);
      const storedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
      tokenRef.current = storedToken;
      generationRef.current += 1;
      setTokenState(storedToken);
      const initialIdentity = currentIdentity();
      await refreshWithToken("");
      if (storedToken && requestIsCurrent(initialIdentity)) {
        await refreshWithToken(storedToken, true);
      }
    }, 0);
    return () => {
      window.clearTimeout(initial);
      generationRef.current += 1;
      for (const controller of pendingControllers) controller.abort();
      pendingControllers.clear();
    };
  }, [currentIdentity, refreshWithToken, requestIsCurrent]);

  const setBaseUrl = useCallback((value: string) => {
    setBaseUrlState(value);
  }, []);

  const setLabel = useCallback((value: string) => {
    setLabelState(value);
  }, []);

  const setToken = useCallback((value: string) => {
    generationRef.current += 1;
    tokenRef.current = value;
    statusRequestRef.current += 1;
    for (const controller of pendingControllersRef.current) controller.abort();
    pendingControllersRef.current.clear();
    statusAbortRef.current = null;
    setTokenState(value);
    const invalidatedStatus = invalidateSettingsStatus(statusRef.current);
    statusRef.current = invalidatedStatus;
    setStatus(invalidatedStatus);
    setLoading(false);
    setAction("idle");
    setError(null);
    setProbe(null);
    setTestedKey(null);
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const unlockSettings = useCallback(
    () => refreshWithToken(token, true),
    [refreshWithToken, token],
  );

  const testSource = useCallback(async (baseUrl: string, label: string) => {
    const identity = currentIdentity();
    const authorizationToken = tokenRef.current;
    const controller = createController();
    setAction("testing");
    setError(null);
    setProbe(null);
    setTestedKey(null);
    try {
      const response = await fetch("/api/settings/data-source/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...settingsAuthorizationHeaders(authorizationToken),
        },
        body: JSON.stringify({ baseUrl, label: label || undefined }),
        signal: controller.signal,
      });
      const result = await response.json() as DataSourceProbeResult | DataSourceErrorResponse;
      if (!requestIsCurrent(identity)) return false;
      if (!response.ok || !result.ok) {
        throw new Error("message" in result ? result.message : "Connection test failed.");
      }
      setProbe(result);
      setTestedKey(sourceKey(baseUrl, label));
      await refreshWithToken(authorizationToken);
      return true;
    } catch (reason) {
      if (isAbortError(reason) || !requestIsCurrent(identity)) return false;
      setError(reason instanceof Error ? reason.message : "Connection test failed.");
      return false;
    } finally {
      releaseController(controller);
      if (requestIsCurrent(identity)) setAction("idle");
    }
  }, [createController, currentIdentity, refreshWithToken, releaseController, requestIsCurrent]);

  const saveSource = useCallback(async (baseUrl: string, label: string) => {
    if (testedKey !== sourceKey(baseUrl, label)) {
      setError("Test this exact source before saving.");
      return false;
    }
    const identity = currentIdentity();
    const authorizationToken = tokenRef.current;
    const controller = createController();
    setAction("saving");
    setError(null);
    try {
      const response = await fetch("/api/settings/data-source", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...settingsAuthorizationHeaders(authorizationToken),
        },
        body: JSON.stringify({ baseUrl, label: label || undefined }),
        signal: controller.signal,
      });
      const result = await response.json() as {
        ok?: boolean;
        status?: DataSourceStatus;
        message?: string;
      };
      if (!requestIsCurrent(identity)) return false;
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not save the data source.");
      }
      if (result.status) hydrateStatus(result.status);
      setProbe(null);
      setTestedKey(null);
      return true;
    } catch (reason) {
      if (isAbortError(reason) || !requestIsCurrent(identity)) return false;
      setError(reason instanceof Error ? reason.message : "Could not save the data source.");
      return false;
    } finally {
      releaseController(controller);
      if (requestIsCurrent(identity)) setAction("idle");
    }
  }, [createController, currentIdentity, hydrateStatus, releaseController, requestIsCurrent, testedKey]);

  return {
    status,
    token,
    baseUrl,
    label,
    loading,
    action,
    error,
    probe,
    canSave: (baseUrl: string, label: string) => testedKey === sourceKey(baseUrl, label),
    setBaseUrl,
    setLabel,
    setToken,
    unlockSettings,
    testSource,
    saveSource,
    refresh,
  };
}

function sourceKey(baseUrl: string, label: string): string {
  return `${baseUrl.trim()}\n${label.trim()}`;
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "AbortError";
}

export type DataSourceSettingsController = ReturnType<typeof useDataSourceSettings>;
