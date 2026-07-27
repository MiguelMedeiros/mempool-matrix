"use client";

import { useCallback, useEffect, useState } from "react";
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

const TOKEN_STORAGE_KEY = "mempool-matrix-settings-token";

export function useDataSourceSettings() {
  const [status, setStatus] = useState<DataSourceStatus | null>(null);
  const [token, setTokenState] = useState("");
  const [baseUrl, setBaseUrlState] = useState("");
  const [label, setLabelState] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"idle" | "testing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<DataSourceProbeResult | null>(null);
  const [testedKey, setTestedKey] = useState<string | null>(null);

  const hydrateStatus = useCallback((nextStatus: DataSourceStatus) => {
    setStatus(nextStatus);
    if (!nextStatus.configuration) return;
    const values = nextStatus.configuration;
    setBaseUrlState(values.baseUrl);
    setLabelState(values.label);
    commitDataSourceToStorage(window.localStorage, values);
  }, []);

  const refreshWithToken = useCallback(async (authorizationToken: string) => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/data-source", {
        cache: "no-store",
        headers: authorizationHeaders(authorizationToken),
      });
      if (!response.ok) throw new Error("Data-source settings are unavailable.");
      hydrateStatus(await response.json() as DataSourceStatus);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Data-source settings are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [hydrateStatus]);

  const refresh = useCallback(
    () => refreshWithToken(token),
    [refreshWithToken, token],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => {
      const storedValues = parseDataSourceFormValues(
        window.localStorage.getItem(DATA_SOURCE_FORM_STORAGE_KEY),
      );
      if (storedValues) {
        setBaseUrlState(storedValues.baseUrl);
        setLabelState(storedValues.label);
      } else window.localStorage.removeItem(DATA_SOURCE_FORM_STORAGE_KEY);
      const storedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
      setTokenState(storedToken);
      void refreshWithToken(storedToken);
    }, 0);
    return () => window.clearTimeout(initial);
  }, [refreshWithToken]);

  const setBaseUrl = useCallback((value: string) => {
    setBaseUrlState(value);
  }, []);

  const setLabel = useCallback((value: string) => {
    setLabelState(value);
  }, []);

  const setToken = useCallback((value: string) => {
    setTokenState(value);
    setError(null);
    setProbe(null);
    setTestedKey(null);
    if (value) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const testSource = useCallback(async (baseUrl: string, label: string) => {
    setAction("testing");
    setError(null);
    setProbe(null);
    setTestedKey(null);
    try {
      const response = await fetch("/api/settings/data-source/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authorizationHeaders(token),
        },
        body: JSON.stringify({ baseUrl, label: label || undefined }),
      });
      const result = await response.json() as DataSourceProbeResult | DataSourceErrorResponse;
      if (!response.ok || !result.ok) {
        throw new Error("message" in result ? result.message : "Connection test failed.");
      }
      setProbe(result);
      setTestedKey(sourceKey(baseUrl, label));
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection test failed.");
      return false;
    } finally {
      setAction("idle");
    }
  }, [refresh, token]);

  const saveSource = useCallback(async (baseUrl: string, label: string) => {
    if (testedKey !== sourceKey(baseUrl, label)) {
      setError("Test this exact source before saving.");
      return false;
    }
    setAction("saving");
    setError(null);
    try {
      const response = await fetch("/api/settings/data-source", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authorizationHeaders(token),
        },
        body: JSON.stringify({ baseUrl, label: label || undefined }),
      });
      const result = await response.json() as {
        ok?: boolean;
        status?: DataSourceStatus;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not save the data source.");
      }
      if (result.status) hydrateStatus(result.status);
      setProbe(null);
      setTestedKey(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the data source.");
      return false;
    } finally {
      setAction("idle");
    }
  }, [hydrateStatus, testedKey, token]);

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
    testSource,
    saveSource,
    refresh,
  };
}

function sourceKey(baseUrl: string, label: string): string {
  return `${baseUrl.trim()}\n${label.trim()}`;
}

function authorizationHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type DataSourceSettingsController = ReturnType<typeof useDataSourceSettings>;
