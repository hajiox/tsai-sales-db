// /app/excel-to-pdf/page.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, FileSpreadsheet, FileText, CheckCircle2, XCircle, AlertCircle, FolderOpen, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"

interface SheetResult {
    sheetName: string
    status: 'success' | 'error' | 'skipped'
    pdfPath?: string
    error?: string
}

interface ExcelFileInfo {
    filename: string
    baseName: string
    sheetNames: string[]
    sheetCount: number
    existingPdfCount: number
}

interface ConversionResult {
    success: boolean
    baseName: string
    outputDir: string
    results: SheetResult[]
    totalSheets: number
    successCount: number
    errorCount: number
    skippedCount: number
}

export default function ExcelToPdfPage() {
    const [files, setFiles] = useState<ExcelFileInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [converting, setConverting] = useState<string | null>(null)
    const [convertingAll, setConvertingAll] = useState(false)
    const [conversionResults, setConversionResults] = useState<Record<string, ConversionResult>>({})
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
    const [progress, setProgress] = useState<{ current: number; total: number; currentFile: string; currentSheet: string } | null>(null)

    const fetchFiles = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/excel-to-pdf")
            const data = await res.json()
            if (data.files) {
                setFiles(data.files)
            }
        } catch (error) {
            console.error("ファイル一覧取得エラー:", error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchFiles()
    }, [fetchFiles])

    const toggleExpand = (filename: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev)
            if (next.has(filename)) {
                next.delete(filename)
            } else {
                next.add(filename)
            }
            return next
        })
    }

    const convertFile = async (filename: string) => {
        setConverting(filename)
        try {
            const res = await fetch("/api/excel-to-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename }),
            })
            const data = await res.json()
            if (data.success) {
                setConversionResults(prev => ({ ...prev, [filename]: data }))
                setExpandedFiles(prev => new Set(prev).add(filename))
                // ファイル一覧をリフレッシュ
                fetchFiles()
            } else {
                alert(`変換エラー: ${data.error}`)
            }
        } catch (error) {
            console.error("変換エラー:", error)
            alert("変換に失敗しました")
        } finally {
            setConverting(null)
        }
    }

    const convertAll = async () => {
        setConvertingAll(true)
        const totalSheets = files.reduce((sum, f) => sum + f.sheetCount, 0)
        let processedSheets = 0

        for (const file of files) {
            setProgress({
                current: processedSheets,
                total: totalSheets,
                currentFile: file.baseName,
                currentSheet: '',
            })

            try {
                const res = await fetch("/api/excel-to-pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: file.filename }),
                })
                const data = await res.json()
                if (data.success) {
                    setConversionResults(prev => ({ ...prev, [file.filename]: data }))
                    processedSheets += file.sheetCount
                }
            } catch (error) {
                console.error(`変換エラー (${file.filename}):`, error)
            }
        }

        setProgress(null)
        setConvertingAll(false)
        fetchFiles()
    }

    const totalSheets = files.reduce((sum, f) => sum + f.sheetCount, 0)
    const totalExistingPdfs = files.reduce((sum, f) => sum + f.existingPdfCount, 0)
    const totalSuccess = Object.values(conversionResults).reduce((sum, r) => sum + r.successCount, 0)

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* ヘッダー */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold flex items-center gap-3 mb-2">
                    <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                    ExcelファイルPDF化
                </h1>
                <p className="text-gray-500 text-sm">
                    レシピフォルダ内のExcelファイルを読み込み、各シートをPDFに変換します。
                    AIが正確にデータを読み取れるよう、文字認識に最適化されたPDFを生成します。
                </p>
            </div>

            {/* サマリーカード */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4">
                    <div className="text-sm font-medium text-emerald-700">Excelファイル</div>
                    <div className="text-3xl font-bold text-emerald-800 mt-1">{files.length}</div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
                    <div className="text-sm font-medium text-blue-700">総シート数</div>
                    <div className="text-3xl font-bold text-blue-800 mt-1">{totalSheets}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
                    <div className="text-sm font-medium text-purple-700">既存PDF</div>
                    <div className="text-3xl font-bold text-purple-800 mt-1">{totalExistingPdfs}</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4">
                    <div className="text-sm font-medium text-amber-700">今回変換済み</div>
                    <div className="text-3xl font-bold text-amber-800 mt-1">{totalSuccess}</div>
                </div>
            </div>

            {/* アクションバー */}
            <div className="flex justify-between items-center mb-4">
                <Button variant="outline" size="sm" onClick={fetchFiles} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    再読み込み
                </Button>
                <Button
                    onClick={convertAll}
                    disabled={convertingAll || loading || files.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    {convertingAll ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            変換中...
                        </>
                    ) : (
                        <>
                            <FileText className="w-4 h-4 mr-2" />
                            全ファイル一括変換 ({totalSheets}シート)
                        </>
                    )}
                </Button>
            </div>

            {/* プログレスバー */}
            {progress && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-blue-700">
                            処理中: {progress.currentFile}
                        </span>
                        <span className="text-sm text-blue-600">
                            {progress.current} / {progress.total} シート
                        </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-3">
                        <div
                            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ファイル一覧 */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : files.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    レシピフォルダにExcelファイルが見つかりません。
                </div>
            ) : (
                <div className="space-y-3">
                    {files.map((file) => {
                        const isExpanded = expandedFiles.has(file.filename)
                        const result = conversionResults[file.filename]
                        const isConverting = converting === file.filename

                        return (
                            <div key={file.filename} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                                {/* ファイルヘッダー */}
                                <div
                                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => toggleExpand(file.filename)}
                                >
                                    <div className="flex-shrink-0">
                                        {isExpanded ? (
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-gray-400" />
                                        )}
                                    </div>
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm truncate">{file.baseName}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {file.sheetCount}シート
                                            {file.existingPdfCount > 0 && (
                                                <span className="ml-2 text-purple-500">
                                                    · 既存PDF: {file.existingPdfCount}件
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ステータスバッジ */}
                                    {result && (
                                        <div className="flex items-center gap-1 text-xs">
                                            {result.successCount > 0 && (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> {result.successCount}
                                                </span>
                                            )}
                                            {result.errorCount > 0 && (
                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <XCircle className="w-3 h-3" /> {result.errorCount}
                                                </span>
                                            )}
                                            {result.skippedCount > 0 && (
                                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> {result.skippedCount}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isConverting || convertingAll}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            convertFile(file.filename)
                                        }}
                                        className="flex-shrink-0"
                                    >
                                        {isConverting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                                変換中
                                            </>
                                        ) : (
                                            <>
                                                <FileText className="w-4 h-4 mr-1" />
                                                PDF変換
                                            </>
                                        )}
                                    </Button>
                                </div>

                                {/* シート一覧（展開時） */}
                                {isExpanded && (
                                    <div className="border-t px-4 py-2 bg-gray-50">
                                        <div className="grid gap-1">
                                            {file.sheetNames.map((sheetName, idx) => {
                                                const sheetResult = result?.results?.find(
                                                    (r) => r.sheetName === sheetName
                                                )
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center gap-2 py-1 px-2 rounded text-sm"
                                                    >
                                                        <span className="text-gray-400 text-xs w-6 text-right">{idx + 1}.</span>
                                                        <span className="flex-1 truncate">{sheetName}</span>
                                                        {sheetResult && (
                                                            <>
                                                                {sheetResult.status === 'success' && (
                                                                    <span className="text-emerald-600 flex items-center gap-1 text-xs">
                                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                                        {sheetResult.pdfPath}
                                                                    </span>
                                                                )}
                                                                {sheetResult.status === 'error' && (
                                                                    <span className="text-red-600 flex items-center gap-1 text-xs">
                                                                        <XCircle className="w-3.5 h-3.5" />
                                                                        {sheetResult.error}
                                                                    </span>
                                                                )}
                                                                {sheetResult.status === 'skipped' && (
                                                                    <span className="text-gray-500 flex items-center gap-1 text-xs">
                                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                                        空シート
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {result && (
                                            <div className="mt-2 pt-2 border-t text-xs text-gray-500 flex items-center gap-2">
                                                <FolderOpen className="w-3.5 h-3.5" />
                                                出力先: {result.outputDir}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 注意事項 */}
            <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">💡 使い方</h3>
                <ul className="text-xs text-amber-700 space-y-1">
                    <li>• 各Excelファイル名のフォルダが自動作成され、シート名のPDFが出力されます</li>
                    <li>• 文字が認識できるクオリティ（テキストベースPDF）で出力されます</li>
                    <li>• 既存のPDFファイルは上書きされます</li>
                    <li>• 一括変換は全ファイルの全シートを順次処理します（大量のシートがある場合は時間がかかります）</li>
                </ul>
            </div>
        </div>
    )
}
