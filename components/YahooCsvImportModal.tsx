// /app/components/YahooCsvImportModal.tsx ver.1
// Yahoo CSVインポートモーダル（楽天パターンベース・統一アーキテクチャ適用）

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Check, X, AlertCircle, FileText } from "lucide-react";

interface YahooCsvImportModalProps {
  onImportComplete: () => void;
  selectedMonth: string;
}

interface MatchedProduct {
  productTitle: string;
  quantity: number;
  score: number;
  productInfo: { id: string; name: string } | null;
  isLearned: boolean;
}

interface ParseResult {
  success: boolean;
  summary: {
    totalProducts: number;
    matchedProducts: number;
    unmatchedProducts: number;
    learnedMatches: number;
    blankTitleInfo: {
      count: number;
      totalQuantity: number;
    };
  };
  matchedProducts: MatchedProduct[];
  blankTitleProducts: any[];
  csvRowCount: number;
}

export default function YahooCsvImportModal({ onImportComplete, selectedMonth }: YahooCsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // ファイル選択処理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParseResult(null);
      setError(null);
    }
  };

  // CSV解析処理
  const handleAnalyze = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const csvData = await file.text();
      
      const response = await fetch('/api/import/yahoo-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData }),
      });

      const result = await response.json();

      if (result.success) {
        setParseResult(result);
        console.log('Yahoo CSV解析成功:', result.summary);
      } else {
        setError(result.error || 'CSV解析に失敗しました');
      }
    } catch (err) {
      console.error('Yahoo CSV解析エラー:', err);
      setError('CSV解析中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 確定処理
  const handleConfirm = async () => {
    if (!parseResult?.matchedProducts) {
      setError('解析結果がありません');
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const response = await fetch('/api/import/yahoo-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchedProducts: parseResult.matchedProducts,
          targetMonth: selectedMonth
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('Yahoo CSV確定成功:', result);
        setIsOpen(false);
        resetState();
        onImportComplete();
      } else {
        setError(result.error || '確定処理に失敗しました');
      }
    } catch (err) {
      console.error('Yahoo CSV確定エラー:', err);
      setError('確定処理中にエラーが発生しました');
    } finally {
      setIsConfirming(false);
    }
  };

  // 状態リセット
  const resetState = () => {
    setFile(null);
    setParseResult(null);
    setError(null);
    setIsLoading(false);
    setIsConfirming(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
        >
          <FileText className="h-4 w-4 mr-2" />
          Yahoo CSV
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            Yahoo売上CSVインポート（{selectedMonth}）
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ファイル選択セクション */}
          <div className="space-y-2">
            <Label htmlFor="yahoo-csv-file">Yahoo売上CSV選択</Label>
            <Input
              id="yahoo-csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isLoading || isConfirming}
            />
            <p className="text-sm text-gray-500">
              Yahoo売上CSV形式（商品名：A列、数量：F列）に対応
            </p>
          </div>

          {/* エラー表示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
