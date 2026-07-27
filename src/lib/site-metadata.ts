import type { Metadata } from "next";

export const SITE_TITLE = "mempool.matrix — Bitcoin transaction rain";
export const SITE_DESCRIPTION =
  "An interactive visualization of Bitcoin mempool activity as transaction rain.";
export const SOCIAL_IMAGE_ALT =
  "mempool.matrix title over descending Bitcoin transaction rain";

const INVALID_SITE_URL_MESSAGE =
  "NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) URL without credentials";

export function parseSiteUrl(configuredValue: string | undefined): URL | undefined {
  const value = configuredValue?.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${INVALID_SITE_URL_MESSAGE}; received ${JSON.stringify(configuredValue)}`);
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error(`${INVALID_SITE_URL_MESSAGE}; received ${JSON.stringify(configuredValue)}`);
  }

  return url;
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
