"use client";

import dynamic from "next/dynamic";

// B/Sはクライアント側だけで描画（SSRを切って安全に）
const BalanceSheet = dynamic(
  () => import("@/components/finance/BalanceSheet"),
  { ssr: false }
);

type Search = { month?: string; tab?: string };

export default function FinancialStatementsPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  // オブジェクトを直接描画しない（#130対策）
  const month =
    typeof searchParams?.month === "string" && searchParams.month
      ? searchParams.month
      : undefined;
  const tab =
    typeof searchParams?.tab === "string" && searchParams.tab
      ? searchParams.tab
      : "bs";

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">財務諸表</h1>

      {tab === "bs" ? (
        <BalanceSheet month={month} />
      ) : (
        <div className="text-gray-500">
          このタブはまだ未対応です（tab={tab}）。
        </div>
      )}
    </main>
  );
}
