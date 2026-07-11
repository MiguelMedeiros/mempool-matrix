import { NextResponse } from "next/server";
import { fetchTransactionDetail } from "@/lib/mempool";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ txid: string }> },
) {
  try {
    const { txid } = await params;
    const source = process.env.MEMPOOL_API_URL ?? "http://127.0.0.1:3000/api";
    return NextResponse.json(await fetchTransactionDetail(fetch, source, txid), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "Invalid transaction id";
    return NextResponse.json(
      { error: invalid ? "Invalid transaction id" : "Transaction unavailable" },
      { status: invalid ? 400 : 503 },
    );
  }
}
