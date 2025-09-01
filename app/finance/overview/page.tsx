// app/finance/overview/page.tsx  （置換）
import { headers } from "next/headers";

type Api = {
  month_start: string;
  bs: { assets_total: number; liabilities_total: number; equity_total: number; diff: number };
  pl: { revenues_total: number; expenses_total: number; net_income_signed: number; diff: number };
  is_balanced: boolean;
};

export default async function Page({ searchParams }: { searchParams?: { date?: string } }) {
  const date = searchParams?.date ?? "";
  const host = headers().get("host")!;
  const proto = process.env.VERCEL ? "https" : "http";
  const url = `${proto}://${host}/api/finance/overview${date ? `?date=${date}` : ""}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Finance Overview</h1>
        <p className="text-red-600">Error: {res.status} {res.statusText}</p>
        <p className="text-sm text-gray-500 mt-2">URL: {url}</p>
      </div>
    );
  }

  const data = (await res.json()) as Api;
  const { month_start, bs, pl, is_balanced } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finance Overview</h1>
        <span className={`px-3 py-1 rounded-full text-sm ${is_balanced ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
          {is_balanced ? "OK (bs_diff/pl_diff = 0)" : "Unbalanced"}
        </span>
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
