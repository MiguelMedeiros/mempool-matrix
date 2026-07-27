import { redirect } from "next/navigation";

const DEFAULT_EXPLORER_PUBLIC_URL = "https://mempool.space";

function explorerPublicUrl(): string {
  const configuredUrl = process.env.EXPLORER_PUBLIC_URL;
  if (!configuredUrl) return DEFAULT_EXPLORER_PUBLIC_URL;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_EXPLORER_PUBLIC_URL;
    }
    return configuredUrl.replace(/\/+$/, "");
  } catch {
    return DEFAULT_EXPLORER_PUBLIC_URL;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ txid: string }> },
) {
  const { txid } = await params;
  if (!/^[0-9a-f]{64}$/i.test(txid)) redirect(new URL("/", request.url).toString());
  const explorer = explorerPublicUrl();
  redirect(`${explorer}/tx/${txid}`);
}
