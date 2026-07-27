export type DataSourceOrigin = "file" | "env" | "default";

export type DataSourceStatus = {
  type: "mempool-api";
  active: boolean;
  label: string;
  host: string;
  pathPrefix: string;
  source: DataSourceOrigin;
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  tokenRequired: boolean;
  readOnly: boolean;
  canConfigure: boolean;
  configuration?: {
    baseUrl: string;
    label: string;
  };
};

export type DataSourceProbeResult = {
  ok: true;
  latencyMs: number;
  checks: {
    mempoolRecent: true;
    mempoolStats: true;
    feesRecommended: true;
    blocks: true;
  };
  summary: {
    transactionCount: number;
    blockHeight: number;
    fastestFee: number;
  };
};

export type DataSourceErrorResponse = {
  ok: false;
  error: string;
  message: string;
};
