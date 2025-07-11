// components/dashboard-view.tsx

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';

import DashboardHeader from './dashboard-header';
import DashboardStats from './dashboard-stats';
import SalesChartGrid from './sales-chart-grid';
import DailySalesCrudForm from './daily-sales-crud-form';
import AiDashboardSection from './ai-dashboard-section'; // ★ AI分析セクションをインポート

export default function DashboardView() {
    const { data: session } = useSession();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    
    // データステート
    const [dailyData, setDailyData] = useState<any>(null);
    const [monthlyData, setMonthlyData] = useState<any>(null);
    const [sixMonthData, setSixMonthData] = useState<any[]>([]);
    
    // ローディング・エラーステート
    const [dailyLoading, setDailyLoading] = useState(true);
    const [graphLoading, setGraphLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getDailyData = useCallback(async (date: Date, supabase: any) => {
        setDailyLoading(true);
        // タイムゾーン問題を完全に回避するローカル日付文字列生成
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        // 日別データを直接取得（singleを削除）
        const { data, error } = await supabase
            .from('daily_sales_report')
            .select('*')
            .eq('date', dateString);
            
        if (error) {
            throw new Error(`日次データ取得エラー: ${error.message}`);
        }
        
        // データが存在する場合は最初の要素、存在しない場合は空オブジェクト
        setDailyData(data && data.length > 0 ? data[0] : {});
        setDailyLoading(false);
    }, []);

    const getMonthlyData = useCallback(async (date: Date, supabase: any) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        // RPC関数で月累計データを取得
        const { data, error } = await supabase.rpc('get_sales_report_data', { report_date: dateString });
        if (error) {
            throw new Error(`月累計データ取得エラー: ${error.message}`);
        }
        
        setMonthlyData(data && data.length > 0 ? data[0] : {});
    }, []);
    
    const getSixMonthData = useCallback(async (date: Date, supabase: any) => {
        setGraphLoading(true);
        const dateString = date.toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('get_6month_sales_summary', { end_date: dateString });
        if (error) throw new Error(`グラフデータ取得エラー: ${error.message}`);
        setSixMonthData(data || []);
        setGraphLoading(false);
    }, []);

    const fetchData = useCallback(async (date: Date) => {
        if (!session?.supabaseAccessToken) return;
        setError(null);
        try {
            const supabase = createAuthenticatedSupabaseClient(session.supabaseAccessToken);
            // 3つのデータ取得を並行して実行
            await Promise.all([
                getDailyData(date, supabase),
                getMonthlyData(date, supabase),
                getSixMonthData(date, supabase)
            ]);
        } catch (err: any) {
            setError(err.message);
            console.error(err);
            setDailyLoading(false);
            setGraphLoading(false);
        }
    }, [session, getDailyData, getMonthlyData, getSixMonthData]);

    useEffect(() => {
        fetchData(selectedDate);
    }, [selectedDate, session]); // sessionの変更でも再取得

    const handleDataUpdate = () => {
        fetchData(selectedDate);
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 bg-slate-50 min-h-screen font-sans">
            <DashboardHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />
            
            <main className="mt-6 space-y-8">
                {error && <p className="text-red-500">{error}</p>}
                
                <DashboardStats data={dailyData} monthlyData={monthlyData} isLoading={dailyLoading} />
                
                <SalesChartGrid data={sixMonthData} isLoading={graphLoading} />

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                        日次データ操作 ({selectedDate.toLocaleDateString()})
                    </h3>
                    {session && (
                        <DailySalesCrudForm
                            selectedDate={(() => {
                                const year = selectedDate.getFullYear();
                                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(selectedDate.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            })()}
                            dailyData={dailyData}
                            monthlyData={monthlyData}
                            onDataUpdate={handleDataUpdate}
                            accessToken={session.supabaseAccessToken}
                        />
                    )}
                </div>

                {/* ★ ダッシュボード下部にAI分析セクションを追加 */}
                <AiDashboardSection />
            </main>
        </div>
    );
}
