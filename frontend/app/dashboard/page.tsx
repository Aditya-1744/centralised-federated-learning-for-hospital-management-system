"use client";

import dynamic from "next/dynamic";

// Same rationale as app/page.tsx: pure client-side real-time page, no SSR value.
const SimulationDashboard = dynamic(
  () => import("@/components/simulation-dashboard"),
  { ssr: false }
);

export default function DashboardPage() {
  return <SimulationDashboard />;
}
