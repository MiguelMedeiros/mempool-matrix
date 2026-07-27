import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataSourceOrigin, DataSourceStatus } from "./data-source-types";
import { validateMempoolSource } from "./source-validator";

export const SAFE_DEFAULT_MEMPOOL_API_URL = "https://mempool.space/api";
export const DEFAULT_MEMPOOL_CONFIG_PATH = "/data/runtime-config.json";

export type RuntimeConfigV1 = {
  version: 1;
  type: "mempool-api";
  baseUrl: string;
  label?: string;
  updatedAt: string;
};

export type ActiveMempoolSource = RuntimeConfigV1 & {
  source: DataSourceOrigin;
};

type ConfigCache = {
  path: string;
  fingerprint: string | null;
  source: ActiveMempoolSource;
};

type SourceHealth = {
  baseUrl: string;
  active: boolean;
  checkedAt: string;
  error: string | null;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __mempoolMatrixConfigCache?: ConfigCache;
  __mempoolMatrixSourceHealth?: SourceHealth;
};

export function getMempoolConfigPath(): string {
  return process.env.MEMPOOL_CONFIG_PATH?.trim() || DEFAULT_MEMPOOL_CONFIG_PATH;
}

export async function getActiveMempoolSource(
  configPath = getMempoolConfigPath(),
  envUrl = process.env.MEMPOOL_API_URL,
): Promise<ActiveMempoolSource> {
  const file = await readRuntimeConfig(configPath);
  if (file) return { ...file, source: "file" };

  const configuredEnvUrl = envUrl?.trim();
  let fallback = validateMempoolSource({ baseUrl: SAFE_DEFAULT_MEMPOOL_API_URL });
  let source: DataSourceOrigin = "default";
  if (configuredEnvUrl) {
    try {
      fallback = validateMempoolSource({ baseUrl: configuredEnvUrl });
      source = "env";
    } catch {
      // Invalid bootstrap configuration must not override the safe default.
    }
  }
  return {
    version: 1,
    type: "mempool-api",
    baseUrl: fallback.baseUrl,
    label: fallback.label,
    updatedAt: "",
    source,
  };
}

export async function getActiveMempoolBaseUrl(): Promise<string> {
  return (await getActiveMempoolSource()).baseUrl;
}

export async function saveRuntimeConfig(
  input: { baseUrl: unknown; label?: unknown },
  configPath = getMempoolConfigPath(),
  now = new Date(),
): Promise<RuntimeConfigV1> {
  const source = validateMempoolSource(input);
  const config: RuntimeConfigV1 = {
    version: 1,
    type: "mempool-api",
    baseUrl: source.baseUrl,
    ...(source.label ? { label: source.label } : {}),
    updatedAt: now.toISOString(),
  };
  const directory = path.dirname(configPath);
  const temporaryPath = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, configPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  runtimeGlobal.__mempoolMatrixConfigCache = undefined;
  runtimeGlobal.__mempoolMatrixSourceHealth = undefined;
  return config;
}

export async function getPublicDataSourceStatus(
  canConfigure: boolean,
  configPath = getMempoolConfigPath(),
): Promise<DataSourceStatus> {
  const source = await getActiveMempoolSource(configPath);
  const url = new URL(source.baseUrl);
  const health = runtimeGlobal.__mempoolMatrixSourceHealth;
  const matchingHealth = health?.baseUrl === source.baseUrl ? health : undefined;

  return {
    type: "mempool-api",
    active: matchingHealth?.active ?? false,
    label: source.label || url.hostname,
    host: url.host,
    pathPrefix: url.pathname,
    source: source.source,
    updatedAt: source.updatedAt || null,
    lastCheckedAt: matchingHealth?.checkedAt ?? null,
    lastError: matchingHealth?.error ?? null,
    tokenRequired: Boolean(process.env.MEMPOOL_SETTINGS_TOKEN),
    canConfigure,
    ...(canConfigure ? {
      configuration: {
        baseUrl: source.baseUrl,
        label: source.label ?? "",
      },
    } : {}),
  };
}

export function recordMempoolSourceHealth(
  baseUrl: string,
  active: boolean,
  error: string | null = null,
): void {
  runtimeGlobal.__mempoolMatrixSourceHealth = {
    baseUrl,
    active,
    checkedAt: new Date().toISOString(),
    error: error ? "Source unavailable" : null,
  };
}

export function clearRuntimeConfigCache(): void {
  runtimeGlobal.__mempoolMatrixConfigCache = undefined;
  runtimeGlobal.__mempoolMatrixSourceHealth = undefined;
}

async function readRuntimeConfig(configPath: string): Promise<RuntimeConfigV1 | null> {
  let fingerprint: string | null = null;
  try {
    const metadata = await stat(configPath);
    fingerprint = `${metadata.mtimeMs}:${metadata.size}`;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const cached = runtimeGlobal.__mempoolMatrixConfigCache;
  if (cached?.path === configPath && cached.fingerprint === fingerprint) {
    return cached.source.source === "file" ? stripSource(cached.source) : null;
  }
  if (fingerprint === null) {
    runtimeGlobal.__mempoolMatrixConfigCache = undefined;
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<RuntimeConfigV1>;
    if (
      parsed.version !== 1
      || parsed.type !== "mempool-api"
      || typeof parsed.updatedAt !== "string"
      || !Number.isFinite(Date.parse(parsed.updatedAt))
    ) {
      return null;
    }
    const validated = validateMempoolSource({
      baseUrl: parsed.baseUrl,
      label: parsed.label,
    });
    const source: ActiveMempoolSource = {
      version: 1,
      type: "mempool-api",
      baseUrl: validated.baseUrl,
      ...(validated.label ? { label: validated.label } : {}),
      updatedAt: parsed.updatedAt,
      source: "file",
    };
    runtimeGlobal.__mempoolMatrixConfigCache = {
      path: configPath,
      fingerprint,
      source,
    };
    return stripSource(source);
  } catch {
    return null;
  }
}

function stripSource(source: ActiveMempoolSource): RuntimeConfigV1 {
  return {
    version: source.version,
    type: source.type,
    baseUrl: source.baseUrl,
    ...(source.label ? { label: source.label } : {}),
    updatedAt: source.updatedAt,
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
