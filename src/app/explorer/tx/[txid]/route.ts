import { redirect } from "next/navigation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ txid: string }> },
) {
  const { txid } = await params;
  if (!/^[0-9a-f]{64}$/i.test(txid)) redirect(new URL("/", request.url).toString());
  const explorer = process.env.EXPLORER_PUBLIC_URL ?? "http://100.67.121.90:3000";
  redirect(`${explorer.replace(/\/$/, "")}/tx/${txid}`);
}
