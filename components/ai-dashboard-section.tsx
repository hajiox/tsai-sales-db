"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

export default function AiDashboardSection() {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
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
        .from("ai_reports")
        .select("content, month")
        .order("month", { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !data) {
        setError("過去の分析レポートを取得できませんでした。");
      } else if (data.content) {
        // 修正: contentは既に文字列形式
        setAnalysisResult(data.content);
        setLatestMonth(data.month);
      } else {
        setError("分析レポートが見つかりませんでした。");
      }
      setIsLoading(false);
    };

    fetchLatestReport();
  }, [supabase]);

  // 「再解析」ボタンが押された時の処理
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    toast.info("AI分析を開始しました。完了まで1〜2分お待ちください。");

    try {
      // 現在の日付を送信
      const today = new Date().toISOString().slice(0, 10);
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: today })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "APIリクエストに失敗しました。");
      }

      const result = await response.json();
      
      if (result.ok && result.result) {
        // 修正: APIの新しいレスポンス形式に対応
        setAnalysisResult(result.result);
        setLatestMonth(result.meta?.month || today.slice(0, 7));
        toast.success("AI分析が完了しました。");
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
    <div className="bg-white p-6 rounded-lg shadow-md mt-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-slate-800">AI分析レポート</h2>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isLoading}
          className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "分析中..." : "最新データで再解析"}
        </button>
      </div>

      <div className="bg-slate-50 p-4 rounded-md min-h-[150px] border border-slate-200">
        {isLoading ? (
          <p className="text-slate-500 text-center pt-10">最新のレポートを読み込んでいます...</p>
        ) : error ? (
          <p className="text-red-500 text-center pt-10">{error}</p>
        ) : analysisResult ? (
          <div>
            <h3 className="font-semibold text-slate-700 mb-2">{formatMonth(latestMonth)} の分析レポート</h3>
            <div className="text-slate-600 whitespace-pre-wrap">
              {analysisResult}
            </div>
          </div>
        ) : (
           <p className="text-slate-500 text-center pt-10">表示できる分析レポートがありません。</p>
        )}
      </div>
    </div>
  );
}
