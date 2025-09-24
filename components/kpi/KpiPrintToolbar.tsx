// components/kpi/KpiPrintToolbar.tsx
import React from "react";

function getCurrentFY() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 8 ? y : y - 1;
}

export default function KpiPrintToolbar({ latestLabel }: { latestLabel?: string | null }) {
  const fyNow = getCurrentFY();
  const printUrl = `/api/kpi-annual/print?fy=${fyNow}`;

  return (
    <div className="flex items-start justify-between gap-3 mb-2">
      <div>
        <div className="text-xl font-semibold">売上KPIダッシュボード</div>
        <div className="text-xs text-neutral-500 mt-1 space-y-0.5">
          <div>直近12ヶ月（今月まで）／ データソース: kpi.kpi_sales_monthly_unified_v1</div>
          <div>最新月（検知）: {latestLabel ?? "—"}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={printUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          title="年間の月別一覧を開いてそのまま印刷"
        >
          年間一覧を印刷
        </a>
      </div>
    </div>
  );
}
