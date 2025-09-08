import AnnualPlanEditor from "@/components/annual/AnnualPlanEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">年間目標ダッシュボード（当期）</h1>
        <p className="text-sm text-neutral-500">
          前年度実績・実績はシステム自動集計／今年度目標と営業目標は手入力保存
        </p>
      </header>
      <AnnualPlanEditor />
    </main>
  );
}
