import { getPublicDataSourceStatus, recordMempoolSourceHealth, saveRuntimeConfig } from "@/lib/runtime-config";
import { probeMempoolSource } from "@/lib/mempool-probe";
import { readLimitedJsonObject } from "@/lib/request-body";
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
  status: (canConfigure: boolean) => Promise<unknown>;
  validate: (body: Record<string, unknown>) => ValidatedMempoolSource;
  probe: (source: ValidatedMempoolSource) => Promise<unknown>;
  save: (source: ValidatedMempoolSource) => Promise<{ baseUrl: string; updatedAt: string }>;
  health: (baseUrl: string, active: boolean) => void;
};

const dependencies: Dependencies = {
  access: getSettingsAccess,
  rateLimit: settingsTestRateLimitResponse,
  status: getPublicDataSourceStatus,
  validate: (body) => validateMempoolSource({ baseUrl: body.baseUrl, label: body.label }),
  probe: (source) => probeMempoolSource(safeSourceFetch, source),
  save: (source) => saveRuntimeConfig(source),
  health: recordMempoolSourceHealth,
};

export function createDataSourceRouteHandlers(deps: Dependencies) {
  return {
    async GET(request: Request) {
      const canConfigure = deps.access(request) === "authorized";
      try {
        return Response.json(await deps.status(canConfigure), { headers: JSON_HEADERS });
      } catch {
        return Response.json({ error: "Settings unavailable" }, { status: 500, headers: JSON_HEADERS });
      }
    },
    async PUT(request: Request) {
      const access = deps.access(request);
      if (access === "read-only") {
        return jsonError(
          403,
          "settings-read-only",
          "Settings are read-only. Configure MEMPOOL_SETTINGS_TOKEN or explicitly enable trusted development access.",
        );
      }
      if (access === "unauthorized") return jsonError(401, "unauthorized", "Administrative token required.");
      // Authenticate first so unauthorized clients cannot consume the shared quota;
      // rate-limit before body parsing and the expensive source probe.
      const rateLimitResponse = deps.rateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      let source: ValidatedMempoolSource;
      try {
        source = deps.validate(await readJsonBody(request));
      } catch (error) {
        return settingsInputError(error);
      }
      try {
        await deps.probe(source);
      } catch {
        return jsonError(502, "source-unavailable", "Mempool source unavailable.");
      }
      try {
        const saved = await deps.save(source);
        deps.health(saved.baseUrl, true);
        return Response.json({ ok: true, status: await deps.status(true), effectiveAt: saved.updatedAt }, { headers: JSON_HEADERS });
      } catch {
        return jsonError(500, "settings-persistence-failed", "Could not persist data-source settings.");
      }
    },
  };
}

const handlers = createDataSourceRouteHandlers(dependencies);
export const GET = handlers.GET;
export const PUT = handlers.PUT;

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const result = await readLimitedJsonObject(request, MAX_BODY_BYTES);
  if (!result.ok) throw new RequestBodyError(result.message, result.kind === "oversized" ? 413 : 400);
  return result.value;
}

function settingsInputError(error: unknown): Response {
  if (error instanceof SourceValidationError) return jsonError(422, error.code, error.message);
  if (error instanceof RequestBodyError) return jsonError(error.status, "invalid-request", error.message);
  return jsonError(400, "invalid-request", "Invalid request.");
}
function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ ok: false, error, message }, { status, headers: JSON_HEADERS });
}
class RequestBodyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
