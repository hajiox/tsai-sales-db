// app/sales/dashboard/page.tsx (統合ダッシュボード)

"use client";

import { useState } from 'react';
import SalesReportForm from '@/sales-report-form'; // sales-report-form.tsxの場所を正しく指定
import DashboardView from '@/components/dashboard-view'; // dashboard-view.tsxの場所を正しく指定

export default function IntegratedDashboardPage() {
  // ダッシュボードのデータを更新するための「バージョン」管理用State
  // この数値を更新すると、DashboardViewコンポーネントが再描画される
  const [dataVersion, setDataVersion] = useState(0);

  // フォームの保存が成功したときに呼び出される関数
  const handleSaveSuccess = () => {
    console.log("Data saved, refreshing dashboard...");
    // バージョンをインクリメントして、DashboardViewの再描画をトリガーする
    setDataVersion(prevVersion => prevVersion + 1);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      
      {/* ダッシュボード表示エリア
        keyにdataVersionを渡すことで、データが更新された際に
        コンポーネントが再マウントされ、最新の情報を取得・表示します。
      */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">売上ダッシュボード</h2>
        <DashboardView key={dataVersion} />
      </div>

      <hr />

      {/* 入力・修正フォームエリア
        onSaveSuccessに関数を渡して、保存成功を検知できるようにします。
      */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">売上入力・修正</h2>
        <SalesReportForm onSaveSuccess={handleSaveSuccess} />
      </div>

    </div>
  );
}
