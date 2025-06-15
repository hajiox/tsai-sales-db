// components/dashboard-view.tsx

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';
import DailySalesCrudForm from './daily-sales-crud-form'; // 新しいフォームコンポーネント
// ... (既存のグラフやサマリーカードコンポーネントのimport)

export default function DashboardView() {
    const { data: session } = useSession();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReportData = useCallback(async () => {
        if (!session?.supabaseAccessToken) return;
        setLoading(true);
        try {
            const supabase = createAuthenticatedSupabaseClient(session.supabaseAccessToken);
            const { data, error } = await supabase.rpc('get_sales_report_data', { report_date: selectedDate });
            if (error) throw error;
            setReportData(data[0] || {});
        } catch (err: any) {
            setError('データの取得に失敗しました: ' + err.message);
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [session, selectedDate]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    const handleDataUpdate = () => {
        // データが更新されたら再取得を実行
        fetchReportData();
    };
    
    // ... (日付選択コンポーネントのロジック)

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
            {/* ... (日付選択UI) ... */}

            {/* --- 上部サマリーカード --- */}
            {/* reportDataを使ってサマリーカードを表示するコンポーネントをここに配置 */}

            {/* --- グラフエリア --- */}
            {/* reportDataを使ってグラフを表示するコンポーネントをここに配置 */}

            <hr className="my-6" />

            {/* --- 日次データ 入力・修正・削除フォーム --- */}
            <h2 className="text-xl font-semibold">日次データ操作</h2>
            <div className="p-4 border rounded-lg">
                {session ? (
                    <DailySalesCrudForm
                        selectedDate={selectedDate}
                        dailyData={reportData}
                        onDataUpdate={handleDataUpdate} // データ更新後の再取得コールバックを渡す
                        accessToken={session.supabaseAccessToken}
                    />
                ) : (
                    <p>フォームを表示するにはログインが必要です。</p>
                )}
            </div>
            
            <hr className="my-6" />

            {/* --- AI分析レポートエリア --- */}
            {/* AI分析レポートコンポーネントをここに配置 */}

        </div>
    );
}
