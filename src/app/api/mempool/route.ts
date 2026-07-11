import { NextResponse } from "next/server";
import { fetchMempoolSnapshot } from "@/lib/mempool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const source = process.env.MEMPOOL_API_URL ?? "http://127.0.0.1:3000/api";
    const snapshot = await fetchMempoolSnapshot(fetch, source);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "Mempool source unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
