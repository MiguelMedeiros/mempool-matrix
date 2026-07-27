import { describe, expect, it } from "vitest";
import {
  buildSiteMetadata,
  isPubliclyRoutableHostname,
  parseSiteUrl,
  SOCIAL_IMAGE_ALT,
} from "@/lib/site-metadata";

describe("site metadata", () => {
  it("omits URL-dependent metadata when NEXT_PUBLIC_SITE_URL is absent", () => {
    const metadata = buildSiteMetadata(undefined);
    expect(metadata.metadataBase).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.twitter).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain("localhost");
    expect(metadata).toMatchObject({
      manifest: "/manifest.webmanifest",
      description: "An interactive visualization of Bitcoin mempool activity as transaction rain.",
      appleWebApp: { capable: true, title: "mempool.matrix", statusBarStyle: "black-translucent" },
    });
  });

  it.each([
    ["https://example.com", "https://example.com/"],
    ["https://example.com/", "https://example.com/"],
    ["http://matrix.test:3033/", "http://matrix.test:3033/"],
    ["https://matrix.example.com", "https://matrix.example.com/"],
  ])("normalizes valid public origin %s", (configured, expected) => {
    expect(parseSiteUrl(configured)?.href).toBe(expected);
  });

  it.each([
    "http://localhost",
    "http://LOCALHOST:3033",
    "http://foo.localhost",
    "http://matrix",
    "http://matrix.local",
    "http://127.0.0.1",
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "http://0.0.0.0",
    "http://[::]",
    "http://10.23.45.67",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.10",
    "http://169.254.10.20",
    "http://100.64.0.1",
    "http://100.127.255.254",
    "http://224.0.0.1",
    "http://240.0.0.1",
    "http://[fc00::1]",
    "http://[fd12:3456::1]",
    "http://[fe80::1]",
    "http://[ff02::1]",
    "http://[3fff::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:10.0.0.1]",
    "http://[::ffff:192.168.1.1]",
  ])("rejects local or non-public origin %s", (configured) => {
    expect(() => parseSiteUrl(configured)).toThrowError(
      /NEXT_PUBLIC_SITE_URL must be a public HTTP\(S\) origin/,
    );
  });

  it.each(["matrix.example.com", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "recognizes publicly routable hostname %s without DNS lookups",
    (hostname) => {
      expect(isPubliclyRoutableHostname(hostname)).toBe(true);
    },
  );

  it("emits matching Open Graph and Twitter image metadata for a valid site URL", () => {
    const metadata = buildSiteMetadata("https://example.com/");
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(String(metadata.metadataBase)).toBe("https://example.com/");
    expect(metadata.alternates).toMatchObject({ canonical: "/" });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SOCIAL_IMAGE_ALT }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [{ url: "/og.jpg", alt: SOCIAL_IMAGE_ALT }],
    });
    expect(JSON.stringify(metadata)).not.toContain("localhost");
  });

  it.each([
    "ftp://example.com",
    "https://user:secret@example.com",
    "//example.com",
    "not a URL",
  ])("fails clearly for invalid configured value %s", (configured) => {
    expect(() => parseSiteUrl(configured)).toThrowError(
      /NEXT_PUBLIC_SITE_URL must be a public HTTP\(S\) origin with a root-only URL and no credentials/,
    );
  });

  it.each([
    "https://example.com/base",
    "https://example.com/%2F",
    "https://example.com/?campaign=launch",
    "https://example.com/#overview",
  ])("rejects non-root public origin value %s", (configured) => {
    expect(() => parseSiteUrl(configured)).toThrowError(
      /NEXT_PUBLIC_SITE_URL must be a public HTTP\(S\) origin with a root-only URL/,
    );
  });
});
