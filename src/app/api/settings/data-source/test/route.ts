import { probeMempoolSource } from "@/lib/mempool-probe";
import { readLimitedJsonObject } from "@/lib/request-body";
import { recordMempoolSourceHealth } from "@/lib/runtime-config";
import { isSettingsRequestAuthorized, settingsTestRateLimitResponse } from "@/lib/settings-auth";
import { safeSourceFetch } from "@/lib/source-fetch";
import { SourceValidationError, validateMempoolSource } from "@/lib/source-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JSON_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY_BYTES = 4_096;

export async function POST(request: Request) {
  if (!isSettingsRequestAuthorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized", message: "Administrative token required." },
      { status: 401, headers: JSON_HEADERS },
    );
  }
  const rateLimitResponse = settingsTestRateLimitResponse(request);
  if (rateLimitResponse) return rateLimitResponse;

  let source: ReturnType<typeof validateMempoolSource> | undefined;
  try {
    const body = await readJsonBody(request);
    source = validateMempoolSource({
      baseUrl: body.baseUrl,
      label: body.label,
    });
    const result = await probeMempoolSource(safeSourceFetch, source);
    recordMempoolSourceHealth(source.baseUrl, true);
    return Response.json(result, { headers: JSON_HEADERS });
  } catch (error) {
    if (source) recordMempoolSourceHealth(source.baseUrl, false, "unavailable");
    if (error instanceof SourceValidationError) {
      return Response.json(
        { ok: false, error: error.code, message: error.message },
        { status: 422, headers: JSON_HEADERS },
      );
    }
    if (error instanceof RequestBodyError) {
      return Response.json(
        { ok: false, error: "invalid-request", message: error.message },
        { status: error.status, headers: JSON_HEADERS },
      );
    }
    return Response.json(
      { ok: false, error: "source-unavailable", message: "Mempool source unavailable." },
      { status: 502, headers: JSON_HEADERS },
    );
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const result = await readLimitedJsonObject(request, MAX_BODY_BYTES);
  if (!result.ok) throw new RequestBodyError(result.message, result.kind === "oversized" ? 413 : 400);
  return result.value;
}

class RequestBodyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
