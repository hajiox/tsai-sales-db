"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";

type Check = { channel: string; report_month: string; period_start: string; period_end: string; external_product_key: string; source_name: string; reference_price: number; average_price: number; quantity: number; kind: string };
const names: Record<string, string> = { amazon: "Amazon", rakuten: "楽天", yahoo: "Yahoo", mercari: "メルカリ", base: "BASE", qoo10: "Qoo10", tiktok: "TikTok" };
const yen = (n: number) => `${Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;

export default function SalesPriceCheck({ recipeId, active }: { recipeId: string; active: boolean }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setError(false);
    setChecks([]);
    fetch(`/api/recipe/${recipeId}/sales-price-check`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((result) => setChecks(result.checks || []))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [recipeId, active]);
  if (error) return <p className="py-3 text-sm text-amber-800">EC実売価格の照合を取得できません。</p>;
  const differences = checks.filter((row) => row.kind !== "match");
  if (!differences.length) return null;
  return <details className="border-b border-amber-200 bg-amber-50 px-3 py-3 text-sm">
    <summary className="flex cursor-pointer items-center gap-2 font-medium text-amber-900"><AlertTriangle size={16} />EC実売価格の照合：確認事項 {differences.length}件<ChevronDown size={16} className="ml-auto" /></summary>
    <div className="mt-3 divide-y divide-amber-200">
      {differences.map((row) => <div key={`${row.channel}:${row.external_product_key}`} className="space-y-1 py-2">
        <p className="font-medium">{names[row.channel] || row.channel}・{row.period_start}～{row.period_end}・{row.quantity}点</p>
        <p>{row.kind === "mapping" ? "商品・セット数の紐付けが異なります。" : "実売平均単価に差があります。"}</p>
        <p>月次保存価格 {yen(row.reference_price)} ／ CSV実売平均 {yen(row.average_price)}</p>
        <p className="break-words text-xs text-gray-600">{row.source_name}</p>
        {row.kind === "average" && <p className="text-xs text-gray-600">値引き・ストアクーポン・期間中の価格変更を含む可能性があります。通常登録価格の不一致とは限りません。</p>}
      </div>)}
    </div>
  </details>;
}
