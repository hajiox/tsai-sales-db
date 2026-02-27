// /app/excel-to-pdf/page.tsx — ローカル専用 Excel→PDF変換
"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
    Loader2, FileSpreadsheet, FileText, CheckCircle2, XCircle,
    AlertCircle, FolderOpen, RefreshCw, ChevronDown, ChevronRight, Play
} from "lucide-react"

interface SheetInfo {
    name: string; index: number; hasData: boolean
    rowCount: number; colCount: number; pdfExists: boolean
}
interface ExcelFileInfo {
    filename: string; baseName: string; sheetCount: number
    convertibleSheets: number; existingPdfCount: number
    outputDir: string; sheets: SheetInfo[]
}
interface SheetResult {
    sheetName: string; status: string; pdfFile?: string; error?: string
}
interface ConversionResult {
    success: boolean; baseName: string; outputDir: string
    totalSheets: number; convertedSheets: number
    successCount: number; errorCount: number; results: SheetResult[]
}

export default function ExcelToPdfPage() {
    const [files, setFiles] = useState<ExcelFileInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [converting, setConverting] = useState<string | null>(null)
    const [convertingAll, setConvertingAll] = useState(false)
    const [conversionResults, setConversionResults] = useState<Record<string, ConversionResult>>({})
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
    const [progress, setProgress] = useState<{ fileIndex: number; totalFiles: number; currentFile: string } | null>(null)

    const fetchFiles = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/excel-to-pdf")
            const data = await res.json()
            if (data.files) setFiles(data.files)
            else if (data.error) console.error(data.error)
        } catch (e) { console.error("取得エラー:", e) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchFiles() }, [fetchFiles])

    const toggle = (fn: string) => {
        setExpandedFiles(prev => {
            const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s
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
                fetchFiles()  // 既存PDFカウントを更新
            } else {
                alert(`変換エラー: ${data.error}`)
            }
        } catch (e) {
            console.error("変換エラー:", e)
            alert("変換に失敗しました")
        } finally {
            setConverting(null)
        }
    }

    const convertAll = async () => {
        setConvertingAll(true)
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            setProgress({ fileIndex: i + 1, totalFiles: files.length, currentFile: file.baseName })
            setConverting(file.filename)
            try {
                const res = await fetch("/api/excel-to-pdf", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: file.filename }),
                })
                const data = await res.json()
                if (data.success) {
                    setConversionResults(prev => ({ ...prev, [file.filename]: data }))
                }
            } catch (e) { console.error(`変換エラー (${file.filename}):`, e) }
        }
        setConverting(null)
        setProgress(null)
        setConvertingAll(false)
        fetchFiles()
    }

    const totalSheets = files.reduce((s, f) => s + f.sheetCount, 0)
    const totalConvertible = files.reduce((s, f) => s + f.convertibleSheets, 0)
    const totalPdfs = files.reduce((s, f) => s + f.existingPdfCount, 0)
    const totalSuccess = Object.values(conversionResults).reduce((s, r) => s + r.successCount, 0)

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* ヘッダー */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-3 mb-1">
                    <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                    ExcelファイルPDF化
                </h1>
                <p className="text-gray-500 text-sm">
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">C:\作業用\レシピ</code> 内のExcelファイルを読み込み、
                    各シートをPDFに変換してフォルダに直接保存します。
                </p>
            </div>

            {/* サマリー */}
            <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                    { label: "Excelファイル", value: files.length, from: "emerald-50", to: "emerald-100", border: "emerald-200", text: "emerald" },
                    { label: "総シート数", value: `${totalConvertible}/${totalSheets}`, from: "blue-50", to: "blue-100", border: "blue-200", text: "blue" },
                    { label: "既存PDF", value: totalPdfs, from: "purple-50", to: "purple-100", border: "purple-200", text: "purple" },
                    { label: "今回変換", value: totalSuccess, from: "amber-50", to: "amber-100", border: "amber-200", text: "amber" },
                ].map((c, i) => (
                    <div key={i} className={`bg-gradient-to-br from-${c.from} to-${c.to} border border-${c.border} rounded-xl p-3`}>
                        <div className={`text-xs font-medium text-${c.text}-700`}>{c.label}</div>
                        <div className={`text-2xl font-bold text-${c.text}-800 mt-0.5`}>{c.value}</div>
                    </div>
                ))}
            </div>

            {/* アクションバー */}
            <div className="flex justify-between items-center mb-4">
                <Button variant="outline" size="sm" onClick={fetchFiles} disabled={loading || convertingAll}>
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> 再読み込み
                </Button>
                <Button onClick={convertAll} disabled={convertingAll || loading || files.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {convertingAll ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />変換中...</>
                    ) : (
                        <><Play className="w-4 h-4 mr-1.5" />全ファイル一括変換 ({totalConvertible}シート)</>
                    )}
                </Button>
            </div>

            {/* 進捗バー */}
            {progress && (
                <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium text-blue-700">
                            {progress.currentFile}
                        </span>
                        <span className="text-sm text-blue-600">
                            ファイル {progress.fileIndex} / {progress.totalFiles}
                        </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((progress.fileIndex / progress.totalFiles) * 100)}%` }} />
                    </div>
                </div>
            )}

            {/* ファイル一覧 */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : files.length === 0 ? (
                <div className="text-center py-12 text-gray-500">レシピフォルダにExcelファイルが見つかりません。</div>
            ) : (
                <div className="space-y-2.5">
                    {files.map((file) => {
                        const expanded = expandedFiles.has(file.filename)
                        const result = conversionResults[file.filename]
                        const isConv = converting === file.filename

                        return (
                            <div key={file.filename} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                                {/* ファイルヘッダー */}
                                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => toggle(file.filename)}>
                                    {expanded
                                        ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm truncate">{file.baseName}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {file.convertibleSheets}シート
                                            {file.existingPdfCount > 0 && (
                                                <span className="ml-2 text-purple-600">· PDF {file.existingPdfCount}件済</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 結果バッジ */}
                                    {result && (
                                        <div className="flex items-center gap-1.5 text-xs mr-2">
                                            {result.successCount > 0 && (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" />{result.successCount}
                                                </span>
                                            )}
                                            {result.errorCount > 0 && (
                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <XCircle className="w-3 h-3" />{result.errorCount}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <Button variant="outline" size="sm"
                                        disabled={isConv || convertingAll}
                                        onClick={e => { e.stopPropagation(); convertFile(file.filename) }}
                                        className="flex-shrink-0">
                                        {isConv
                                            ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />変換中</>
                                            : <><FileText className="w-4 h-4 mr-1" />PDF変換</>}
                                    </Button>
                                </div>

                                {/* シート一覧 */}
                                {expanded && (
                                    <div className="border-t px-4 py-2 bg-gray-50">
                                        <div className="grid gap-0.5 max-h-[400px] overflow-y-auto">
                                            {file.sheets.map((sh, i) => {
                                                const sr = result?.results?.find(r => r.sheetName === sh.name)
                                                return (
                                                    <div key={i} className={`flex items-center gap-2 py-1 px-2 rounded text-sm
                            ${!sh.hasData ? 'opacity-40' : ''}`}>
                                                        <span className="text-gray-400 text-xs w-5 text-right">{i + 1}</span>
                                                        <span className="flex-1 truncate">{sh.name}</span>
                                                        {sh.hasData && (
                                                            <span className="text-[10px] text-gray-400">{sh.rowCount}行×{sh.colCount}列</span>
                                                        )}
                                                        {/* PDF存在マーク */}
                                                        {sh.pdfExists && !sr && (
                                                            <span className="text-purple-500"><FileText className="w-3.5 h-3.5" /></span>
                                                        )}
                                                        {/* 変換結果 */}
                                                        {sr?.status === 'success' && (
                                                            <span className="text-emerald-600 flex items-center gap-1 text-xs">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />{sr.pdfFile}
                                                            </span>
                                                        )}
                                                        {sr?.status === 'error' && (
                                                            <span className="text-red-600 flex items-center gap-1 text-xs">
                                                                <XCircle className="w-3.5 h-3.5" />{sr.error}
                                                            </span>
                                                        )}
                                                        {!sh.hasData && (
                                                            <span className="text-gray-400 text-xs flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3" />空
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        {/* 出力先パス */}
                                        <div className="mt-2 pt-2 border-t text-xs text-gray-500 flex items-center gap-1.5">
                                            <FolderOpen className="w-3.5 h-3.5" />
                                            出力先: <code className="bg-gray-100 px-1 rounded">{file.outputDir}</code>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 注意書き */}
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700 space-y-1">
                <h3 className="text-sm font-semibold text-amber-800 mb-1">💡 使い方</h3>
                <p>• 各Excelファイル名のフォルダが自動作成され、シート名.pdfが出力されます</p>
                <p>• 既存PDFは上書きされます</p>
                <p>• テキストベースPDF（文字選択・検索可能）で出力されます</p>
                <p>• ⚠ ローカル専用機能です（Vercel環境では動作しません）</p>
            </div>
        </div>
    )
}
