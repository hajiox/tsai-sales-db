// /components/finance/BalanceSheet.tsx ver.9-min
// データ取得なし・静的レンダリングのみ（#130 切り分け用）

"use client";

import React from "react";

export default function BalanceSheet({ month }: { month?: string }) {
  return (
    <div className="w-full p-6">
      <h2 className="text-xl font-semibold">貸借対照表（B/S）</h2>
      {typeof month === "string" && (
        <p className="text-sm text-gray-500">対象月: {month}</p>
      )}
      <div className="mt-4 rounded border p-4 bg-white">
        <p>レンダリングテスト：この画面が表示されれば、React #130 はこのコンポーネント内部が原因。</p>
      </div>
    </div>
  );
}
