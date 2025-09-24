'use client';

// FY（8月開始）を選んで /api/kpi-annual/print?fy=XXXX を新規タブで開く
import { useMemo, useState } from 'react';

export default function KpiPrintToolbar() {
  const now = new Date();
  const currentFY = (now.getUTCMonth() + 1) >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fyOptions = useMemo(() => Array.from({ length: 10 }, (_, i) => currentFY - i), [currentFY]);
  const [fy, setFy] = useState<number>(currentFY);
  const apiUrl = `/api/kpi-annual/print?fy=${fy}`;

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <div className="text-xl font-semibold">売上KPIダッシュボード</div>
        <div className="text-xs text-neutral-500 mt-1">
          直近12ヶ月（今月まで）／ データソース: kpi.kpi_sales_monthly_unified_v1
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">年度（FY）</label>
          <select
            value={fy}
            onChange={(e) => setFy(Number(e.target.value))}
            className="border rounded-md px-3 py-2 min-w-[220px]"
          >
            {fyOptions.map((y) => (
              <option key={y} value={y}>
                FY{y}（{y}-08〜{y + 1}-07）
              </option>
            ))}
          </select>
        </div>
        <a
          href={apiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
        >
          年間一覧を印刷
        </a>
      </div>
    </div>
  );
}
