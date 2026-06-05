export type AmazonDealCellValue = string | number | null

export type AmazonDealColumnRole =
    | "parentAsin"
    | "featuredAsin"
    | "dealAsin"
    | "productName"
    | "dealType"
    | "recommendationId"
    | "sku"
    | "participating"
    | "schedule"
    | "startDate"
    | "endDate"
    | "sellerPrice"
    | "dealPrice"
    | "committedUnits"
    | "sellerQuantity"
    | "imageUrl"
    | "other"

export interface AmazonDealColumn {
    key: string
    header: string
    field: string
    columnLetter: string
    columnIndex: number
    role: AmazonDealColumnRole
    editable: boolean
    hidden: boolean
    required: boolean
}

export interface AmazonDealRow {
    id: string
    rowNumber: number
    groupKey: string
    values: Record<string, AmazonDealCellValue>
    displayValues: Record<string, string>
    options: Record<string, string[]>
    writeTargets: Record<string, string>
    validationMessages: string[]
}

export interface AmazonDealParseResult {
    workbookBase64: string
    fileName: string
    sheetName: string
    headerRowNumber: number
    fieldRowNumber: number
    dataStartRowNumber: number
    rowCount: number
    columns: AmazonDealColumn[]
    editableKeys: string[]
    rows: AmazonDealRow[]
    summary: {
        participating: number
        notParticipating: number
        bestDeal: number
        lightningDeal: number
        warnings: number
        minStartDate: string | null
        maxEndDate: string | null
    }
}

export interface AmazonDealExportRow {
    rowNumber: number
    values: Record<string, AmazonDealCellValue>
    writeTargets?: Record<string, string>
}

export interface AmazonDealExportRequest {
    workbookBase64: string
    sheetName: string
    columns: AmazonDealColumn[]
    rows: AmazonDealExportRow[]
    fileName?: string
}

export interface AmazonDealHistoryPayload {
    parsed: Omit<AmazonDealParseResult, "rows">
    rows: AmazonDealRow[]
}

export interface AmazonDealHistorySummary {
    id: string
    title: string
    status: "draft" | "exported"
    fileName: string | null
    sheetName: string | null
    rowCount: number
    participatingCount: number
    notParticipatingCount: number
    bestDealCount: number
    lightningDealCount: number
    warningCount: number
    exportedAt: string | null
    createdAt: string
    updatedAt: string
}

export interface AmazonDealHistoryDetail extends AmazonDealHistorySummary {
    payload: AmazonDealHistoryPayload
}
