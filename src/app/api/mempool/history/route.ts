import type { NextRequest } from "next/server";
import {
  historyRangeStart,
  normalizeHistoryRange,
  parseHistoryLimit,
  type MempoolHistoryResponse,
} from "@/lib/history";
import { getHistorySampleInterval, readHistoryPoints } from "@/lib/history-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const range = normalizeHistoryRange(request.nextUrl.searchParams.get("range"));
    const limit = parseHistoryLimit(request.nextUrl.searchParams.get("limit"));
    const to = Date.now();
    const from = historyRangeStart(range, to);
    const points = await readHistoryPoints({ from, to, limit });
    const response: MempoolHistoryResponse = {
      range,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      sampleIntervalMs: getHistorySampleInterval(),
      points,
    };

    return Response.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return Response.json(
      { error: "Mempool history unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
