import { createHash, timingSafeEqual } from "node:crypto";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const RATE_LIMIT_MAX_ENTRIES = 1_024;

type RateEntry = {
  count: number;
  resetAt: number;
};

const authGlobal = globalThis as typeof globalThis & {
  __mempoolMatrixSettingsRateLimits?: Map<string, RateEntry>;
};

export type SettingsAccess = "authorized" | "unauthorized" | "read-only";

export function getSettingsAccess(request: Request): SettingsAccess {
  const expected = process.env.MEMPOOL_SETTINGS_TOKEN;
  if (!expected) {
    return process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS === "true"
      ? "authorized"
      : "read-only";
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return "unauthorized";
  const received = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest) ? "authorized" : "unauthorized";
}

export function isSettingsRequestAuthorized(request: Request): boolean {
  return getSettingsAccess(request) === "authorized";
}

export function isSettingsTestRateLimited(
  request: Request,
  now = Date.now(),
): boolean {
  const rates = authGlobal.__mempoolMatrixSettingsRateLimits
    ?? new Map<string, RateEntry>();
  authGlobal.__mempoolMatrixSettingsRateLimits = rates;

  pruneExpiredRates(rates, now);
  const key = settingsRateLimitKey(request);
  const current = rates.get(key);
  if (!current || current.resetAt <= now) {
    if (rates.size >= RATE_LIMIT_MAX_ENTRIES) rates.delete(rates.keys().next().value as string);
    rates.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  rates.delete(key);
  rates.set(key, current);
  return current.count > RATE_LIMIT_MAX_REQUESTS;
}

export function settingsTestRateLimitResponse(request: Request): Response | null {
  if (!isSettingsTestRateLimited(request)) return null;
  return Response.json(
    { ok: false, error: "rate-limited", message: "Too many connection tests. Try again shortly." },
    {
      status: 429,
      headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "60" },
    },
  );
}

function settingsRateLimitKey(request: Request): string {
  if (process.env.MEMPOOL_TRUST_PROXY !== "true") return "direct-client";
  // Trust only the hop appended by the explicitly configured reverse proxy.
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) || request.headers.get("x-real-ip")?.trim() || "proxy-client-unknown";
}

function pruneExpiredRates(rates: Map<string, RateEntry>, now: number): void {
  for (const [key, entry] of rates) if (entry.resetAt <= now) rates.delete(key);
}

export function clearSettingsRateLimits(): void {
  authGlobal.__mempoolMatrixSettingsRateLimits = new Map();
}

export function getSettingsRateLimitSize(): number {
  return authGlobal.__mempoolMatrixSettingsRateLimits?.size ?? 0;
}
