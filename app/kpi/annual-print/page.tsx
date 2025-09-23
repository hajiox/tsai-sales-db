'use client';

// /app/kpi/annual-print/page.tsx  ver.1
// 目的: 過去年度を含め、FYを選んで年間一覧の印刷画面を開くUI
// 動作: FY(8月開始)をプルダウンで選択 -> /api/kpi-annual/print?fy=XXXX を新規タブで開く
// 依存: 既存の /api/kpi-annual/print エンドポイント

import { useMemo, useState } from 'react';

export default function AnnualPrintPickerPage() {
  // 現在FY（8月開始）を自動判定
  const now = new Date();
  const currentFY = (now.getUTCMonth() + 1) >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  // 過去5年 + 現在FY = 6件を候補に
  const fyOptions = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 6; i++) list.push(currentFY - i);
    return list;
  }, [currentFY]);

  const [fy, setFy] = useState<number>(currentFY);
  const apiUrl = `/api/kpi-annual/print?fy=${fy}`;

  const openPrint = () => {
    window.open(apiUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">年間一覧の印刷</h1>
      <p className="text-sm text-neutral-500 mb-6">
        年度（FY＝8月開始）を選んで、印刷画面を開きます。
      </p>

      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">年度（FY）</label>
          <select
            value={fy}
            onChange={(e) => setFy(Number(e.target.value))}
            className="border rounded-md px-3 py-2 min-w-[260px]"
          >
            {fyOptions.map((y) => (
              <option key={y} value={y}>
                FY{y}（{y}-08〜{y + 1}-07）
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openPrint}
          className="inline-flex items-center rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          title="印刷画面（新しいタブ）を開きます"
        >
          印刷画面を開く
        </button>

        <a
          href={apiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          title="APIを直接開く"
        >
          直接開く
        </a>
      </div>

      <div className="mt-6 text-xs text-neutral-500">
        参照: <code>kpi.kpi_sales_monthly_unified_v1</code> ／ URL: <code>{apiUrl}</code>
      </div>
    </div>
  );
}
