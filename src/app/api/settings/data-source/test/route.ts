import { probeMempoolSource } from "@/lib/mempool-probe";
import { readLimitedJsonObject } from "@/lib/request-body";
import { recordMempoolSourceHealth } from "@/lib/runtime-config";
import { getSettingsAccess, settingsTestRateLimitResponse, type SettingsAccess } from "@/lib/settings-auth";
import { safeSourceFetch } from "@/lib/source-fetch";
import { SourceValidationError, validateMempoolSource, type ValidatedMempoolSource } from "@/lib/source-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JSON_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY_BYTES = 4_096;

type Dependencies = {
  access: (request: Request) => SettingsAccess;
  rateLimit: (request: Request) => Response | null;
  readBody: (request: Request) => Promise<Record<string, unknown>>;
  validate: (body: Record<string, unknown>) => ValidatedMempoolSource;
  probe: (source: ValidatedMempoolSource) => Promise<unknown>;
  health: (baseUrl: string, active: boolean, error?: string | null) => void;
};

const dependencies: Dependencies = {
  access: getSettingsAccess,
  rateLimit: settingsTestRateLimitResponse,
  readBody: readJsonBody,
  validate: (body) => validateMempoolSource({ baseUrl: body.baseUrl, label: body.label }),
  probe: (source) => probeMempoolSource(safeSourceFetch, source),
  health: recordMempoolSourceHealth,
};

export function createDataSourceTestHandler(deps: Dependencies) {
  return async function handleDataSourceTest(request: Request) {
    const access = deps.access(request);
    if (access === "read-only") {
      return jsonError(
        403,
        "settings-read-only",
        "Settings are read-only. Configure MEMPOOL_SETTINGS_TOKEN or explicitly enable trusted development access.",
      );
    }
    if (access === "unauthorized") return jsonError(401, "unauthorized", "Administrative token required.");

    const rateLimitResponse = deps.rateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    let source: ValidatedMempoolSource | undefined;
    try {
      source = deps.validate(await deps.readBody(request));
      const result = await deps.probe(source);
      deps.health(source.baseUrl, true);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      if (source) deps.health(source.baseUrl, false, "unavailable");
      if (error instanceof SourceValidationError) return jsonError(422, error.code, error.message);
      if (error instanceof RequestBodyError) return jsonError(error.status, "invalid-request", error.message);
      return jsonError(502, "source-unavailable", "Mempool source unavailable.");
    }
  };
}

export const POST = createDataSourceTestHandler(dependencies);

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const result = await readLimitedJsonObject(request, MAX_BODY_BYTES);
  if (!result.ok) throw new RequestBodyError(result.message, result.kind === "oversized" ? 413 : 400);
  return result.value;
}

function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ ok: false, error, message }, { status, headers: JSON_HEADERS });
}

class RequestBodyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
