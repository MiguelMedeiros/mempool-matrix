import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { assertSafeResolvedAddresses, type ResolvedAddress } from "./source-validator";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
type Lookup = (hostname: string) => Promise<ResolvedAddress[]>;
type PinnedRequest = (url: URL, init: RequestInit, address: ResolvedAddress) => Promise<Response>;

export function createSafeSourceFetch(dependencies: { lookup?: Lookup; request?: PinnedRequest } = {}): typeof fetch {
  const lookup = dependencies.lookup ?? lookupAll;
  const request = dependencies.request ?? requestPinned;
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported source protocol");
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (init.signal?.aborted) throw init.signal.reason ?? new Error("Request aborted");
    const addresses = isIP(literal)
      ? [{ address: literal, family: isIP(literal) }]
      : await waitForLookup(lookup(literal), init.signal);
    assertSafeResolvedAddresses(addresses);
    return request(url, { ...init, redirect: "manual" }, addresses[0]);
  }) as typeof fetch;
}

export const safeSourceFetch = createSafeSourceFetch();

export async function readResponseBodyWithLimit(
  source: AsyncIterable<Uint8Array>,
  abort: () => void = () => undefined,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      abort();
      throw new Error("Mempool source response is too large");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

async function lookupAll(hostname: string): Promise<ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function waitForLookup(
  pending: Promise<ResolvedAddress[]>,
  signal?: AbortSignal | null,
): Promise<ResolvedAddress[]> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("Request aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (addresses) => {
        signal.removeEventListener("abort", onAbort);
        resolve(addresses);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function buildPinnedRequestOptions(
  url: URL,
  init: RequestInit,
  resolved: ResolvedAddress,
): https.RequestOptions {
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", url.host);
  return {
    protocol: url.protocol,
    hostname: resolved.address,
    family: resolved.family,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: init.method ?? "GET",
    headers: Object.fromEntries(headers.entries()),
    servername: url.protocol === "https:" ? url.hostname : undefined,
    rejectUnauthorized: url.protocol === "https:" ? true : undefined,
    signal: init.signal ?? undefined,
  };
}

async function requestPinned(url: URL, init: RequestInit, resolved: ResolvedAddress): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(buildPinnedRequestOptions(url, init, resolved), (response) => {
      void readResponseBodyWithLimit(response, () => response.destroy()).then(
        (body) => resolve(new Response(Uint8Array.from(body), {
          status: response.statusCode ?? 500,
          statusText: response.statusMessage,
          headers: response.headers as HeadersInit,
        })),
        reject,
      );
    });
    request.on("error", reject);
    if (typeof init.body === "string" || init.body instanceof Uint8Array) request.write(init.body);
    request.end();
  });
}
