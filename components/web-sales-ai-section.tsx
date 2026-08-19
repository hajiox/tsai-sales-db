"use client";

import WebSalesCodexAnalysis from "@/components/web-sales-codex-analysis";

export default function WebSalesAiSection({ month }: { month: string }) {
  return <WebSalesCodexAnalysis month={month} focus="sales" />;
}
