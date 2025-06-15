// components/dashboard-view.tsx

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';
import DailySalesCrudForm from './daily-sales-crud-form';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // shadcn/uiのコンポーネントを想定

// サマリーカードのダミーコンポーネント
const SummaryCards = ({ data }: { data: any }) => {
    if (!data) return null;
    const nf = (num: number) => num ? num.toLocaleString() : '0';

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">月内フロア累計</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{nf(data.m_floor_total)}円</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">WEB売上累計</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{nf(data.m_web_total)}円</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">総合計</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{nf(data.m_grand_total)}円</div>
                </CardContent>
            </Card>
        </div>
    );
};

// グラフのダミーコンポーネント
const SalesChart = ({ data }: { data: any }) => {
    if (!data) return <Card className="mt-4"><CardContent><p className="pt-6">グラフデータを表示するには日付を選択してください。</p></CardContent></Card>;
    // ここに実際のグラフ描画ライブラリ（Rechartsなど）を使った実装が入ります
    return (
        <Card className="mt-4">
            <CardHeader>
                <CardTitle>売上グラフ（仮）</CardTitle>
            </CardHeader>
            <CardContent>
                <p>ここに棒グラフや折れ線グラフが表示されます。</p>
                <p>フロア売上: {data.d_floor_sales?.toLocaleString() ?? 0}円</p>
            </CardContent>
        </Card>
    );
};

// AI分析のダミーコンポーネント
const AiAnalysisReport = ({ data }: { data: any }) => {
    if (!data) return null;
     return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>AI分析レポート</CardTitle>
            </CardHeader>
            <CardContent>
                <p>ここにAIによる分析結果が表示されます。</p>
            </CardContent>
        </Card>
    );
}


export default function DashboardView() {
    const { data: session } = useSession();
    // selectedDateの型をDate | undefinedに変更
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [reportData, setReportData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReportData = useCallback(async (date: Date) => {
        if (!session?.supabaseAccessToken) return;
        setLoading(true);
        // YYYY-MM-DD形式の文字列に変換
        const dateString = date.toISOString().split('T')[0];
        try {
            const supabase = createAuthenticatedSupabaseClient(session.supabaseAccessToken);
            const { data, error } = await supabase.rpc('get_sales_report_data', { report_date: dateString });
            if (error) throw error;
            setReportData(data[0] || {});
        } catch (err: any) {
            setError('データの取得に失敗しました: ' + err.message);
            setReportData(null); // エラー時はデータをクリア
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => {
        if (selectedDate) {
            fetchReportData(selectedDate);
        }
    }, [selectedDate, fetchReportData]);

    const handleDataUpdate = () => {
        if (selectedDate) {
            fetchReportData(selectedDate);
        }
    };

    // YYYY-MM-DD形式の文字列を返すヘルパー
    const selectedDateString = selectedDate ? selectedDate.toISOString().split('T')[0] : '';

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
            
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                <div className="lg:col-span-1">
                    <Card>
                        <CardContent className="p-2">
                             <DayPicker
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                className="w-full"
                                initialFocus
                             />
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                    <SummaryCards data={reportData} />
                    <SalesChart data={reportData} />
                </div>
            </div>

            <hr />

            <div>
                <h2 className="text-xl font-semibold mb-2">
                    日次データ操作 ({selectedDateString})
                </h2>
                <div className="p-4 border rounded-lg">
                    {session && selectedDateString ? (
                        <DailySalesCrudForm
                            selectedDate={selectedDateString}
                            dailyData={reportData}
                            onDataUpdate={handleDataUpdate}
                            accessToken={session.supabaseAccessToken}
                        />
                    ) : (
                        <p>カレンダーから日付を選択してください。</p>
                    )}
                </div>
            </div>

            <AiAnalysisReport data={reportData} />
        </div>
    );
}
