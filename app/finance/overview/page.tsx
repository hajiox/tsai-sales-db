// app/finance/overview/page.tsx  ←置換
import { headers } from "next/headers";

type Api = {
  month_start: string;
  bs: { assets_total: number; liabilities_total: number; equity_total: number; diff: number };
  pl: { revenues_total: number; expenses_total: number; net_income_signed: number; diff: number };
  is_balanced: boolean;
};

export default async function Page({
  searchParams,
}: {
  searchParams?: { date?: string; refresh?: string; ts?: string };
}) {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL ? "https" : "http";

  const date = searchParams?.date ?? "";
  const doRefresh = searchParams?.refresh === "1";

  // 1) 更新実行（結果を表示用に保持）
  let refreshed:
    | { ok: boolean; at: string; latest?: { month_start: string; bs_diff: number; pl_diff: number; is_balanced: boolean } }
    | null = null;

  if (doRefresh) {
    try {
      const r = await fetch(`${proto}://${host}/api/finance/refresh`, {
        method: "POST",
        cache: "no-store",
      });
      const j = (await r.json()) as any;
      refreshed = {
        ok: !!j?.ok,
        at: new Date().toISOString(),
        latest: j?.latest,
      };
    } catch {
      refreshed = { ok: false, at: new Date().toISOString() };
    }
  }

  // 2) Overview取得（no-store）
  const qs = new URLSearchParams();
  if (date) qs.set("date", date);
  const overviewUrl = `${proto}://${host}/api/finance/overview${qs.size ? `?${qs.toString()}` : ""}`;

  const res = await fetch(overviewUrl, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Finance Overview</h1>
        <p className="text-red-600">Error: {res.status} {res.statusText}</p>
        <p className="text-sm text-gray-500 mt-2">URL: {overviewUrl}</p>
      </div>
    );
  }
  const data = (await res.json()) as Api;
  const { month_start, bs, pl, is_balanced } = data;

  // 3) 「更新」リンク（キャッシュ回避のため ts を付ける）
  const refreshParams = new URLSearchParams();
  if (date) refreshParams.set("date", date);
  refreshParams.set("refresh", "1");
  refreshParams.set("ts", Date.now().toString());
  const refreshHref = `?${refreshParams.toString()}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finance Overview</h1>
        <div className="flex items-center gap-3">
          {refreshed && (
            <span className={`px-2 py-1 rounded-full text-xs ${refreshed.ok ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
              refreshed {new Date(refreshed.at).toLocaleTimeString()}{" "}
              {refreshed.latest ? `(bs:${refreshed.latest.bs_diff}, pl:${refreshed.latest.pl_diff})` : ""}
            </span>
          )}
          <a href={refreshHref} className="px-3 py-1 rounded-xl border shadow-sm text-sm hover:bg-gray-50">更新</a>
          <span className={`px-3 py-1 rounded-full text-sm ${is_balanced ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {is_balanced ? "OK (bs_diff/pl_diff = 0)" : "Unbalanced"}
          </span>
        </div>
      </div>

      <div className="text-sm text-gray-600">month_start: {month_start}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl shadow p-4">
          <h2 className="font-medium mb-2">B/S</h2>
          <div className="space-y-1">
            <div>assets_total: {bs.assets_total.toLocaleString()}</div>
            <div>liabilities_total: {bs.liabilities_total.toLocaleString()}</div>
            <div>equity_total: {bs.equity_total.toLocaleString()}</div>
            <div className={`${bs.diff === 0 ? "text-green-700" : "text-red-700"}`}>diff: {bs.diff}</div>
          </div>
        </div>

        <div className="rounded-2xl shadow p-4">
          <h2 className="font-medium mb-2">P/L</h2>
          <div className="space-y-1">
            <div>revenues_total: {pl.revenues_total.toLocaleString()}</div>
            <div>expenses_total: {pl.expenses_total.toLocaleString()}</div>
            <div>net_income_signed: {pl.net_income_signed.toLocaleString()}</div>
            <div className={`${pl.diff === 0 ? "text-green-700" : "text-red-700"}`}>diff: {pl.diff}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
