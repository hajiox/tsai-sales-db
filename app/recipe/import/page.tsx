// app/recipe/import/page.tsx
// Excelインポートページ

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface ImportResult {
    fileName: string;
    sheetName: string;
    status: "success" | "error" | "skipped";
    message: string;
    recipeName?: string;
}

export default function RecipeImportPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<ImportResult[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(Array.from(e.target.files));
            setResults([]);
        }
    };

    const handleImport = async () => {
        if (selectedFiles.length === 0) return;

        setImporting(true);
        setProgress(0);
        setResults([]);

        const formData = new FormData();
        selectedFiles.forEach((file) => {
            formData.append("files", file);
        });

        try {
            const response = await fetch("/api/recipe/import", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("インポートに失敗しました");
            }

            const data = await response.json();
            setResults(data.results || []);
            setProgress(100);
        } catch (error) {
            console.error("Import error:", error);
            setResults([
                {
                    fileName: "Error",
                    sheetName: "",
                    status: "error",
                    message: "インポート中にエラーが発生しました",
                },
            ]);
        } finally {
            setImporting(false);
        }
    };

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" onClick={() => router.push("/recipe")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6" />
                        Excelインポート
                    </h1>
                    <p className="text-gray-600">既存のレシピExcelファイルをインポートします</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upload Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>ファイル選択</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 mb-2">
                                クリックしてファイルを選択、またはドラッグ＆ドロップ
                            </p>
                            <p className="text-sm text-gray-400">
                                .xlsx, .xls ファイルに対応
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                multiple
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </div>

                        {selectedFiles.length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-medium mb-2">選択されたファイル:</h4>
                                <ul className="space-y-2">
                                    {selectedFiles.map((file, index) => (
                                        <li
                                            key={index}
                                            className="flex items-center gap-2 text-sm text-gray-600"
                                        >
                                            <FileSpreadsheet className="w-4 h-4" />
                                            {file.name}
                                            <span className="text-gray-400">
                                                ({(file.size / 1024).toFixed(1)} KB)
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <Button
                            className="w-full mt-4"
                            onClick={handleImport}
                            disabled={selectedFiles.length === 0 || importing}
                        >
                            {importing ? "インポート中..." : "インポート開始"}
                        </Button>

                        {importing && (
                            <div className="mt-4">
                                <Progress value={progress} className="h-2" />
                                <p className="text-sm text-gray-500 mt-1 text-center">
                                    処理中... {progress}%
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Instructions */}
                <Card>
                    <CardHeader>
                        <CardTitle>インポートについて</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <h4 className="font-medium mb-2">対応ファイル形式</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• 【重要】【製造】総合管理（新型）.xlsx</li>
                                <li>• 各シートが1レシピとして読み込まれます</li>
                                <li>• 商品名、材料、原価、栄養成分が抽出されます</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-medium mb-2">抽出される情報</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• 商品名・開発日・販売価格</li>
                                <li>• 材料名・入数・単価・使用量・原価</li>
                                <li>• 栄養成分（熱量、タンパク質、脂質、炭水化物、食塩）</li>
                            </ul>
                        </div>

                        <div className="p-3 bg-yellow-50 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                                <div>
                                    <h4 className="font-medium text-yellow-800">注意事項</h4>
                                    <p className="text-sm text-yellow-700">
                                        同じ商品名のレシピが既に存在する場合はスキップされます。
                                        上書きする場合は既存のレシピを削除してください。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Results */}
            {results.length > 0 && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>インポート結果</span>
                            <div className="flex gap-4 text-sm font-normal">
                                <span className="text-green-600">成功: {successCount}</span>
                                <span className="text-red-600">エラー: {errorCount}</span>
                                <span className="text-gray-500">スキップ: {skippedCount}</span>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-96 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-white">
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-3">ステータス</th>
                                        <th className="text-left py-2 px-3">ファイル</th>
                                        <th className="text-left py-2 px-3">シート/レシピ名</th>
                                        <th className="text-left py-2 px-3">メッセージ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((result, index) => (
                                        <tr key={index} className="border-b">
                                            <td className="py-2 px-3">
                                                {result.status === "success" && (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                )}
                                                {result.status === "error" && (
                                                    <XCircle className="w-5 h-5 text-red-500" />
                                                )}
                                                {result.status === "skipped" && (
                                                    <AlertCircle className="w-5 h-5 text-gray-400" />
                                                )}
                                            </td>
                                            <td className="py-2 px-3 max-w-[200px] truncate">
                                                {result.fileName}
                                            </td>
                                            <td className="py-2 px-3">
                                                {result.recipeName || result.sheetName}
                                            </td>
                                            <td className="py-2 px-3 text-gray-600">
                                                {result.message}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
