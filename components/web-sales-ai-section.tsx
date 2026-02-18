// /components/web-sales-ai-section.tsx ver.12 (3項目特化版)
"use client"

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Calendar,
  Sparkles,
  Target,
  BarChart2
} from 'lucide-react';

interface WebSalesAISectionProps {
  month: string;
}

interface AnalysisResult {
  seriesAnalysis: string;
  yoyEvaluation: string;
  productTrends: string;
}

export default function WebSalesAISection({ month }: WebSalesAISectionProps) {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const response = await fetch('/api/web-sales-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });

      const data = await response.json();

      if (data.ok && data.result) {
        const sections = parseAIResult(data.result);
        setAnalysisResult(sections);
      } else {
        setError(data.error || '分析に失敗しました');
      }
    } catch (err) {
      setError('分析中にエラーが発生しました');
      console.error('AI分析エラー:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const parseAIResult = (result: string): AnalysisResult => {
    if (!result || typeof result !== 'string') {
      return {
        seriesAnalysis: 'データなし',
        yoyEvaluation: 'データなし',
        productTrends: 'データなし',
      };
    }

    try {
      return {
        seriesAnalysis: extractSection(result, '① 直近3ヶ月のシリーズ別特異点') || 'データを分析中です',
        yoyEvaluation: extractSection(result, '② シリーズ別 前年比の評価') || 'データを分析中です',
        productTrends: extractSection(result, '③ 急上昇・急落商品の解説') || 'データを分析中です',
      };
    } catch (error) {
      console.error('AI結果パースエラー:', error);
      return {
        seriesAnalysis: result,
        yoyEvaluation: '',
        productTrends: '',
      };
    }
  };

  const extractSection = (text: string, sectionTitle: string): string => {
    if (!text || !sectionTitle) return '';

    try {
      // 厳密な正規表現ではなく、柔軟にマッチさせる
      const escapedTitle = sectionTitle.replace(/[①②③]/g, (match) => `\\${match}`);
      const regex = new RegExp(`##\\s*${escapedTitle}([\\s\\S]*?)(?=##\\s*[①②③]|$)`, 'i');
      const match = text.match(regex);
      return match && match[1] ? match[1].trim() : '';
    } catch (error) {
      console.error('セクション抽出エラー:', error);
      return '';
    }
  };

  const analysisItems = [
    {
      id: 'seriesAnalysis',
      title: '直近3ヶ月のシリーズ別特異点',
      icon: BarChart2,
      color: 'bg-blue-50 border-blue-200',
      iconColor: 'text-blue-600',
      content: analysisResult?.seriesAnalysis
    },
    {
      id: 'yoyEvaluation',
      title: 'シリーズ別 前年比の評価',
      icon: Calendar,
      color: 'bg-purple-50 border-purple-200',
      iconColor: 'text-purple-600',
      content: analysisResult?.yoyEvaluation
    },
    {
      id: 'productTrends',
      title: '急上昇・急落商品の解説',
      icon: TrendingUp,
      color: 'bg-green-50 border-green-200',
      iconColor: 'text-green-600',
      content: analysisResult?.productTrends
    }
  ];

  return (
    <div id="ai-analysis-section" className="space-y-6">
      <Card className="bg-gradient-to-r from-indigo-50 to-cyan-50 border-indigo-200">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl font-bold text-indigo-800">
            <Sparkles className="w-8 h-8 text-yellow-500" />
            WEB販売 AI分析レポート (Gemini 2.0)
            <Target className="w-8 h-8 text-indigo-600" />
          </CardTitle>
          <p className="text-indigo-600 font-medium">{month} の売上データを3つの重要観点で徹底分析</p>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            onClick={executeAnalysis}
            disabled={isLoading}
            size="lg"
            className="bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white px-8 py-3 text-lg font-semibold shadow-lg transform transition hover:scale-105"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-6 h-6 border-2 border-white/30 rounded-full animate-spin"></div>
                  <div className="absolute inset-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                    style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
                </div>
                <span>Gemini Pro 分析中...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI分析を実行
              </div>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <span className="font-medium">エラー: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisResult && (
        <div className="grid grid-cols-1 gap-6">
          {analysisItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Card key={item.id} className={`${item.color} transition-all duration-300 hover:shadow-lg`}>
                <CardHeader className="pb-3 border-b border-gray-100/50">
                  <CardTitle className="flex items-center gap-3 text-xl font-bold">
                    <div className={`p-2 rounded-lg bg-white/80 ${item.iconColor} shadow-sm`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="prose prose-sm max-w-none">
                    {item.content && item.content.trim() ? (
                      <div className="whitespace-pre-line leading-relaxed text-gray-800 text-base">
                        {item.content}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">
                        分析中...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading && !analysisResult && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white animate-pulse border-gray-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                  <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
