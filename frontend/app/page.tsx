"use client";

import dynamic from "next/dynamic";

// The whole dashboard is behind login + real-time client polling, so there's
// no SSR/SEO value in it -- disabling SSR here (rather than juggling
// mount-guards for localStorage/theme reads in every child) removes the
// hydration-mismatch class of bugs by construction.
const EfferdDashboard2 = dynamic(() => import("@/components/efferd-dashboard"), {
  ssr: false,
});

export default function Home() {
  return <EfferdDashboard2 />;
}
