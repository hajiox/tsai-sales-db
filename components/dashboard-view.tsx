// /components/dashboard-view.tsx ver.7 (SalesTop10Summaryを動的インポート)

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";
import dynamic from 'next/dynamic';

import DashboardHeader from './dashboard-header';
import ClientDate from '@/components/common/ClientDate';
import SalesSummaryTable from './sales-summary-table';
import DailySalesCrudForm from './daily-sales-crud-form';
import AiDashboardSection from './ai-dashboard-section';

// SalesChartGridを動的にインポートし、サーバーサイドレンダリング(SSR)を無効化
const SalesChartGrid = dynamic(() => import('./sales-chart-grid'), { ssr: false });

// SalesTop10Summaryも動的にインポートし、SSRを無効化
const SalesTop10Summary = dynamic(() => import('./sales-top10-summary'), { ssr: false });

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

    // 日次データを取得
    const getDailyData = useCallback(async (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        const response = await fetch(`/api/sales/daily?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '日次データの取得に失敗しました');
        }
        const result = await response.json();
        setDailyData(result.data || {});
    }, []);

    // 月累計データを取得
    const getMonthlyData = useCallback(async (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        const response = await fetch(`/api/sales/monthly?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '月累計データの取得に失敗しました');
        }
        const result = await response.json();
        setMonthlyData(result.data || {});
    }, []);
    
    // 過去6ヶ月データを取得
    const getSixMonthData = useCallback(async (date: Date) => {
        const dateString = date.toISOString().split('T')[0];
        
        const response = await fetch(`/api/sales/six-month?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'グラフデータの取得に失敗しました');
        }
        const result = await response.json();
        setSixMonthData(result.data || []);
    }, []);

    // 全てのデータを並行して取得（ローディング処理も一元管理）
    const fetchData = useCallback(async (date: Date) => {
        if (!session) return;
        
        setError(null);
        setDailyLoading(true);
        setGraphLoading(true);

        try {
            await Promise.all([
                getDailyData(date),
                getMonthlyData(date),
                getSixMonthData(date)
            ]);
        } catch (err: any) {
            setError(err.message);
            console.error("データ取得エラー:", err);
        } finally {
            // 成功・失敗に関わらずローディングを終了
            setDailyLoading(false);
            setGraphLoading(false);
        }
    }, [session, getDailyData, getMonthlyData, getSixMonthData]);

    useEffect(() => {
        if (session) {
            fetchData(selectedDate);
        }
    }, [selectedDate, session, fetchData]);

    const handleDataUpdate = () => {
        fetchData(selectedDate);
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 bg-slate-50 min-h-screen font-sans">
            <div className="text-right text-sm text-slate-600"><ClientDate /></div>
            <DashboardHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />
            
            <main className="mt-6 space-y-8">
                {error && <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-md"><p className="font-bold">エラーが発生しました:</p><p>{error}</p></div>}
                
                <SalesSummaryTable
                    dailyData={dailyData}
                    monthlyData={monthlyData}
                    isLoading={dailyLoading}
                />
                
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

                <SalesTop10Summary />

                <AiDashboardSection />
            </main>
        </div>
    );
}
