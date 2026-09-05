import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardApp from "../components/DashboardApp";

export const metadata: Metadata = { title: "Product Preview", robots: { index: false, follow: false } };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="app-body" style={{ minHeight: "100vh" }} />}>
      <DashboardApp />
    </Suspense>
  );
}
