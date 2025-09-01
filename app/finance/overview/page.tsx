// app/finance/overview/page.tsx  ←置換
import { headers } from "next/headers";

type Api = {
  month_start: string;
  bs: { assets_total: number; liabilities_total: number; equity_total: number; diff: number };
  pl: { revenues_total: number; expenses_total: number; net_income_signed: number; diff: number };
  is_balanced: boolean;
};

// 表示：日本語・マイナスは「▲」
const fmt = (n: number) =>
  (n < 0 ? "▲" + Math.abs(n).toLocaleString("ja-JP") : n.toLocaleString("ja-JP"));

function isoFirstDay(d: Date) {
  const z = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return z.toISOString().slice(0, 10);
}
function shiftMonthISO(iso: string, delta: number) {
  const d = new Date(iso);
  const z = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  return z.toISOString().slice(0, 10);
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { date?: string; refresh?: string; ts?: string };
}) {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL ? "https" : "http";

  const dateParam = searchParams?.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? searchParams!.date! : "";
  const doRefresh = searchParams?.refresh === "1";

  // リフレッシュ（見える手応え）
  let refreshed: { ok: boolean; at: string; bs?: number; pl?: number } | null = null;
  if (doRefresh) {
    try {
      const r = await fetch(`${proto}://${host}/api/finance/refresh`, { method: "POST", cache: "no-store" });
      const j = (await r.json()) as any;
      refreshed = { ok: !!j?.ok, at: new Date().toISOString(), bs: j?.latest?.bs_diff, pl: j?.latest?.pl_diff };
    } catch {
      refreshed = { ok: false, at: new Date().toISOString() };
    }
  }

  // Overview取得
  const qs = new URLSearchParams();
  if (dateParam) qs.set("date", dateParam);
  const overviewUrl = `${proto}://${host}/api/finance/overview${qs.size ? `?${qs.toString()}` : ""}`;
  const res = await fetch(overviewUrl, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">財務ダッシュボード</h1>
        <p className="text-red-600">Error: {res.status} {res.statusText}</p>
      </div>
    );
  }
  const data = (await res.json()) as Api;
  const { month_start, bs, pl, is_balanced } = data;

  // 前月/翌月・更新リンク
  const baseISO = dateParam || isoFirstDay(new Date(month_start));
  const prevISO = shiftMonthISO(baseISO, -1);
  const nextISO = shiftMonthISO(baseISO, +1);
  const prevHref = `?date=${prevISO}`;
  const nextHref = `?date=${nextISO}`;
  const rqs = new URLSearchParams();
  rqs.set("refresh", "1"); rqs.set("ts", Date.now().toString());
  if (dateParam) rqs.set("date", dateParam);
  const refreshHref = `?${rqs.toString()}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">財務ダッシュボード</h1>
        <div className="flex items-center gap-3">
          <a href={prevHref} className="px-3 py-1 rounded-xl border shadow-sm text-sm hover:bg-gray-50">← 前月</a>
          <a href={nextHref} className="px-3 py-1 rounded-xl border shadow-sm text-sm hover:bg-gray-50">翌月 →</a>
          {refreshed && (
            <span className={`px-2 py-1 rounded-full text-xs ${refreshed.ok ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
              更新 {new Date(refreshed.at).toLocaleTimeString()} (bs:{refreshed.bs ?? "-"}, pl:{refreshed.pl ?? "-"})
            </span>
          )}
          <a href={refreshHref} className="px-3 py-1 rounded-xl border shadow-sm text-sm hover:bg-gray-50">更新</a>
          <span className={`px-3 py-1 rounded-full text-sm ${is_balanced ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {is_balanced ? "OK（検算差=0）" : "Unbalanced"}
          </span>
        </div>
      </div>

      <div className="text-sm text-gray-600">対象月: {baseISO}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 貸借対照表（PDF表記に合わせて名称調整） */}
        <div className="rounded-2xl shadow p-4">
          <h2 className="font-medium mb-2">貸借対照表（合計）</h2>
          <div className="space-y-1">
            <div>資産合計：{fmt(bs.assets_total)}</div>
            <div>負債合計：{fmt(bs.liabilities_total)}</div>
            <div>純資産合計：{fmt(bs.equity_total)}</div>
            <div className={`${bs.diff === 0 ? "text-green-700" : "text-red-700"}`}>検算差：{fmt(bs.diff)}</div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            ※ 科目の内訳（流動資産／固定資産／投資その他 等）は明細画面で対応。ここは合計値のみ。
          </p>
        </div>

        {/* 損益計算書（PDF表記に合わせて名称調整） */}
        <div className="rounded-2xl shadow p-4">
          <h2 className="font-medium mb-2">損益計算書（当期累計）</h2>
          <div className="space-y-1">
            <div>売上高（純売上高）：{fmt(pl.revenues_total)}</div>
            <div>費用合計（原価・販管費等）：{fmt(pl.expenses_total)}</div>
            <div className={`${pl.net_income_signed >= 0 ? "text-green-700" : "text-red-700"}`}>
              当期純利益：{fmt(pl.net_income_signed)}
            </div>
            <div className={`${pl.diff === 0 ? "text-green-700" : "text-red-700"}`}>差分：{fmt(pl.diff)}</div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            ※ 「売上総利益」「営業利益」「経常利益」など段階利益はDB集計を簡略化中のため省略。
          </p>
        </div>
      </div>
    </div>
  );
}
