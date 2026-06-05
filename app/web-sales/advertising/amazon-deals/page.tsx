"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    Download,
    FileSpreadsheet,
    History,
    Percent,
    RotateCcw,
    Save,
    Search,
    Trash2,
    Upload,
    XCircle,
} from "lucide-react"
import type {
    AmazonDealCellValue,
    AmazonDealColumn,
    AmazonDealColumnRole,
    AmazonDealHistoryDetail,
    AmazonDealHistoryPayload,
    AmazonDealHistorySummary,
    AmazonDealParseResult,
    AmazonDealRow,
} from "@/lib/amazon-deals-types"

const YES = "はい"
const NO = "いいえ"
type DealTypeFilter = "all" | "lightning" | "best"

const preferredRoles: AmazonDealColumnRole[] = [
    "productName",
    "dealType",
    "sku",
    "participating",
    "schedule",
    "startDate",
    "endDate",
    "sellerPrice",
    "dealPrice",
    "committedUnits",
    "sellerQuantity",
]

const dealTypeCards: Array<{
    key: Exclude<DealTypeFilter, "all">
    title: string
    label: string
    tone: "amber" | "blue"
    description: string
    notes: string[]
}> = [
    {
        key: "lightning",
        title: "数量限定タイムセール",
        label: "数量限定",
        tone: "amber",
        description: "短時間・数量枠で販売するタイムセール。最低数量とセール価格を明確に決める運用に向いています。",
        notes: [
            "実施週は選べても、日付・時刻はAmazon側で確定されます。",
            "数量に上限があるため、在庫と確定数の確認が重要です。",
            "セール価格・最低数量の入力が必要です。",
        ],
    },
    {
        key: "best",
        title: "おすすめタイムセール",
        label: "おすすめ",
        tone: "blue",
        description: "期間型のおすすめ枠。複数日程の提案から、商品ごとのセール価格をそろえて参加させる運用に向いています。",
        notes: [
            "Amazon推奨ファイル内の対象スケジュールから期間を選びます。",
            "商品ごとのセール価格、必要に応じて確定数を確認します。",
            "旧来のお買い得情報/Best Deal系の扱いとして確認します。",
        ],
    },
]

export default function AmazonDealsPage() {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [parsed, setParsed] = useState<AmazonDealParseResult | null>(null)
    const [rows, setRows] = useState<AmazonDealRow[]>([])
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
    const [query, setQuery] = useState("")
    const [participationFilter, setParticipationFilter] = useState<"all" | "yes" | "no" | "warning">("all")
    const [dealTypeFilter, setDealTypeFilter] = useState<DealTypeFilter>("all")
    const [discountPercent, setDiscountPercent] = useState("10")
    const [bulkSchedule, setBulkSchedule] = useState("")
    const [bulkStartDate, setBulkStartDate] = useState("")
    const [bulkEndDate, setBulkEndDate] = useState("")
    const [selectedSchedules, setSelectedSchedules] = useState<Set<string>>(new Set())
    const [isParsing, setIsParsing] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isSavingHistory, setIsSavingHistory] = useState(false)
    const [isLoadingHistories, setIsLoadingHistories] = useState(false)
    const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null)
    const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null)
    const [histories, setHistories] = useState<AmazonDealHistorySummary[]>([])
    const [historyMessage, setHistoryMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        void loadHistories()
    }, [])

    const keyByRole = useMemo(() => {
        const map: Partial<Record<AmazonDealColumnRole, string>> = {}
        parsed?.columns.forEach((column) => {
            if (column.role !== "other" && !map[column.role]) map[column.role] = column.key
        })
        return map
    }, [parsed])

    const displayColumns = useMemo(() => {
        if (!parsed) return []
        const selected = preferredRoles
            .map((role) => parsed.columns.find((column) => column.role === role))
            .filter((column): column is AmazonDealColumn => Boolean(column))
        const missingEditable = parsed.columns.filter((column) => column.editable && !selected.some((item) => item.key === column.key))
        return [...selected, ...missingEditable]
    }, [parsed])

    const activeRows = useMemo(() => {
        return rows.filter((row) => rowMatchesDealType(row, keyByRole.dealType, dealTypeFilter))
    }, [dealTypeFilter, keyByRole.dealType, rows])

    const dealTypeSummaries = useMemo(() => {
        const participatingKey = keyByRole.participating
        const dealTypeKey = keyByRole.dealType
        const summaries: Record<Exclude<DealTypeFilter, "all">, { total: number; participating: number; warnings: number }> = {
            lightning: { total: 0, participating: 0, warnings: 0 },
            best: { total: 0, participating: 0, warnings: 0 },
        }
        rows.forEach((row) => {
            const type = classifyDealType(readRowDealType(row, dealTypeKey))
            if (type !== "lightning" && type !== "best") return
            summaries[type].total += 1
            summaries[type].warnings += row.validationMessages.length
            if (String(row.values[participatingKey ?? ""] ?? "").trim() === YES) {
                summaries[type].participating += 1
            }
        })
        return summaries
    }, [keyByRole.dealType, keyByRole.participating, rows])

    const activeDealTypeLabel = dealTypeFilter === "all"
        ? "全セール種別"
        : dealTypeCards.find((item) => item.key === dealTypeFilter)?.title ?? "選択中のセール種別"

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return activeRows.filter((row) => {
            const text = [
                keyByRole.productName,
                keyByRole.dealAsin,
                keyByRole.featuredAsin,
                keyByRole.sku,
                keyByRole.dealType,
            ]
                .map((key) => (key ? String(row.values[key] ?? row.displayValues[key] ?? "") : ""))
                .join(" ")
                .toLowerCase()
            const participation = String(row.values[keyByRole.participating ?? ""] ?? "").trim()
            if (normalizedQuery && !text.includes(normalizedQuery)) return false
            if (participationFilter === "yes" && participation !== YES) return false
            if (participationFilter === "no" && participation !== NO) return false
            if (participationFilter === "warning" && row.validationMessages.length === 0) return false
            return true
        })
    }, [activeRows, keyByRole, participationFilter, query])

    const scheduleOptions = useMemo(() => {
        const key = keyByRole.schedule
        if (!key) return []
        const options = new Set<string>()
        activeRows.forEach((row) => {
            row.options[key]?.forEach((option) => options.add(option))
            const value = String(row.values[key] ?? "").trim()
            if (value && value !== "NA") options.add(value)
        })
        return Array.from(options)
    }, [activeRows, keyByRole.schedule])

    const scheduleSummaries = useMemo(() => {
        const scheduleKey = keyByRole.schedule
        if (!scheduleKey) return []
        const participatingKey = keyByRole.participating
        const sellerPriceKey = keyByRole.sellerPrice
        const dealPriceKey = keyByRole.dealPrice

        return scheduleOptions.map((schedule) => {
            let eligible = 0
            let participating = 0
            let warnings = 0
            const discountRates: number[] = []
            activeRows.forEach((row) => {
                if (!rowCanUseSchedule(row, scheduleKey, schedule)) return
                eligible += 1
                const currentSchedule = String(row.values[scheduleKey] ?? "").trim()
                const isParticipating = String(row.values[participatingKey ?? ""] ?? "").trim() === YES
                if (currentSchedule === schedule && isParticipating) participating += 1
                warnings += row.validationMessages.length

                const sellerPrice = Number(row.values[sellerPriceKey ?? ""])
                const dealPrice = Number(row.values[dealPriceKey ?? ""])
                if (Number.isFinite(sellerPrice) && sellerPrice > 0 && Number.isFinite(dealPrice) && dealPrice > 0) {
                    discountRates.push((1 - dealPrice / sellerPrice) * 100)
                }
            })
            const dates = parseScheduleDates(schedule)
            const minDiscount = discountRates.length ? Math.min(...discountRates) : null
            const avgDiscount = discountRates.length ? discountRates.reduce((sum, value) => sum + value, 0) / discountRates.length : null
            return {
                schedule,
                title: shortScheduleTitle(schedule),
                period: dates ? `${dates.start} - ${dates.end}` : "Amazon固定日程",
                isFixed: schedule.startsWith("月 "),
                eligible,
                participating,
                warnings,
                minDiscount,
                avgDiscount,
            }
        }).filter((item) => item.eligible > 0)
    }, [
        keyByRole.dealPrice,
        keyByRole.participating,
        keyByRole.schedule,
        keyByRole.sellerPrice,
        activeRows,
        scheduleOptions,
    ])

    const currentSummary = useMemo(() => {
        let participating = 0
        let notParticipating = 0
        let warnings = 0
        const participatingKey = keyByRole.participating
        rows.forEach((row) => {
            const value = String(row.values[participatingKey ?? ""] ?? "").trim()
            if (value === YES) participating += 1
            if (value === NO) notParticipating += 1
            warnings += row.validationMessages.length
        })
        return { participating, notParticipating, warnings }
    }, [keyByRole.participating, rows])

    const activeSummary = useMemo(() => {
        let participating = 0
        let notParticipating = 0
        let warnings = 0
        const participatingKey = keyByRole.participating
        activeRows.forEach((row) => {
            const value = String(row.values[participatingKey ?? ""] ?? "").trim()
            if (value === YES) participating += 1
            if (value === NO) notParticipating += 1
            warnings += row.validationMessages.length
        })
        return { participating, notParticipating, warnings }
    }, [activeRows, keyByRole.participating])

    const visibleSelectedCount = filteredRows.filter((row) => selectedRows.has(row.rowNumber)).length
    const allVisibleSelected = filteredRows.length > 0 && visibleSelectedCount === filteredRows.length
    const selectedCount = rows.filter((row) => selectedRows.has(row.rowNumber) && rowMatchesDealType(row, keyByRole.dealType, dealTypeFilter)).length

    const changeDealTypeFilter = (value: DealTypeFilter) => {
        setDealTypeFilter(value)
        setSelectedRows(new Set())
        setSelectedSchedules(new Set())
    }

    const loadHistories = async () => {
        setIsLoadingHistories(true)
        try {
            const response = await fetch("/api/amazon-deals/histories", { cache: "no-store" })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "履歴の取得に失敗しました。")
            setHistories(Array.isArray(data.histories) ? data.histories : [])
        } catch (historyError) {
            setError(historyError instanceof Error ? historyError.message : "履歴の取得に失敗しました。")
        } finally {
            setIsLoadingHistories(false)
        }
    }

    const buildHistoryPayload = (): AmazonDealHistoryPayload | null => {
        if (!parsed) return null
        const parsedSnapshot: Omit<AmazonDealParseResult, "rows"> = {
            workbookBase64: parsed.workbookBase64,
            fileName: parsed.fileName,
            sheetName: parsed.sheetName,
            headerRowNumber: parsed.headerRowNumber,
            fieldRowNumber: parsed.fieldRowNumber,
            dataStartRowNumber: parsed.dataStartRowNumber,
            rowCount: parsed.rowCount,
            columns: parsed.columns,
            editableKeys: parsed.editableKeys,
            summary: parsed.summary,
        }
        return { parsed: parsedSnapshot, rows }
    }

    const saveHistorySnapshot = async (status: "draft" | "exported") => {
        const payload = buildHistoryPayload()
        if (!payload) throw new Error("保存するタイムセール表がありません。")
        const label = status === "exported" ? "出力保存" : "仮保存"
        const response = await fetch("/api/amazon-deals/histories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                title: `${label} ${payload.parsed.fileName.replace(/\.xlsx$/i, "")} ${rows.length}件`,
                payload,
            }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "履歴保存に失敗しました。")
        const history = data.history as AmazonDealHistorySummary
        setHistories((current) => [history, ...current.filter((item) => item.id !== history.id)].slice(0, 30))
        setHistoryMessage(`${history.title}を保存しました。`)
        return history
    }

    const handleSaveDraft = async () => {
        if (!parsed) return
        setIsSavingHistory(true)
        setError(null)
        setHistoryMessage(null)
        try {
            await saveHistorySnapshot("draft")
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "仮保存に失敗しました。")
        } finally {
            setIsSavingHistory(false)
        }
    }

    const handleRestoreHistory = async (historyId: string) => {
        setRestoringHistoryId(historyId)
        setError(null)
        setHistoryMessage(null)
        try {
            const response = await fetch(`/api/amazon-deals/histories/${historyId}`, { cache: "no-store" })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "履歴の読み込みに失敗しました。")
            const history = data.history as AmazonDealHistoryDetail
            const restoredRows = recalculateRows(history.payload.rows, history.payload.parsed.columns)
            setParsed({ ...history.payload.parsed, rows: restoredRows })
            setRows(restoredRows)
            setSelectedRows(new Set())
            setSelectedSchedules(new Set())
            setDealTypeFilter("all")
            setBulkSchedule("")
            setBulkStartDate("")
            setBulkEndDate("")
            setHistoryMessage(`${history.title}を復元しました。`)
        } catch (restoreError) {
            setError(restoreError instanceof Error ? restoreError.message : "履歴の復元に失敗しました。")
        } finally {
            setRestoringHistoryId(null)
        }
    }

    const handleDeleteHistory = async (historyId: string) => {
        if (!window.confirm("この履歴を削除しますか？")) return
        setDeletingHistoryId(historyId)
        setError(null)
        setHistoryMessage(null)
        try {
            const response = await fetch(`/api/amazon-deals/histories/${historyId}`, { method: "DELETE" })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error || "履歴の削除に失敗しました。")
            setHistories((current) => current.filter((item) => item.id !== historyId))
            setHistoryMessage("履歴を削除しました。")
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "履歴の削除に失敗しました。")
        } finally {
            setDeletingHistoryId(null)
        }
    }

    const handleFileUpload = async (file: File | null) => {
        if (!file) return
        setIsParsing(true)
        setError(null)
        setHistoryMessage(null)
        setSelectedRows(new Set())
        setSelectedSchedules(new Set())
        setDealTypeFilter("all")
        try {
            const formData = new FormData()
            formData.append("file", file)
            const response = await fetch("/api/amazon-deals/parse", { method: "POST", body: formData })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Excelの読み込みに失敗しました。")
            const result = data as AmazonDealParseResult
            setParsed(result)
            setRows(result.rows)
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Excelの読み込みに失敗しました。")
        } finally {
            setIsParsing(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const updateRowValue = (rowNumber: number, key: string, value: AmazonDealCellValue) => {
        setRows((prev) => {
            const source = prev.find((row) => row.rowNumber === rowNumber)
            const target = source?.writeTargets[key]
            return recalculateRows(prev.map((row) => {
                const sameTarget = target && row.writeTargets[key] === target
                if (row.rowNumber !== rowNumber && !sameTarget) return row
                return updateRowCell(row, key, value)
            }), parsed?.columns ?? [])
        })
    }

    const toggleRowSelection = (rowNumber: number) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (next.has(rowNumber)) next.delete(rowNumber)
            else next.add(rowNumber)
            return next
        })
    }

    const toggleVisibleSelection = () => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) {
                filteredRows.forEach((row) => next.delete(row.rowNumber))
            } else {
                filteredRows.forEach((row) => next.add(row.rowNumber))
            }
            return next
        })
    }

    const selectedTargetRowNumbers = () => new Set(rows
        .filter((row) => selectedRows.has(row.rowNumber) && rowMatchesDealType(row, keyByRole.dealType, dealTypeFilter))
        .map((row) => row.rowNumber))

    const bulkSetParticipation = (value: typeof YES | typeof NO) => {
        const key = keyByRole.participating
        if (!key || selectedRows.size === 0) return
        const targets = selectedTargetRowNumbers()
        setRows((prev) => recalculateRows(prev.map((row) => {
            if (!targets.has(row.rowNumber)) return row
            const options = row.options[key]
            if (options?.length && !options.includes(value)) return row
            return updateRowCell(row, key, value)
        }), parsed?.columns ?? []))
    }

    const bulkApplyDiscount = () => {
        const sellerPriceKey = keyByRole.sellerPrice
        const dealPriceKey = keyByRole.dealPrice
        if (!sellerPriceKey || !dealPriceKey || selectedRows.size === 0) return
        const percent = Number(discountPercent)
        if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
            setError("割引率は1から99の範囲で入力してください。")
            return
        }
        const targets = selectedTargetRowNumbers()
        setRows((prev) => recalculateRows(prev.map((row) => {
            if (!targets.has(row.rowNumber)) return row
            const sellerPrice = Number(row.values[sellerPriceKey])
            if (!Number.isFinite(sellerPrice) || sellerPrice <= 0) return row
            return updateRowCell(row, dealPriceKey, Math.floor(sellerPrice * (100 - percent) / 100))
        }), parsed?.columns ?? []))
    }

    const bulkUseSellerQuantity = () => {
        const sellerQuantityKey = keyByRole.sellerQuantity
        const committedUnitsKey = keyByRole.committedUnits
        if (!sellerQuantityKey || !committedUnitsKey || selectedRows.size === 0) return
        const targets = selectedTargetRowNumbers()
        setRows((prev) => recalculateRows(prev.map((row) => {
            if (!targets.has(row.rowNumber)) return row
            const quantity = Number(row.values[sellerQuantityKey])
            if (!Number.isFinite(quantity)) return row
            return updateRowCell(row, committedUnitsKey, quantity)
        }), parsed?.columns ?? []))
    }

    const bulkApplySchedule = () => {
        const scheduleKey = keyByRole.schedule
        const startDateKey = keyByRole.startDate
        const endDateKey = keyByRole.endDate
        if (!scheduleKey || selectedRows.size === 0) return
        const targets = selectedTargetRowNumbers()
        const parsedDates = parseScheduleDates(bulkSchedule)
        const startValue = parsedDates?.start ?? bulkStartDate.trim()
        const endValue = parsedDates?.end ?? bulkEndDate.trim()
        const isAmazonFixedSchedule = bulkSchedule.startsWith("月 ")

        setRows((prev) => recalculateRows(prev.map((row) => {
            if (!targets.has(row.rowNumber)) return row
            let next = row
            if (bulkSchedule) {
                const options = row.options[scheduleKey]
                if (!options?.length || options.includes(bulkSchedule)) {
                    next = updateRowCell(next, scheduleKey, bulkSchedule)
                }
            }
            if (startDateKey) next = updateRowCell(next, startDateKey, isAmazonFixedSchedule ? "NA" : (startValue || next.values[startDateKey]))
            if (endDateKey) next = updateRowCell(next, endDateKey, isAmazonFixedSchedule ? "NA" : (endValue || next.values[endDateKey]))
            return next
        }), parsed?.columns ?? []))
    }

    const toggleScheduleSelection = (schedule: string) => {
        setSelectedSchedules((prev) => {
            const next = new Set(prev)
            if (next.has(schedule)) {
                next.delete(schedule)
            } else {
                next.add(schedule)
            }
            return next
        })
    }

    const applySelectedSchedulesOnly = () => {
        const scheduleKey = keyByRole.schedule
        const participatingKey = keyByRole.participating
        const startDateKey = keyByRole.startDate
        const endDateKey = keyByRole.endDate
        if (!scheduleKey || !participatingKey) return

        const schedules = scheduleOptions.filter((schedule) => selectedSchedules.has(schedule))
        if (schedules.length === 0) return

        const eligibleRowNumbers = new Set(rows
            .filter((row) => rowMatchesDealType(row, keyByRole.dealType, dealTypeFilter))
            .filter((row) => schedules.some((schedule) => rowCanUseSchedule(row, scheduleKey, schedule)))
            .map((row) => row.rowNumber))

        if (schedules.length === 1) {
            const schedule = schedules[0]
            const parsedDates = parseScheduleDates(schedule)
            const isAmazonFixedSchedule = schedule.startsWith("月 ")
            setBulkSchedule(schedule)
            setBulkStartDate(isAmazonFixedSchedule ? "NA" : parsedDates?.start ?? "")
            setBulkEndDate(isAmazonFixedSchedule ? "NA" : parsedDates?.end ?? "")
        } else {
            setBulkSchedule("")
            setBulkStartDate("")
            setBulkEndDate("")
        }
        setSelectedRows(eligibleRowNumbers)
        setRows((prev) => recalculateRows(prev.map((row) => {
            if (!rowMatchesDealType(row, keyByRole.dealType, dealTypeFilter)) return row
            const currentSchedule = String(row.values[scheduleKey] ?? "").trim()
            const availableSchedules = schedules.filter((schedule) => rowCanUseSchedule(row, scheduleKey, schedule))
            const selectedSchedule = availableSchedules.includes(currentSchedule) ? currentSchedule : availableSchedules[0]
            let next = row
            if (!selectedSchedule) {
                return updateRowCell(next, participatingKey, NO)
            }

            const parsedDates = parseScheduleDates(selectedSchedule)
            const isAmazonFixedSchedule = selectedSchedule.startsWith("月 ")
            next = updateRowCell(next, participatingKey, YES)
            next = updateRowCell(next, scheduleKey, selectedSchedule)
            if (startDateKey) next = updateRowCell(next, startDateKey, isAmazonFixedSchedule ? "NA" : parsedDates?.start ?? next.values[startDateKey])
            if (endDateKey) next = updateRowCell(next, endDateKey, isAmazonFixedSchedule ? "NA" : parsedDates?.end ?? next.values[endDateKey])
            return next
        }), parsed?.columns ?? []))
    }

    const handleExport = async () => {
        if (!parsed) return
        setIsExporting(true)
        setError(null)
        try {
            const response = await fetch("/api/amazon-deals/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workbookBase64: parsed.workbookBase64,
                    sheetName: parsed.sheetName,
                    columns: parsed.columns,
                    fileName: parsed.fileName,
                    rows: rows.map((row) => ({
                        rowNumber: row.rowNumber,
                        values: row.values,
                        writeTargets: row.writeTargets,
                    })),
                }),
            })
            if (!response.ok) {
                const data = await response.json().catch(() => null)
                throw new Error(data?.error || "Excelの書き出しに失敗しました。")
            }
            await saveHistorySnapshot("exported")
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = buildClientDownloadName(parsed.fileName)
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : "Excelの書き出しに失敗しました。")
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="w-full space-y-4">
            <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <Link href="/web-sales/advertising" className="mt-1 rounded-lg p-2 transition-colors hover:bg-gray-100">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <FileSpreadsheet className="text-orange-500" size={28} />
                            Amazonタイムセール設定
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">Amazon推奨テンプレートを画面編集し、アップロード形式のExcelに戻します。</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={(event) => void handleFileUpload(event.target.files?.[0] ?? null)}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isParsing}
                        className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-60"
                    >
                        <Upload size={16} />
                        {isParsing ? "読み込み中..." : "Excel取込"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSaveDraft()}
                        disabled={!parsed || isSavingHistory || isExporting}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                        <Save size={16} />
                        {isSavingHistory ? "保存中..." : "仮保存"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={!parsed || isExporting || isSavingHistory}
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300"
                    >
                        <Download size={16} />
                        {isExporting ? "書き出し中..." : "Amazon形式で出力"}
                    </button>
                </div>
            </header>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    <XCircle size={16} />
                    {error}
                </div>
            )}

            {historyMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    <CheckCircle size={16} />
                    {historyMessage}
                </div>
            )}

            <HistoryPanel
                histories={histories}
                isLoading={isLoadingHistories}
                restoringHistoryId={restoringHistoryId}
                deletingHistoryId={deletingHistoryId}
                onRestore={(id) => void handleRestoreHistory(id)}
                onDelete={(id) => void handleDeleteHistory(id)}
            />

            {!parsed ? (
                <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                        <FileSpreadsheet size={30} />
                    </div>
                    <h2 className="mt-4 text-lg font-bold">Amazonのタイムセール推奨ファイルを取り込み</h2>
                    <p className="mt-2 text-sm text-gray-500">対象シート、hidden列、入力規則、結合セルを読み取って編集画面を作ります。</p>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
                    >
                        <Upload size={16} />
                        ファイルを選択
                    </button>
                </section>
            ) : (
                <>
                    <section className="grid grid-cols-3 gap-2 md:grid-cols-6">
                        <SummaryTile label="全件" value={`${rows.length}件`} />
                        <SummaryTile label="参加中" value={`${currentSummary.participating}件`} tone="green" />
                        <SummaryTile label="不参加" value={`${currentSummary.notParticipating}件`} tone="gray" />
                        <SummaryTile label="おすすめ" value={`${dealTypeSummaries.best.total}件`} tone="blue" />
                        <SummaryTile label="数量限定" value={`${dealTypeSummaries.lightning.total}件`} tone="amber" />
                        <SummaryTile label="確認" value={`${currentSummary.warnings}件`} tone={currentSummary.warnings > 0 ? "red" : "green"} />
                    </section>

                    <section className="space-y-3 rounded-xl border bg-white p-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">セール種別ごとの設定</h2>
                                <p className="text-xs text-gray-500">数量限定とおすすめを切り替えると、期間選択・一括設定・表の表示がその種別だけに絞られます。</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => changeDealTypeFilter("all")}
                                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${dealTypeFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                                >
                                    全て
                                </button>
                                {dealTypeCards.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => changeDealTypeFilter(item.key)}
                                        className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${dealTypeFilter === item.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                            {dealTypeCards.map((item) => (
                                <DealTypeCard
                                    key={item.key}
                                    item={item}
                                    selected={dealTypeFilter === item.key}
                                    summary={dealTypeSummaries[item.key]}
                                    onSelect={() => changeDealTypeFilter(item.key)}
                                />
                            ))}
                        </div>
                        <div className="grid gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 md:grid-cols-3">
                            <div>
                                <span className="font-semibold text-slate-800">現在の設定対象: </span>
                                {activeDealTypeLabel}（{activeRows.length}件）
                            </div>
                            <div>
                                <span className="font-semibold text-slate-800">参加中: </span>
                                {activeSummary.participating}件 / 確認 {activeSummary.warnings}件
                            </div>
                            <div>
                                <span className="font-semibold text-slate-800">Seller Central確認: </span>
                                最低OFF率や審査は商品・イベントごとにAmazon側の検証が最終です。
                            </div>
                        </div>
                        <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
                            Seller Central上では、商戦期イベントの数量限定タイムセール/お買い得情報に固定前払い手数料と売上連動の手数料案内が表示されています。2026年プライムデー向けは、2026年7月6日までの推奨タイムセール申請と、イベント3週間前までの在庫手配が案内されています。
                        </div>
                    </section>

                    {scheduleSummaries.length > 0 && (
                        <section className="rounded-xl border bg-white p-3">
                            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-gray-900">Amazon指定スケジュール（{activeDealTypeLabel}）</h2>
                                    <p className="text-xs text-gray-500">期間を複数選択できます。反映すると、現在の設定対象だけを選択期間に参加させ、対象外は不参加にします。</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                        選択中 {selectedSchedules.size}期間
                                    </span>
                                    <button
                                        type="button"
                                        onClick={applySelectedSchedulesOnly}
                                        disabled={selectedSchedules.size === 0}
                                        className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {activeDealTypeLabel}で選択した期間だけ参加
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSchedules(new Set())}
                                        disabled={selectedSchedules.size === 0}
                                        className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        解除
                                    </button>
                                </div>
                            </div>
                            <div className="mb-3 text-xs text-gray-500">割引率は現在のExcel内の通常価格/セール価格から計算。10%未満は警告表示のみです。商品・イベントごとの最低OFF率はAmazon側のアップロード検証に従います。</div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {scheduleSummaries.map((item) => (
                                    <ScheduleCard
                                        key={item.schedule}
                                        item={item}
                                        selected={selectedSchedules.has(item.schedule)}
                                        onToggle={() => toggleScheduleSelection(item.schedule)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="space-y-3 rounded-xl border bg-white p-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-white px-3 py-2">
                                <Search size={16} className="text-gray-400" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="商品名・ASIN・SKUで検索"
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {([
                                    ["all", "全て"],
                                    ["yes", "参加中"],
                                    ["no", "不参加"],
                                    ["warning", "確認あり"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setParticipationFilter(value)}
                                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${participationFilter === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <span className="font-semibold">NA</span> = Not Applicable（該当なし）。「月（...）」などAmazon側で日付固定の枠は開始/終了日をNAのままにします。カスタム日程だけ日付を入れます。
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            <span className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">
                                選択中 {selectedCount}件
                            </span>
                            <span className="text-xs font-semibold text-gray-500">表示 {filteredRows.length}件</span>
                            <button type="button" onClick={() => setSelectedRows(new Set())} disabled={selectedCount === 0} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                                選択解除
                            </button>
                            <button type="button" onClick={() => bulkSetParticipation(YES)} disabled={selectedCount === 0} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
                                選択行を参加
                            </button>
                            <button type="button" onClick={() => bulkSetParticipation(NO)} disabled={selectedCount === 0} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                                選択行を不参加
                            </button>
                            <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                                <Percent size={14} className="text-gray-400" />
                                <input
                                    value={discountPercent}
                                    onChange={(event) => setDiscountPercent(event.target.value)}
                                    className="w-11 text-right text-xs outline-none"
                                    inputMode="decimal"
                                />
                                <span className="text-xs text-gray-500">%引</span>
                                <button type="button" onClick={bulkApplyDiscount} disabled={selectedCount === 0} className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:bg-gray-300">
                                    価格反映
                                </button>
                            </div>
                            <button type="button" onClick={bulkUseSellerQuantity} disabled={selectedCount === 0} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                                確定数=在庫数
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={bulkSchedule}
                                onChange={(event) => {
                                    const value = event.target.value
                                    setBulkSchedule(value)
                                    const dates = parseScheduleDates(value)
                                    if (dates) {
                                        setBulkStartDate(dates.start)
                                        setBulkEndDate(dates.end)
                                    }
                                    if (value.startsWith("月 ")) {
                                        setBulkStartDate("NA")
                                        setBulkEndDate("NA")
                                    }
                                }}
                                className="max-w-[340px] rounded-lg border px-2 py-2 text-xs outline-none"
                            >
                                <option value="">スケジュール一括選択</option>
                                {scheduleOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <input value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} placeholder="開始日 or NA" className="w-28 rounded-lg border px-2 py-2 text-xs outline-none" />
                            <input value={bulkEndDate} onChange={(event) => setBulkEndDate(event.target.value)} placeholder="終了日 or NA" className="w-28 rounded-lg border px-2 py-2 text-xs outline-none" />
                            <button type="button" onClick={bulkApplySchedule} disabled={selectedCount === 0} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                                選択行へ日程反映
                            </button>
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border bg-white">
                        <div className="overflow-x-auto">
                            <table className="w-full table-fixed text-[12px]">
                                <colgroup>
                                    <col style={{ width: 32 }} />
                                    <col style={{ width: 36 }} />
                                    <col style={{ width: 250 }} />
                                    <col style={{ width: 72 }} />
                                    <col style={{ width: 90 }} />
                                    <col style={{ width: 70 }} />
                                    <col style={{ width: 116 }} />
                                    <col style={{ width: 92 }} />
                                    <col style={{ width: 92 }} />
                                    <col style={{ width: 78 }} />
                                    <col style={{ width: 84 }} />
                                    <col style={{ width: 72 }} />
                                    <col style={{ width: 74 }} />
                                    <col style={{ width: 62 }} />
                                    <col style={{ width: 72 }} />
                                </colgroup>
                                <thead className="bg-gray-50 text-[11px] text-gray-500">
                                    <tr>
                                        <th className="px-2 py-2 text-left">
                                            <input
                                                type="checkbox"
                                                checked={allVisibleSelected}
                                                onChange={toggleVisibleSelection}
                                                aria-label="表示中の行を選択"
                                            />
                                        </th>
                                        <th className="px-2 py-2 text-left font-semibold">行</th>
                                        {displayColumns.map((column) => (
                                            <th key={column.key} className="px-2 py-2 text-left font-semibold">
                                                <div className="flex items-center gap-1">
                                                    <span title={column.header}>{shortColumnLabel(column)}</span>
                                                    {column.editable && <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-700">編</span>}
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-2 py-2 text-left font-semibold">割引率</th>
                                        <th className="px-2 py-2 text-left font-semibold">確認</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredRows.map((row) => (
                                        <tr key={row.id} className={`align-top hover:bg-orange-50/30 ${selectedRows.has(row.rowNumber) ? "bg-orange-50/40" : ""}`}>
                                            <td className="px-2 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(row.rowNumber)}
                                                    onChange={() => toggleRowSelection(row.rowNumber)}
                                                    aria-label={`${row.rowNumber}行目を選択`}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-[11px] font-semibold text-gray-400">{row.rowNumber}</td>
                                            {displayColumns.map((column) => (
                                                <td key={column.key} className="px-2 py-2">
                                                    {renderCell(row, column, keyByRole, updateRowValue)}
                                                </td>
                                            ))}
                                            <td className="px-2 py-2">
                                                <DiscountRateCell row={row} keyByRole={keyByRole} />
                                            </td>
                                            <td className="px-2 py-2">
                                                {row.validationMessages.length === 0 ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-1 text-[11px] font-semibold text-emerald-700">
                                                        <CheckCircle size={12} />
                                                        OK
                                                    </span>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {row.validationMessages.map((message) => (
                                                            <div key={message} className="flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-700">
                                                                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                                                <span>{message}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredRows.length === 0 && (
                                        <tr>
                                            <td colSpan={displayColumns.length + 4} className="px-4 py-10 text-center text-sm text-gray-500">
                                                条件に一致する商品がありません。
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    )
}

function renderCell(
    row: AmazonDealRow,
    column: AmazonDealColumn,
    keyByRole: Partial<Record<AmazonDealColumnRole, string>>,
    updateRowValue: (rowNumber: number, key: string, value: AmazonDealCellValue) => void,
) {
    const value = row.values[column.key] ?? ""

    if (column.role === "productName") {
        const imageUrl = keyByRole.imageUrl ? String(row.values[keyByRole.imageUrl] ?? "") : ""
        const asin = keyByRole.dealAsin ? String(row.values[keyByRole.dealAsin] ?? "") : ""
        return (
            <div className="flex min-w-0 gap-2">
                {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border object-cover" />
                ) : (
                    <div className="h-10 w-10 shrink-0 rounded-md border bg-gray-50" />
                )}
                <div className="min-w-0">
                    <div className="line-clamp-2 break-words font-semibold leading-4 text-gray-900" title={String(value)}>{String(value)}</div>
                    {asin && <div className="mt-1 truncate text-[10px] text-gray-500">ASIN {asin}</div>}
                </div>
            </div>
        )
    }

    if (column.role === "dealType") {
        return <span className="text-[11px] font-semibold text-gray-700">{shortDealType(String(value))}</span>
    }

    if (!column.editable) {
        const className = column.role === "sellerPrice" || column.role === "sellerQuantity"
            ? "truncate font-semibold tabular-nums text-gray-700"
            : "truncate text-gray-700"
        return <div className={className} title={String(value)}>{formatCellValue(value, column)}</div>
    }

    const options = row.options[column.key] ?? []
    if (options.length > 0) {
        const current = String(value)
        const choices = options.includes(current) || !current ? options : [current, ...options]
        return (
            <select
                value={current}
                title={current}
                onChange={(event) => updateRowValue(row.rowNumber, column.key, event.target.value)}
                className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1.5 text-[11px] font-semibold text-gray-900 outline-none focus:border-emerald-500"
            >
                {!current && <option value="">未選択</option>}
                {choices.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        )
    }

    const isNumber = column.role === "dealPrice" || column.role === "committedUnits"
    return (
        <input
            value={String(value)}
            type={isNumber ? "number" : "text"}
            inputMode={isNumber ? "decimal" : "text"}
            title={String(value)}
            onChange={(event) => updateRowValue(row.rowNumber, column.key, coerceValue(event.target.value, column))}
            className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1.5 text-[11px] font-semibold text-gray-900 outline-none focus:border-emerald-500"
        />
    )
}

function HistoryPanel({
    histories,
    isLoading,
    restoringHistoryId,
    deletingHistoryId,
    onRestore,
    onDelete,
}: {
    histories: AmazonDealHistorySummary[]
    isLoading: boolean
    restoringHistoryId: string | null
    deletingHistoryId: string | null
    onRestore: (id: string) => void
    onDelete: (id: string) => void
}) {
    return (
        <section className="rounded-xl border bg-white p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <History size={16} className="text-slate-500" />
                        保存履歴
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">仮保存とAmazon形式で出力した表を保存します。履歴から作業状態を復元できます。</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                    {isLoading ? "読み込み中..." : `${histories.length}件`}
                </span>
            </div>
            {histories.length > 0 && (
                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                    {histories.slice(0, 6).map((history) => (
                        <div key={history.id} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-bold text-gray-900" title={history.title}>{history.title}</div>
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        {formatHistoryDate(history.createdAt)} / {history.rowCount}件 / 参加 {history.participatingCount}件
                                    </div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${history.status === "exported" ? "bg-gray-900 text-white" : "bg-amber-100 text-amber-800"}`}>
                                    {history.status === "exported" ? "出力" : "仮保存"}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-gray-500">
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">おすすめ {history.bestDealCount}</span>
                                <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">数量限定 {history.lightningDealCount}</span>
                                {history.warningCount > 0 && <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">確認 {history.warningCount}</span>}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => onRestore(history.id)}
                                    disabled={restoringHistoryId === history.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                    <RotateCcw size={13} />
                                    {restoringHistoryId === history.id ? "復元中..." : "復元"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(history.id)}
                                    disabled={deletingHistoryId === history.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                    <Trash2 size={13} />
                                    {deletingHistoryId === history.id ? "削除中..." : "削除"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!isLoading && histories.length === 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
                    まだ保存履歴はありません。
                </div>
            )}
        </section>
    )
}

function DealTypeCard({
    item,
    selected,
    summary,
    onSelect,
}: {
    item: (typeof dealTypeCards)[number]
    selected: boolean
    summary: { total: number; participating: number; warnings: number }
    onSelect: () => void
}) {
    const toneStyles = {
        amber: selected ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100" : "border-amber-100 bg-white hover:bg-amber-50/60",
        blue: selected ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100" : "border-blue-100 bg-white hover:bg-blue-50/60",
    }
    const badgeStyles = {
        amber: "bg-amber-100 text-amber-800",
        blue: "bg-blue-100 text-blue-800",
    }
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`rounded-lg border p-3 text-left transition-colors ${toneStyles[item.tone]}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyles[item.tone]}`}>{item.label}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-600">{item.description}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${selected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {selected ? "設定中" : "切替"}
                </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="対象" value={`${summary.total}`} />
                <Metric label="参加" value={`${summary.participating}`} tone={summary.participating > 0 ? "green" : "gray"} />
                <Metric label="確認" value={`${summary.warnings}`} tone={summary.warnings > 0 ? "amber" : "gray"} />
            </div>
            <ul className="mt-3 space-y-1 text-[11px] leading-4 text-gray-500">
                {item.notes.map((note) => (
                    <li key={note}>・{note}</li>
                ))}
            </ul>
        </button>
    )
}

function DiscountRateCell({
    row,
    keyByRole,
}: {
    row: AmazonDealRow
    keyByRole: Partial<Record<AmazonDealColumnRole, string>>
}) {
    const rate = calculateDiscountRate(
        row.values[keyByRole.sellerPrice ?? ""],
        row.values[keyByRole.dealPrice ?? ""],
    )
    if (rate === null) {
        return <span className="text-[11px] font-semibold text-gray-400">-</span>
    }
    const tone = rate < 10
        ? "bg-amber-50 text-amber-700"
        : rate < 15
            ? "bg-blue-50 text-blue-700"
            : "bg-emerald-50 text-emerald-700"
    return (
        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${tone}`}>
            {rate.toFixed(1)}%
        </span>
    )
}

function SummaryTile({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "green" | "blue" | "amber" | "red" }) {
    const styles = {
        gray: "border-gray-200 bg-white text-gray-900",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        red: "border-red-200 bg-red-50 text-red-800",
    }
    return (
        <div className={`rounded-lg border p-3 ${styles[tone]}`}>
            <div className="text-[11px] font-semibold text-gray-500">{label}</div>
            <div className="mt-1 text-xl font-bold">{value}</div>
        </div>
    )
}

function ScheduleCard({
    item,
    selected,
    onToggle,
}: {
    item: {
        schedule: string
        title: string
        period: string
        isFixed: boolean
        eligible: number
        participating: number
        warnings: number
        minDiscount: number | null
        avgDiscount: number | null
    }
    selected: boolean
    onToggle: () => void
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-900" title={item.schedule}>{item.title}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-gray-500">{item.period}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.isFixed ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.isFixed ? "固定" : "カスタム"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {selected && <CheckCircle size={11} />}
                        {selected ? "選択中" : "選択"}
                    </span>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                <Metric label="対象" value={`${item.eligible}`} />
                <Metric label="参加" value={`${item.participating}`} tone={item.participating > 0 ? "green" : "gray"} />
                <Metric label="最小割引" value={formatDiscount(item.minDiscount)} tone={item.minDiscount !== null && item.minDiscount < 10 ? "amber" : "gray"} />
            </div>
            <div className="mt-2 text-[10px] text-gray-500">
                平均割引 {formatDiscount(item.avgDiscount)}
                {item.minDiscount !== null && item.minDiscount < 10 && (
                    <span className="ml-2 font-semibold text-amber-600">10%未満あり</span>
                )}
            </div>
            <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-center text-xs font-bold text-gray-700">
                クリックで{selected ? "解除" : "選択"}
            </div>
        </button>
    )
}

function Metric({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "green" | "amber" }) {
    const colors = {
        gray: "bg-gray-50 text-gray-800",
        green: "bg-emerald-50 text-emerald-700",
        amber: "bg-amber-50 text-amber-700",
    }
    return (
        <div className={`rounded-md px-2 py-1 ${colors[tone]}`}>
            <div className="text-[10px] font-semibold opacity-70">{label}</div>
            <div className="text-xs font-bold">{value}</div>
        </div>
    )
}

function updateRowCell(row: AmazonDealRow, key: string, value: AmazonDealCellValue): AmazonDealRow {
    return {
        ...row,
        values: { ...row.values, [key]: value },
        displayValues: { ...row.displayValues, [key]: value === null ? "" : String(value) },
    }
}

function recalculateRows(rows: AmazonDealRow[], columns: AmazonDealColumn[]): AmazonDealRow[] {
    return rows.map((row) => ({
        ...row,
        validationMessages: validateRowForClient(row, columns),
    }))
}

function validateRowForClient(row: AmazonDealRow, columns: AmazonDealColumn[]): string[] {
    const byRole: Partial<Record<AmazonDealColumnRole, string>> = {}
    columns.forEach((column) => {
        if (column.role !== "other" && !byRole[column.role]) byRole[column.role] = column.key
    })
    const messages: string[] = []
    const participating = String(row.values[byRole.participating ?? ""] ?? "").trim()
    const schedule = String(row.values[byRole.schedule ?? ""] ?? "").trim()
    const sellerPrice = Number(row.values[byRole.sellerPrice ?? ""])
    const dealPrice = Number(row.values[byRole.dealPrice ?? ""])
    const committedUnits = Number(row.values[byRole.committedUnits ?? ""])

    if (participating === YES) {
        if (!schedule) messages.push("参加中ですがスケジュールが未入力です。")
        if (!Number.isFinite(dealPrice) || dealPrice <= 0) messages.push("参加中ですがセール価格が0または未入力です。")
        if (!Number.isFinite(committedUnits) || committedUnits <= 0) messages.push("参加中ですが確定数が0または未入力です。")
        if (Number.isFinite(sellerPrice) && sellerPrice > 0 && Number.isFinite(dealPrice) && dealPrice >= sellerPrice) {
            messages.push("セール価格が通常価格以上です。")
        }
    }
    return messages
}

function coerceValue(value: string, column: AmazonDealColumn): AmazonDealCellValue {
    if (value === "") return null
    if (column.role === "dealPrice" || column.role === "committedUnits") {
        const number = Number(value)
        return Number.isFinite(number) ? number : value
    }
    return value
}

function formatCellValue(value: AmazonDealCellValue, column: AmazonDealColumn): string {
    if (value === null || value === undefined || value === "") return "-"
    if (column.role === "sellerPrice" || column.role === "dealPrice") {
        const number = Number(value)
        return Number.isFinite(number) ? `¥${Math.round(number).toLocaleString()}` : String(value)
    }
    if (column.role === "sellerQuantity" || column.role === "committedUnits") {
        const number = Number(value)
        return Number.isFinite(number) ? Math.round(number).toLocaleString() : String(value)
    }
    return String(value)
}

function shortColumnLabel(column: AmazonDealColumn): string {
    const labels: Partial<Record<AmazonDealColumnRole, string>> = {
        productName: "商品名",
        dealType: "種類",
        sku: "SKU",
        participating: "参加",
        schedule: "スケジュール",
        startDate: "開始",
        endDate: "終了",
        sellerPrice: "通常価格",
        dealPrice: "セール価格",
        committedUnits: "確定数",
        sellerQuantity: "在庫",
    }
    return labels[column.role] ?? column.header
}

function shortDealType(value: string): string {
    const type = classifyDealType(value)
    if (type === "lightning") return "数量限定"
    if (type === "best") return "おすすめ"
    return value
}

function readRowDealType(row: AmazonDealRow, dealTypeKey?: string): string {
    if (!dealTypeKey) return ""
    return String(row.values[dealTypeKey] ?? row.displayValues[dealTypeKey] ?? "")
}

function classifyDealType(value: string): DealTypeFilter | "other" {
    const text = value.toLowerCase()
    if (text.includes("数量限定") || text.includes("lightning")) return "lightning"
    if (text.includes("おすすめ") || text.includes("お買い得") || text.includes("best")) return "best"
    return "other"
}

function rowMatchesDealType(row: AmazonDealRow, dealTypeKey: string | undefined, filter: DealTypeFilter): boolean {
    if (filter === "all") return true
    return classifyDealType(readRowDealType(row, dealTypeKey)) === filter
}

function parseScheduleDates(value: string): { start: string; end: string } | null {
    const match = value.match(/\((\d{4}-\d{2}-\d{2})\s+-\s+(\d{4}-\d{2}-\d{2})\)/)
    if (!match) return null
    return { start: match[1], end: match[2] }
}

function rowCanUseSchedule(row: AmazonDealRow, scheduleKey: string, schedule: string): boolean {
    const currentSchedule = String(row.values[scheduleKey] ?? "").trim()
    const options = row.options[scheduleKey] ?? []
    return currentSchedule === schedule || options.includes(schedule)
}

function shortScheduleTitle(schedule: string): string {
    if (schedule.startsWith("月 ")) return schedule.replace(/\s*\(.+\)/, "")
    if (schedule.startsWith("カスタム")) {
        const dates = parseScheduleDates(schedule)
        return dates ? "カスタム" : schedule
    }
    return schedule.replace(/\s*\(.+\)/, "")
}

function formatDiscount(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "-"
    return `${Math.max(0, value).toFixed(1)}%`
}

function calculateDiscountRate(sellerPriceValue: AmazonDealCellValue | undefined, dealPriceValue: AmazonDealCellValue | undefined): number | null {
    const sellerPrice = Number(sellerPriceValue)
    const dealPrice = Number(dealPriceValue)
    if (!Number.isFinite(sellerPrice) || sellerPrice <= 0) return null
    if (!Number.isFinite(dealPrice) || dealPrice <= 0) return null
    return Math.max(0, (1 - dealPrice / sellerPrice) * 100)
}

function formatHistoryDate(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date)
}

function buildClientDownloadName(fileName: string): string {
    const base = fileName.replace(/\.xlsx$/i, "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120)
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    return `${base}_edited_${stamp}.xlsx`
}
