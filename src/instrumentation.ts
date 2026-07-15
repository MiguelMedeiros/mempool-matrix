export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startHistoryCollector } = await import("./lib/history-collector");
  startHistoryCollector();
}
