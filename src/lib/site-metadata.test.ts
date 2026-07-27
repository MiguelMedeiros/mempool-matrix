import { describe, expect, it } from "vitest";
import { buildSiteMetadata, parseSiteUrl, SOCIAL_IMAGE_ALT } from "@/lib/site-metadata";

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
    ["http://matrix.test:3033/path/", "http://matrix.test:3033/path/"],
  ])("normalizes valid public site URL %s", (configured, expected) => {
    expect(parseSiteUrl(configured)?.href).toBe(expected);
  });

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
      /NEXT_PUBLIC_SITE_URL must be an absolute HTTP\(S\) URL without credentials/,
    );
  });
});
