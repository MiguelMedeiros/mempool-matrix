import type { Metadata } from "next";
import { StatisticsDashboard } from "@/components/statistics-dashboard";

export const metadata: Metadata = {
  title: "mempool.statistics — Historical Bitcoin mempool telemetry",
  description: "Historical transaction count, virtual size, fee estimates, and block telemetry from our Bitcoin node.",
};

export default function StatisticsPage() {
  return <StatisticsDashboard />;
}
