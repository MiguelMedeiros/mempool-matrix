import { NextResponse } from "next/server";
import { fetchTransactionDetail } from "@/lib/mempool";
import { safeSourceFetch } from "@/lib/source-fetch";
import { getActiveMempoolBaseUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ txid: string }> },
) {
  try {
    const { txid } = await params;
    const source = await getActiveMempoolBaseUrl();
    return NextResponse.json(await fetchTransactionDetail(safeSourceFetch, source, txid), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "Invalid transaction id";
    const notFound = error instanceof Error && error.message === "Transaction not found";
    return NextResponse.json(
      { error: invalid ? "Invalid transaction id" : notFound ? "Transaction not found" : "Transaction unavailable" },
      { status: invalid ? 400 : notFound ? 404 : 503 },
    );
  }
}
