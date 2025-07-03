// /components/web-sales-ai-section.tsx (アンカー追加版)
"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

interface Props {
  month: string;
}

export default function WebSalesAiSection({ month }: Props) {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // 新機能: 分析期間とタイプの選択
  const [analysisPeriod, setAnalysisPeriod] = useState<string>('1month');
  const [analysisType, setAnalysisType] = useState<string>('comprehensive');
  
  const supabase = createClientComponentClient();

  // "YYYY-MM" 形式を "YYYY年M月" 形式に変換
  const formatMonth = (month: string | null): string => {
    if (!month) return "";
    const [year, monthNum] = month.split("-");
    return `${year}年${parseInt(monthNum, 10)}月`;
  };

  // 初回読み込み時に最新のレポートをDBから取得する
  useEffect(() => {
    const fetchLatestReport = async () => {
      setIsLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from("web_sales_ai_reports")
        .select("content, month, analysis_period, analysis_type")
        .order("month", { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !data) {
        setError("過去の分析レポートを取得できませんでした。");
      } else if (data.content) {
        setAnalysisResult(data.content);
        setLatestMonth(data.month);
        setAnalysisPeriod(data.analysis_period || '1month');
        setAnalysisType(data.analysis_type || 'comprehensive');
      } else {
        setError("分析レポートが見つかりませんでした。");
      }
      setIsLoading(false);
    };

    fetchLatestReport();
  }, [supabase]);

  // 分析実行
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    const periodText = {
      '1month': '単月',
      '3months': '3ヶ月間',
      '6months': '半年間', 
      '1year': '1年間'
    }[analysisPeriod] || '単月';
    
    const typeText = {
      'immediate': '緊急対応',
      'growth': '成長戦略',
      'comprehensive': '総合分析'
    }[analysisType] || '総合分析';

    toast.info(`${periodText}・${typeText}でAI分析を開始しました。完了まで1〜2分お待ちください。`);

    try {
      const response = await fetch("/api/web-sales-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          month,
          period: analysisPeriod,
          analysisType: analysisType
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "APIリクエストに失敗しました。");
      }

      const result = await response.json();
      
      if (result.ok && result.result) {
        setAnalysisResult(result.result);
        setLatestMonth(result.month || month);
        toast.success("WEB販売データのAI分析が完了しました。");
      } else {
        throw new Error(result.error || "分析結果を取得できませんでした。");
      }
    } catch (err: any) {
      setError(err.message || "分析中に不明なエラーが発生しました。");
      toast.error(err.message || "分析中に不明なエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div id="ai-analysis-section" className="bg-white p-6 rounded-lg shadow-md mt-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-slate-800">🤖 WEB販売AI分析レポート</h2>
        
        {/* 分析設定パネル */}
        <div className="flex flex-wrap gap-4 items-center">
          {/* 分析期間選択 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">分析期間</label>
            <select 
              value={analysisPeriod}
              onChange={(e) => setAnalysisPeriod(e.target.value)}
              className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              disabled={isAnalyzing}
            >
              <option value="1month">当月のみ</option>
              <option value="3months">過去3ヶ月</option>
              <option value="6months">過去半年</option>
              <option value="1year">過去1年</option>
            </select>
          </div>
          
          {/* 分析タイプ選択 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">分析タイプ</label>
            <select 
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              disabled={isAnalyzing}
            >
              <option value="comprehensive">総合分析</option>
              <option value="immediate">緊急対応分析</option>
              <option value="growth">成長戦略分析</option>
            </select>
          </div>
          
          {/* 分析実行ボタン */}
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || isLoading}
            className={`px-4 py-2 font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 ${
              isAnalyzing 
                ? 'bg-purple-600 text-white cursor-not-allowed transform scale-105' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } ${isLoading ? 'bg-slate-400 cursor-not-allowed' : ''}`}
          >
            {isAnalyzing ? (
              <div className="flex items-center space-x-2">
                {/* 回転するブレインアイコン */}
                <div className="relative">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 w-5 h-5 border border-white/30 rounded-full animate-ping"></div>
                </div>
                <span className="animate-pulse">AIが考えています...</span>
                {/* 点滅するドット */}
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            ) : (
              "AI分析実行"
            )}
          </button>
        </div>
      </div>

      {/* 現在の設定表示 */}
      <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
        <div className="flex flex-wrap gap-4 text-sm text-blue-700">
          <span>📊 対象: {formatMonth(month)}</span>
          <span>📅 期間: {{
            '1month': '単月分析',
            '3months': '3ヶ月トレンド分析', 
            '6months': '半年間戦略分析',
            '1year': '年間総合分析'
          }[analysisPeriod]}</span>
          <span>🎯 目的: {{
            'comprehensive': '総合的な売上拡大策',
            'immediate': '即効性のある改善策',
            'growth': '中長期的な成長戦略'
          }[analysisType]}</span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-md min-h-[300px] border border-slate-200 relative overflow-hidden">
        {/* 分析中のオーバーレイアニメーション */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-50 to-blue-50 flex items-center justify-center z-10">
            <div className="text-center space-y-4">
              {/* メインAIアイコン */}
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 w-16 h-16 border-4 border-purple-200 rounded-full animate-spin"></div>
                <div className="absolute inset-2 w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1s'}}></div>
                <div className="absolute inset-4 w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse flex items-center justify-center">
                  <span className="text-white text-sm font-bold">AI</span>
                </div>
              </div>
              
              {/* 動的メッセージ */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-700 animate-pulse">
                  🤖 AI分析実行中
                </h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <div className="animate-fadeIn">📊 売上データを解析しています...</div>
                  <div className="animate-fadeIn" style={{animationDelay: '1s'}}>📈 トレンドパターンを分析中...</div>
                  <div className="animate-fadeIn" style={{animationDelay: '2s'}}>🎯 改善策を生成しています...</div>
                </div>
              </div>
              
              {/* プログレスバー風アニメーション */}
              <div className="w-64 mx-auto">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"></div>
                </div>
                <div className="text-xs text-slate-500 mt-1 animate-pulse">
                  通常1〜2分で完了します...
                </div>
              </div>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <p className="text-slate-500 text-center pt-10">最新のレポートを読み込んでいます...</p>
        ) : error ? (
          <p className="text-red-500 text-center pt-10">{error}</p>
        ) : analysisResult ? (
          <div>
            <h3 className="font-semibold text-slate-700 mb-3">
              {formatMonth(latestMonth)} の売上拡大分析レポート
            </h3>
            <div className="text-slate-600 whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          </div>
        ) : (
           <p className="text-slate-500 text-center pt-10">表示できる分析レポートがありません。</p>
        )}
      </div>
      
      {/* カスタムアニメーション */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
