// /components/web-sales-ai-section.tsx ver.11 (今月の特徴対応版)
"use client"

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BarChart3, 
  AlertTriangle, 
  FileText,
  Sparkles,
  Target
} from 'lucide-react';

interface WebSalesAISectionProps {
  month: string;
}

interface AnalysisResult {
  summary: string;
  comparison: string;
  growing: string;
  declining: string;
  channels: string;
  anomalies: string;
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
        summary: 'データなし',
        comparison: 'データなし',
        growing: 'データなし',
        declining: 'データなし',
        channels: 'データなし',
        anomalies: 'データなし'
      };
    }

    try {
      return {
        summary: extractSection(result, '① 今月の特徴') || 'データを分析中です',
        comparison: extractSection(result, '② 前年同月対比') || 'データを分析中です',
        growing: extractSection(result, '③ 伸びている商品') || 'データを分析中です',
        declining: extractSection(result, '④ 落ち込んでいる商品') || 'データを分析中です',
        channels: extractSection(result, '⑤ 各ECの伸び落ち検証') || 'データを分析中です',
        anomalies: extractSection(result, '⑥ 特異点') || 'データを分析中です'
      };
    } catch (error) {
      console.error('AI結果パースエラー:', error);
      return {
        summary: result,
        comparison: '',
        growing: '',
        declining: '',
        channels: '',
        anomalies: ''
      };
    }
  };

  const extractSection = (text: string, sectionTitle: string): string => {
    if (!text || !sectionTitle) return '';
    
    try {
      const regex = new RegExp(`##\\s*${sectionTitle.replace(/[①②③④⑤⑥]/g, (match) => `\\${match}`)}([\\s\\S]*?)(?=##\\s*[①②③④⑤⑥]|$)`, 'i');
      const match = text.match(regex);
      return match && match[1] ? match[1].trim() : '';
    } catch (error) {
      console.error('セクション抽出エラー:', error);
      return '';
    }
  };

  const analysisItems = [
    {
      id: 'summary',
      title: '今月の特徴',
      icon: FileText,
      color: 'bg-blue-50 border-blue-200',
      iconColor: 'text-blue-600',
      content: analysisResult?.summary
    },
    {
      id: 'comparison',
      title: '前年同月対比',
      icon: Calendar,
      color: 'bg-purple-50 border-purple-200',
      iconColor: 'text-purple-600',
      content: analysisResult?.comparison
    },
    {
      id: 'growing',
      title: '伸びている商品',
      icon: TrendingUp,
      color: 'bg-green-50 border-green-200',
      iconColor: 'text-green-600',
      content: analysisResult?.growing
    },
    {
      id: 'declining',
      title: '落ち込んでいる商品',
      icon: TrendingDown,
      color: 'bg-red-50 border-red-200',
      iconColor: 'text-red-600',
      content: analysisResult?.declining
    },
    {
      id: 'channels',
      title: '各ECの伸び落ち検証',
      icon: BarChart3,
      color: 'bg-orange-50 border-orange-200',
      iconColor: 'text-orange-600',
      content: analysisResult?.channels
    },
    {
      id: 'anomalies',
      title: '特異点',
      icon: AlertTriangle,
      color: 'bg-yellow-50 border-yellow-200',
      iconColor: 'text-yellow-600',
      content: analysisResult?.anomalies
    }
  ];

  return (
    <div id="ai-analysis-section" className="space-y-6">
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl font-bold text-purple-800">
            <Sparkles className="w-8 h-8" />
            WEB販売 AI分析レポート
            <Target className="w-8 h-8" />
          </CardTitle>
          <p className="text-purple-600 font-medium">{month} の売上データを6つの観点で徹底分析</p>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            onClick={executeAnalysis}
            disabled={isLoading}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg font-semibold shadow-lg"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-6 h-6 border-2 border-white/30 rounded-full animate-spin"></div>
                  <div className="absolute inset-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" 
                       style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
                </div>
                <span>AIが分析中...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI分析を実行
                <Target className="w-5 h-5" />
              </div>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">エラー: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisResult && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {analysisItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Card key={item.id} className={`${item.color} transition-all duration-300 hover:shadow-lg`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg font-bold">
                    <div className={`p-2 rounded-lg bg-white/80 ${item.iconColor}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    {item.content && item.content.trim() ? (
                      <div className="whitespace-pre-line leading-relaxed text-gray-700">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {analysisItems.map((item) => (
            <Card key={item.id} className={`${item.color} animate-pulse`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg font-bold">
                  <div className={`p-2 rounded-lg bg-white/80 ${item.iconColor}`}>
                    <div className="w-5 h-5 bg-gray-300 rounded"></div>
                  </div>
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-300 rounded w-full"></div>
                  <div className="h-4 bg-gray-300 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-300 rounded w-4/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
