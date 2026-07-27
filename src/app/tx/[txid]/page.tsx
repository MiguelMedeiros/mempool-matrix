import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TransactionDetailPage } from "@/components/transaction-detail-page";
import { fetchTransactionDetail } from "@/lib/mempool";
import { getActiveMempoolBaseUrl } from "@/lib/runtime-config";
import { safeSourceFetch } from "@/lib/source-fetch";

export const dynamic = "force-dynamic";

type TransactionPageProps = {
  params: Promise<{ txid: string }>;
};

export async function generateMetadata({ params }: TransactionPageProps): Promise<Metadata> {
  const { txid } = await params;
  if (!isTransactionId(txid)) return { title: "Transaction not found — mempool.matrix" };
  return {
    title: `${txid.slice(0, 12)}… — mempool.transaction`,
    description: "A complete, educational breakdown of a Bitcoin transaction from our own node.",
  };
}

export default async function TransactionPage({ params }: TransactionPageProps) {
  const { txid } = await params;
  if (!isTransactionId(txid)) notFound();
  const detail = await loadTransaction(txid);
  return <TransactionDetailPage detail={detail} />;
}

async function loadTransaction(txid: string) {
  try {
    const source = await getActiveMempoolBaseUrl();
    return await fetchTransactionDetail(safeSourceFetch, source, txid);
  } catch (error) {
    if (error instanceof Error && (
      error.message === "Invalid transaction id"
      || error.message === "Transaction not found"
    )) {
      notFound();
    }
    throw error;
  }
}

function isTransactionId(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}
