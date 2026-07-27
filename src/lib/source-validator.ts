import { BlockList } from "node:net";

export const MAX_SOURCE_URL_LENGTH = 2048;
export const MAX_SOURCE_LABEL_LENGTH = 64;

const BLOCKED_HOSTNAMES = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "100.100.100.200",
  "[::ffff:169.254.169.254]",
  "[fd00:ec2::254]",
  "metadata",
  "metadata.google.internal",
]);

const blockedResolvedAddresses = new BlockList();
blockedResolvedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedResolvedAddresses.addAddress("100.100.100.200", "ipv4");
blockedResolvedAddresses.addSubnet("fe80::", 10, "ipv6");
blockedResolvedAddresses.addAddress("fd00:ec2::254", "ipv6");

export type SourceValidationErrorCode =
  | "credentials-not-allowed"
  | "invalid-label"
  | "invalid-url"
  | "metadata-endpoint"
  | "must-end-with-api"
  | "unsupported-protocol"
  | "url-too-long";

export class SourceValidationError extends Error {
  constructor(
    public readonly code: SourceValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceValidationError";
  }
}

export type ValidatedMempoolSource = {
  baseUrl: string;
  label?: string;
};

export type ResolvedAddress = { address: string; family: number };

export function assertSafeResolvedAddresses(addresses: ResolvedAddress[]): void {
  if (addresses.length === 0) {
    throw new SourceValidationError("invalid-url", "API hostname could not be resolved.");
  }
  if (addresses.some(({ address }) => isMetadataOrLinkLocalAddress(address))) {
    throw new SourceValidationError("metadata-endpoint", "Cloud metadata endpoints are not allowed.");
  }
}

function isMetadataOrLinkLocalAddress(rawAddress: string): boolean {
  const address = rawAddress.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (blockedResolvedAddresses.check(address, address.includes(":") ? "ipv6" : "ipv4")) return true;
  const ipv4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  if (ipv4?.length === 4 && ipv4.every((part) => part >= 0 && part <= 255)) {
    return (ipv4[0] === 169 && ipv4[1] === 254) || address === "100.100.100.200";
  }
  if (address.startsWith("::ffff:")) {
    return isMetadataOrLinkLocalAddress(address.slice("::ffff:".length))
      || address.endsWith(":a9fe:a9fe")
      || address.endsWith(":a9fe:aa02");
  }
  const firstGroup = Number.parseInt(address.split(":", 1)[0] || "0", 16);
  return (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) || address === "fd00:ec2::254";
}

export function validateMempoolSource(
  input: { baseUrl?: unknown; label?: unknown },
  denyHosts = process.env.MEMPOOL_SOURCE_DENY_HOSTS,
): ValidatedMempoolSource {
  if (typeof input.baseUrl !== "string" || input.baseUrl.trim().length === 0) {
    throw new SourceValidationError("invalid-url", "Enter a valid API URL.");
  }

  const candidate = input.baseUrl.trim();
  if (candidate.length > MAX_SOURCE_URL_LENGTH) {
    throw new SourceValidationError("url-too-long", "API URL is too long.");
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SourceValidationError("invalid-url", "Enter a valid absolute API URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceValidationError("unsupported-protocol", "API URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new SourceValidationError("credentials-not-allowed", "Credentials are not allowed in the API URL.");
  }
  if (!url.hostname) {
    throw new SourceValidationError("invalid-url", "API URL must include a hostname.");
  }
  if (url.search || url.hash) {
    throw new SourceValidationError("invalid-url", "API URL cannot include a query string or fragment.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const configuredDenyHosts = new Set(
    (denyHosts ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean),
  );
  if (
    BLOCKED_HOSTNAMES.has(hostname)
    || configuredDenyHosts.has(hostname)
    || hostname.endsWith(".metadata.google.internal")
    || hostname.startsWith("[fe8")
    || hostname.startsWith("[fe9")
    || hostname.startsWith("[fea")
    || hostname.startsWith("[feb")
    || hostname.endsWith(":a9fe:a9fe]")
    || hostname.endsWith(":a9fe:aa02]")
  ) {
    throw new SourceValidationError("metadata-endpoint", "Cloud metadata endpoints are not allowed.");
  }

  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") {
    url.pathname = "/api";
  } else if (!pathname.endsWith("/api")) {
    throw new SourceValidationError("must-end-with-api", "API URL path must end in /api.");
  } else {
    url.pathname = pathname;
  }

  const label = validateSourceLabel(input.label);
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    ...(label ? { label } : {}),
  };
}

export function validateSourceLabel(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new SourceValidationError("invalid-label", "Source label must be text.");
  }
  const label = value.trim();
  if (
    label.length === 0
    || label.length > MAX_SOURCE_LABEL_LENGTH
    || /[\u0000-\u001f\u007f]/.test(label)
  ) {
    throw new SourceValidationError(
      "invalid-label",
      `Source label must be between 1 and ${MAX_SOURCE_LABEL_LENGTH} characters.`,
    );
  }
  return label;
}
