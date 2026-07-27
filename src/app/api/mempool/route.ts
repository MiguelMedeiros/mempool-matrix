import { NextResponse } from "next/server";
import { fetchMempoolSnapshot } from "@/lib/mempool";
import { safeSourceFetch } from "@/lib/source-fetch";
import {
  getActiveMempoolSource,
  recordMempoolSourceHealth,
} from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  let source: Awaited<ReturnType<typeof getActiveMempoolSource>> | undefined;
  try {
    source = await getActiveMempoolSource();
    const snapshot = await fetchMempoolSnapshot(safeSourceFetch, source.baseUrl);
    recordMempoolSourceHealth(source.baseUrl, true);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    if (source) recordMempoolSourceHealth(source.baseUrl, false, "unavailable");
    return NextResponse.json(
      { error: "Mempool source unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
