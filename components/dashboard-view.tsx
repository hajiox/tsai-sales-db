// components/ai-analysis-widget.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  selectedDate: Date;
}

export default function AIAnalysisWidget({ selectedDate }: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError("");
    setAnalysisResult("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate.toISOString().slice(0, 10)
        })
      });

      const data = await response.json();

      if (data.ok) {
        setAnalysisResult(data.result);
        toast.success("AI分析が完了しました");
      } else {
        setError(data.error || "分析に失敗しました");
        toast.error("分析エラー: " + (data.error || "不明なエラー"));
      }
    } catch (err) {
      setError("ネットワークエラーが発生しました");
      toast.error("通信エラーが発生しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-blue-600" />
          AI分析レポート
        </CardTitle>
        <Button 
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          variant="outline"
          size="sm"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4 mr-2" />
              最新データで再解析
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-start gap-2 p-4 border border-red-200 bg-red-50 rounded-lg mb-4">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-800 font-medium">分析エラー</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <p className="text-red-600 text-xs mt-2">
                売上データが入力されているか確認してください。データが不足している場合、正確な分析ができません。
              </p>
            </div>
          </div>
        )}
        
        {analysisResult ? (
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
              {analysisResult}
            </div>
          </div>
        ) : !error && (
          <div className="text-center py-8 text-gray-500">
            <Brain className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">「最新データで再解析」ボタンを押してAI分析を実行してください</p>
            <p className="text-xs mt-1 text-gray-400">
              選択された日付: {selectedDate.toLocaleDateString('ja-JP')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
