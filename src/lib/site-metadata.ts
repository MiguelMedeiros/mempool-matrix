import { isIP } from "node:net";
import type { Metadata } from "next";

export const SITE_TITLE = "mempool.matrix — Bitcoin transaction rain";
export const SITE_DESCRIPTION =
  "An interactive visualization of Bitcoin mempool activity as transaction rain.";
export const SOCIAL_IMAGE_ALT =
  "mempool.matrix title over descending Bitcoin transaction rain";

const INVALID_SITE_URL_MESSAGE =
  "NEXT_PUBLIC_SITE_URL must be a public HTTP(S) origin with a root-only URL and no credentials";

function ipv4ToInteger(address: string): number {
  return address
    .split(".")
    .reduce((result, octet) => result * 256 + Number(octet), 0);
}

function ipv6ToBigInt(address: string): bigint {
  const expandEmbeddedIpv4 = (parts: string[]): string[] => {
    const last = parts.at(-1);
    if (!last?.includes(".")) return parts;

    const ipv4 = ipv4ToInteger(last);
    return [
      ...parts.slice(0, -1),
      ((ipv4 >>> 16) & 0xffff).toString(16),
      (ipv4 & 0xffff).toString(16),
    ];
  };

  const [left = "", right = ""] = address.split("::");
  const leftParts = expandEmbeddedIpv4(left ? left.split(":") : []);
  const rightParts = expandEmbeddedIpv4(right ? right.split(":") : []);
  const missingParts = 8 - leftParts.length - rightParts.length;
  const parts = [...leftParts, ...Array<string>(missingParts).fill("0"), ...rightParts];

  return parts.reduce(
    (result, part) => (result << BigInt(16)) | BigInt(`0x${part || "0"}`),
    BigInt(0),
  );
}

function isInIpv4Range(address: number, network: number, prefixLength: number): boolean {
  const blockSize = 2 ** (32 - prefixLength);
  return Math.floor(address / blockSize) === Math.floor(network / blockSize);
}

function isInIpv6Range(address: bigint, network: bigint, prefixLength: number): boolean {
  const shift = BigInt(128 - prefixLength);
  return address >> shift === network >> shift;
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToInteger(address);
  const blockedRanges: ReadonlyArray<readonly [string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return !blockedRanges.some(([network, prefix]) =>
    isInIpv4Range(value, ipv4ToInteger(network), prefix),
  );
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  const mappedIpv4Prefix = ipv6ToBigInt("::ffff:0:0");
  if (isInIpv6Range(value, mappedIpv4Prefix, 96)) {
    const mapped = Number(value & BigInt("0xffffffff"));
    const dotted = [24, 16, 8, 0].map((shift) => String((mapped >>> shift) & 0xff)).join(".");
    return isPublicIpv4(dotted);
  }

  const globalUnicast = isInIpv6Range(value, ipv6ToBigInt("2000::"), 3);
  const reservedGlobalRanges: ReadonlyArray<readonly [string, number]> = [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ];

  return (
    globalUnicast &&
    !reservedGlobalRanges.some(([network, prefix]) =>
      isInIpv6Range(value, ipv6ToBigInt(network), prefix),
    )
  );
}

export function isPubliclyRoutableHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) return isPublicIpv4(normalized);
  if (ipVersion === 6) return isPublicIpv6(normalized);

  return (
    normalized.includes(".") &&
    normalized !== "localhost" &&
    !normalized.endsWith(".localhost") &&
    !normalized.endsWith(".local")
  );
}

export function parseSiteUrl(configuredValue: string | undefined): URL | undefined {
  const value = configuredValue?.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${INVALID_SITE_URL_MESSAGE}; received ${JSON.stringify(configuredValue)}`);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !isPubliclyRoutableHostname(url.hostname)
  ) {
    throw new Error(`${INVALID_SITE_URL_MESSAGE}; received ${JSON.stringify(configuredValue)}`);
  }

  return new URL(url.origin);
}

export function buildSiteMetadata(configuredSiteUrl: string | undefined): Metadata {
  const siteUrl = parseSiteUrl(configuredSiteUrl);
  const baseMetadata: Metadata = {
    applicationName: "mempool.matrix",
    title: { default: SITE_TITLE, template: "%s — mempool.matrix" },
    description: SITE_DESCRIPTION,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "mempool.matrix",
      statusBarStyle: "black-translucent",
    },
  };

  if (!siteUrl) return baseMetadata;

  return {
    ...baseMetadata,
    metadataBase: siteUrl,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "mempool.matrix",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: "/",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SOCIAL_IMAGE_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: "/og.jpg", alt: SOCIAL_IMAGE_ALT }],
    },
  };
}
