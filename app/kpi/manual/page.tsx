/* app/kpi/manual/page.tsx
   ダッシュボード（簡易表示）。常に最新を取りに行く設定。
*/
export const revalidate = 0;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Row = {
  channel_code: "WEB" | "STORE" | "SHOKU" | "WHOLESALE";
  month: string; // ISO date (YYYY-MM-01)
  amount: number;
};

type ApiResp = {
  ok: true;
  rows: Row[];
  months: string[]; // YYYY-MM
  byMonthTotal: { ym: string; total: number }[];
  updatedAt: string;
} | {
  ok: false;
  error: string;
  updatedAt: string;
};

async function getData(): Promise<ApiResp> {
  const res = await fetch("/api/kpi/manual", {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  return res.json();
}

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n ?? 0);
}

export default async function Page() {
  const data = await getData();

  if (!data.ok) {
    return (
      <main className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">売上KPI（手動）</h1>
        <p className="text-red-600">{data.error}</p>
        <p className="text-sm text-neutral-500">updated: {data.updatedAt}</p>
      </main>
    );
  }

  const { rows, months, byMonthTotal, updatedAt } = data;

  // 月別・チャネル別のマトリクス生成
  const channels: Array<Row["channel_code"]> = ["WEB", "STORE", "SHOKU", "WHOLESALE"];
  const matrix: Record<string, Record<Row["channel_code"], number>> = {};
  months.forEach((ym) => (matrix[ym] = { WEB: 0, STORE: 0, SHOKU: 0, WHOLESALE: 0 }));
  rows.forEach((r) => {
    const ym = r.month.slice(0, 7);
    if (!matrix[ym]) matrix[ym] = { WEB: 0, STORE: 0, SHOKU: 0, WHOLESALE: 0 };
    matrix[ym][r.channel_code] = Number(r.amount) || 0;
  });

  const latest = byMonthTotal.at(-1);
  const totalLatest = latest?.total ?? 0;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">売上KPI（手動合成）</h1>
        <span className="text-xs text-neutral-500">updated: {updatedAt}</span>
      </div>

      {/* 合計カード */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">最新月 売上合計</div>
          <div className="mt-2 text-2xl font-semibold">{yen(totalLatest)}</div>
          <div className="text-xs text-neutral-500">{latest?.ym ?? "—"}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">データソース</div>
          <div className="mt-2">ACTUALS（店舗/食）、UI（OEM）、WEB_SALES（WEB）</div>
          <div className="text-xs text-neutral-500">欠損月のWEBは 0 として扱います</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">キャッシュ</div>
          <div className="mt-2">無効（毎回再計算）</div>
        </div>
      </section>

      {/* テーブル */}
      <section className="overflow-x-auto rounded-xl border">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="p-2 text-left">月</th>
              {channels.map((c) => (
                <th key={c} className="p-2 text-right">{c}</th>
              ))}
              <th className="p-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {months.map((ym) => {
              const row = matrix[ym] ?? { WEB: 0, STORE: 0, SHOKU: 0, WHOLESALE: 0 };
              const sum = (row.WEB || 0) + (row.STORE || 0) + (row.SHOKU || 0) + (row.WHOLESALE || 0);
              return (
                <tr key={ym} className="border-t">
                  <td className="p-2">{ym}</td>
                  {channels.map((c) => (
                    <td key={c} className="p-2 text-right tabular-nums">{yen(row[c] || 0)}</td>
                  ))}
                  <td className="p-2 text-right font-medium tabular-nums">{yen(sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
