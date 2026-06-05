import JSZip from "jszip"
import * as XLSX from "xlsx"
import type {
    AmazonDealCellValue,
    AmazonDealColumn,
    AmazonDealColumnRole,
    AmazonDealExportRequest,
    AmazonDealParseResult,
    AmazonDealRow,
} from "@/lib/amazon-deals-types"

const TEMPLATE_SHEET_NAME = "タイムセール推奨テンプレート"
const EDITABLE_ROLES = new Set<AmazonDealColumnRole>([
    "sku",
    "participating",
    "schedule",
    "startDate",
    "endDate",
    "dealPrice",
    "committedUnits",
])
const REQUIRED_ROLES = new Set<AmazonDealColumnRole>([
    "sku",
    "participating",
    "schedule",
    "startDate",
    "endDate",
    "dealPrice",
    "committedUnits",
])

interface WorkbookXmlInfo {
    sheetPath: string
    validationsByCell: Map<string, string[]>
    hiddenColumns: Set<number>
}

interface CellAnchor {
    r: number
    c: number
}

export async function parseAmazonDealWorkbook(buffer: Buffer, fileName = "amazon_deals.xlsx"): Promise<AmazonDealParseResult> {
    const workbook = XLSX.read(buffer, { cellStyles: true, cellDates: false })
    const sheetName = workbook.SheetNames.find((name) => name.includes(TEMPLATE_SHEET_NAME)) ?? findLikelyTemplateSheet(workbook)
    const sheet = workbook.Sheets[sheetName]
    if (!sheet?.["!ref"]) {
        throw new Error("Amazonタイムセール推奨テンプレートのシートが見つかりません。")
    }

    const xmlInfo = await readWorkbookXmlInfo(buffer, workbook, sheetName)
    const headerRowNumber = findHeaderRowNumber(sheet)
    const fieldRowNumber = headerRowNumber + 1
    const dataStartRowNumber = fieldRowNumber + 1
    const range = XLSX.utils.decode_range(sheet["!ref"])
    const columns = buildColumns(sheet, range.s.c, range.e.c, headerRowNumber, fieldRowNumber, xmlInfo.hiddenColumns)
    const editableKeys = columns.filter((column) => column.editable).map((column) => column.key)
    const rows = buildRows(sheet, columns, dataStartRowNumber, range.e.r + 1, xmlInfo.validationsByCell)
    const summary = summarizeRows(rows, columns)

    return {
        workbookBase64: buffer.toString("base64"),
        fileName,
        sheetName,
        headerRowNumber,
        fieldRowNumber,
        dataStartRowNumber,
        rowCount: rows.length,
        columns,
        editableKeys,
        rows,
        summary,
    }
}

export async function exportAmazonDealWorkbook(request: AmazonDealExportRequest): Promise<Buffer> {
    if (!request.workbookBase64) throw new Error("元のExcelファイル情報がありません。")
    if (!request.sheetName) throw new Error("対象シート名がありません。")

    const originalBuffer = Buffer.from(request.workbookBase64, "base64")
    const workbook = XLSX.read(originalBuffer, { cellDates: false })
    const xmlInfo = await readWorkbookXmlInfo(originalBuffer, workbook, request.sheetName)
    const zip = await JSZip.loadAsync(originalBuffer)
    const sheetFile = zip.file(xmlInfo.sheetPath)
    if (!sheetFile) throw new Error("Excel内部の対象シートXMLが見つかりません。")

    let sheetXml = await sheetFile.async("string")
    const editableColumns = request.columns.filter((column) => column.editable)
    const writes = new Map<string, { value: AmazonDealCellValue; role: AmazonDealColumnRole }>()

    for (const row of request.rows) {
        for (const column of editableColumns) {
            const target = row.writeTargets?.[column.key] ?? `${column.columnLetter}${row.rowNumber}`
            writes.set(target, { value: row.values[column.key] ?? null, role: column.role })
        }
    }

    for (const [address, write] of writes) {
        sheetXml = patchCellXml(sheetXml, address, write.value, write.role)
    }

    zip.file(xmlInfo.sheetPath, sheetXml)
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

function findLikelyTemplateSheet(workbook: XLSX.WorkBook): string {
    let best = workbook.SheetNames[0]
    let bestScore = -1
    for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name]
        if (!sheet?.["!ref"]) continue
        const range = XLSX.utils.decode_range(sheet["!ref"])
        const score = (range.e.c - range.s.c + 1) * (range.e.r - range.s.r + 1)
        if (score > bestScore) {
            best = name
            bestScore = score
        }
    }
    return best
}

function findHeaderRowNumber(sheet: XLSX.WorkSheet): number {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 20); r++) {
        const values: string[] = []
        for (let c = range.s.c; c <= range.e.c; c++) {
            values.push(getDisplayText(sheet, r, c))
        }
        const joined = values.join("|")
        if (joined.includes("参加中") && joined.includes("タイムセール価格") && joined.includes("商品名")) {
            return r + 1
        }
    }
    throw new Error("テンプレートのヘッダー行を特定できませんでした。")
}

function buildColumns(
    sheet: XLSX.WorkSheet,
    startCol: number,
    endCol: number,
    headerRowNumber: number,
    fieldRowNumber: number,
    hiddenColumns: Set<number>,
): AmazonDealColumn[] {
    const sheetCols = (sheet["!cols"] ?? []) as Array<{ hidden?: boolean } | undefined>
    const columns: AmazonDealColumn[] = []
    for (let c = startCol; c <= endCol; c++) {
        const header = getDisplayText(sheet, headerRowNumber - 1, c)
        const field = getDisplayText(sheet, fieldRowNumber - 1, c)
        const role = detectColumnRole(header, field)
        const columnLetter = XLSX.utils.encode_col(c)
        columns.push({
            key: `${role}_${columnLetter}`,
            header: header || field || columnLetter,
            field,
            columnLetter,
            columnIndex: c,
            role,
            editable: EDITABLE_ROLES.has(role),
            hidden: Boolean(sheetCols[c]?.hidden) || hiddenColumns.has(c),
            required: REQUIRED_ROLES.has(role),
        })
    }
    return columns
}

function buildRows(
    sheet: XLSX.WorkSheet,
    columns: AmazonDealColumn[],
    dataStartRowNumber: number,
    endRowNumber: number,
    validationsByCell: Map<string, string[]>,
): AmazonDealRow[] {
    const merges = (sheet["!merges"] ?? []) as XLSX.Range[]
    const rows: AmazonDealRow[] = []
    const productColumn = columns.find((column) => column.role === "productName")
    const dealAsinColumn = columns.find((column) => column.role === "dealAsin")
    const recommendationColumn = columns.find((column) => column.role === "recommendationId")
    const parentColumn = columns.find((column) => column.role === "parentAsin")

    for (let rowNumber = dataStartRowNumber; rowNumber <= endRowNumber; rowNumber++) {
        const zeroRow = rowNumber - 1
        const productName = productColumn ? getMergedDisplayText(sheet, zeroRow, productColumn.columnIndex, merges) : ""
        const dealAsin = dealAsinColumn ? getMergedDisplayText(sheet, zeroRow, dealAsinColumn.columnIndex, merges) : ""
        if (!productName && !dealAsin) continue

        const values: Record<string, AmazonDealCellValue> = {}
        const displayValues: Record<string, string> = {}
        const options: Record<string, string[]> = {}
        const writeTargets: Record<string, string> = {}

        for (const column of columns) {
            const anchor = getMergeAnchor(zeroRow, column.columnIndex, merges)
            const address = XLSX.utils.encode_cell(anchor)
            values[column.key] = getCellValue(sheet, anchor.r, anchor.c)
            displayValues[column.key] = getDisplayText(sheet, anchor.r, anchor.c)
            writeTargets[column.key] = address
            const validationOptions = validationsByCell.get(address) ?? validationsByCell.get(`${column.columnLetter}${rowNumber}`) ?? []
            if (validationOptions.length > 0) options[column.key] = validationOptions
        }

        const recommendationId = recommendationColumn ? displayValues[recommendationColumn.key] : ""
        const parentAsin = parentColumn ? displayValues[parentColumn.key] : ""
        const groupKey = recommendationId || parentAsin || dealAsin || `row-${rowNumber}`
        const row: AmazonDealRow = {
            id: `${groupKey}-${rowNumber}`,
            rowNumber,
            groupKey,
            values,
            displayValues,
            options,
            writeTargets,
            validationMessages: [],
        }
        row.validationMessages = validateRow(row, columns)
        rows.push(row)
    }

    return rows
}

function validateRow(row: AmazonDealRow, columns: AmazonDealColumn[]): string[] {
    const messages: string[] = []
    const byRole = getColumnKeyByRole(columns)
    const participating = normalizeText(row.displayValues[byRole.participating ?? ""])
    const schedule = normalizeText(row.displayValues[byRole.schedule ?? ""])
    const sellerPrice = toNumber(row.values[byRole.sellerPrice ?? ""])
    const dealPrice = toNumber(row.values[byRole.dealPrice ?? ""])
    const committedUnits = toNumber(row.values[byRole.committedUnits ?? ""])

    if (participating === "はい") {
        if (!schedule) messages.push("参加中ですがスケジュールが未入力です。")
        if (!dealPrice || dealPrice <= 0) messages.push("参加中ですがタイムセール価格が0または未入力です。")
        if (!committedUnits || committedUnits <= 0) messages.push("参加中ですが確定済み商品数が0または未入力です。")
        if (sellerPrice && dealPrice && dealPrice >= sellerPrice) messages.push("タイムセール価格が出品者価格以上です。")
    }

    return messages
}

function summarizeRows(rows: AmazonDealRow[], columns: AmazonDealColumn[]): AmazonDealParseResult["summary"] {
    const byRole = getColumnKeyByRole(columns)
    let participating = 0
    let notParticipating = 0
    let bestDeal = 0
    let lightningDeal = 0
    let warnings = 0
    const startDates: string[] = []
    const endDates: string[] = []

    for (const row of rows) {
        const participatingText = normalizeText(row.displayValues[byRole.participating ?? ""])
        if (participatingText === "はい") participating += 1
        if (participatingText === "いいえ") notParticipating += 1
        const dealType = normalizeText(row.displayValues[byRole.dealType ?? ""])
        if (dealType.includes("おすすめ")) bestDeal += 1
        if (dealType.includes("数量限定")) lightningDeal += 1
        warnings += row.validationMessages.length
        const start = normalizeText(row.displayValues[byRole.startDate ?? ""])
        const end = normalizeText(row.displayValues[byRole.endDate ?? ""])
        if (/^\d{4}-\d{2}-\d{2}$/.test(start)) startDates.push(start)
        if (/^\d{4}-\d{2}-\d{2}$/.test(end)) endDates.push(end)
    }

    return {
        participating,
        notParticipating,
        bestDeal,
        lightningDeal,
        warnings,
        minStartDate: startDates.length ? startDates.sort()[0] : null,
        maxEndDate: endDates.length ? endDates.sort()[endDates.length - 1] : null,
    }
}

function getColumnKeyByRole(columns: AmazonDealColumn[]): Partial<Record<AmazonDealColumnRole, string>> {
    const map: Partial<Record<AmazonDealColumnRole, string>> = {}
    for (const column of columns) {
        if (column.role !== "other" && !map[column.role]) map[column.role] = column.key
    }
    return map
}

function detectColumnRole(header: string, field: string): AmazonDealColumnRole {
    const h = normalizeText(header)
    const f = normalizeText(field).toLowerCase()
    if (f === "parent_asin" || h === "親ASIN") return "parentAsin"
    if (f === "featured_asin" || h === "おすすめのASIN") return "featuredAsin"
    if (f === "deal_asin" || h === "タイムセールのASIN") return "dealAsin"
    if (f === "product_name" || h === "商品名") return "productName"
    if (f === "deal_type" || h === "タイムセールの種類") return "dealType"
    if (f.includes(".recommendation_id") || h === "推奨情報ID") return "recommendationId"
    if (f.includes(".sku") || h === "SKU") return "sku"
    if (f.includes(".participating") || h === "参加中") return "participating"
    if (f.includes(".schedule") || h === "スケジュール") return "schedule"
    if (f.includes(".start_date") || h.startsWith("開始日")) return "startDate"
    if (f.includes(".end_date") || h.startsWith("終了日")) return "endDate"
    if (f.includes(".seller_price") || h.startsWith("出品者の価格")) return "sellerPrice"
    if (f.includes(".deal_price") || h.startsWith("タイムセール価格")) return "dealPrice"
    if (f.includes(".committed_units") || h === "確定済み商品") return "committedUnits"
    if (f.includes(".seller_quantity") || h === "出品者の数量") return "sellerQuantity"
    if (f.includes(".image_url") || h.startsWith("画像URL")) return "imageUrl"
    return "other"
}

async function readWorkbookXmlInfo(buffer: Buffer, workbook: XLSX.WorkBook, sheetName: string): Promise<WorkbookXmlInfo> {
    const zip = await JSZip.loadAsync(buffer)
    const workbookXml = await readZipText(zip, "xl/workbook.xml")
    const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels")
    const sheetPath = resolveSheetPath(workbookXml, relsXml, sheetName)
    const sheetXml = await readZipText(zip, sheetPath)
    const namedRangeOptions = readNamedRangeOptions(workbookXml, workbook)
    const validationsByCell = readValidationOptions(sheetXml, namedRangeOptions)
    const hiddenColumns = readHiddenColumns(sheetXml)
    return { sheetPath, validationsByCell, hiddenColumns }
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path)
    if (!file) throw new Error(`Excel内部ファイルが見つかりません: ${path}`)
    return file.async("string")
}

function resolveSheetPath(workbookXml: string, relsXml: string, sheetName: string): string {
    let relationId: string | null = null
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
        const attrs = match[1]
        const name = xmlUnescape(readXmlAttr(attrs, "name") ?? "")
        if (name === sheetName) {
            relationId = readXmlAttr(attrs, "r:id")
            break
        }
    }
    if (!relationId) throw new Error(`Excel内部でシート「${sheetName}」を解決できません。`)

    for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
        const attrs = match[1]
        if (readXmlAttr(attrs, "Id") === relationId) {
            const target = readXmlAttr(attrs, "Target")
            if (!target) break
            const normalized = target.replace(/^\/?xl\//, "").replace(/^\/+/, "")
            return normalized.startsWith("worksheets/") ? `xl/${normalized}` : `xl/${normalized}`
        }
    }
    throw new Error(`Excel内部でシート「${sheetName}」のXMLパスを解決できません。`)
}

function readNamedRangeOptions(workbookXml: string, workbook: XLSX.WorkBook): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const match of workbookXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
        const name = readXmlAttr(match[1], "name")
        if (!name) continue
        const rangeRef = xmlUnescape(match[2]).trim()
        const options = readWorkbookRangeValues(workbook, rangeRef)
        if (options.length > 0) map.set(name, options)
    }
    return map
}

function readWorkbookRangeValues(workbook: XLSX.WorkBook, rangeRef: string): string[] {
    const match = rangeRef.match(/^(?:'([^']+)'|([^!]+))!(.+)$/)
    if (!match) return []
    const sheetName = (match[1] ?? match[2]).trim()
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return []
    const range = XLSX.utils.decode_range(match[3].replace(/\$/g, ""))
    const values: string[] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
            const value = getDisplayText(sheet, r, c)
            if (value && !values.includes(value)) values.push(value)
        }
    }
    return values
}

function readValidationOptions(sheetXml: string, namedRangeOptions: Map<string, string[]>): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const match of sheetXml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
        const attrs = match[1]
        const sqref = readXmlAttr(attrs, "sqref") ?? ""
        const formula = xmlUnescape(match[2].match(/<formula1>([\s\S]*?)<\/formula1>/)?.[1] ?? "").trim()
        let options = namedRangeOptions.get(formula) ?? []
        if (options.length === 0 && formula.startsWith("\"") && formula.endsWith("\"")) {
            options = formula.slice(1, -1).split(",").map((value) => value.trim()).filter(Boolean)
        }
        if (options.length === 0) continue
        for (const cellRef of expandSqref(sqref)) {
            map.set(cellRef, options)
        }
    }
    return map
}

function readHiddenColumns(sheetXml: string): Set<number> {
    const hidden = new Set<number>()
    const colsMatch = sheetXml.match(/<cols>([\s\S]*?)<\/cols>/)
    if (!colsMatch) return hidden
    for (const match of colsMatch[1].matchAll(/<col\b([^>]*)\/>/g)) {
        const attrs = match[1]
        if (readXmlAttr(attrs, "hidden") !== "true" && readXmlAttr(attrs, "hidden") !== "1") continue
        const min = Number(readXmlAttr(attrs, "min") ?? "0")
        const max = Number(readXmlAttr(attrs, "max") ?? "0")
        for (let col = min; col <= max; col++) hidden.add(col - 1)
    }
    return hidden
}

function expandSqref(sqref: string): string[] {
    const refs: string[] = []
    for (const part of sqref.split(/\s+/).filter(Boolean)) {
        if (!part.includes(":")) {
            refs.push(part)
            continue
        }
        const [start, end] = part.split(":")
        const range = XLSX.utils.decode_range(`${start}:${end}`)
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) refs.push(XLSX.utils.encode_cell({ r, c }))
        }
    }
    return refs
}

function getMergeAnchor(r: number, c: number, merges: XLSX.Range[]): CellAnchor {
    const merge = merges.find((range) => r >= range.s.r && r <= range.e.r && c >= range.s.c && c <= range.e.c)
    return merge ? { r: merge.s.r, c: merge.s.c } : { r, c }
}

function getMergedDisplayText(sheet: XLSX.WorkSheet, r: number, c: number, merges: XLSX.Range[]): string {
    const anchor = getMergeAnchor(r, c, merges)
    return getDisplayText(sheet, anchor.r, anchor.c)
}

function getDisplayText(sheet: XLSX.WorkSheet, r: number, c: number): string {
    const address = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[address]
    if (!cell) return ""
    const value = cell.w ?? cell.v
    return value === undefined || value === null ? "" : String(value)
}

function getCellValue(sheet: XLSX.WorkSheet, r: number, c: number): AmazonDealCellValue {
    const address = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[address]
    if (!cell || cell.v === undefined || cell.v === null) return null
    if (typeof cell.v === "number") return cell.v
    return String(cell.v)
}

function patchCellXml(sheetXml: string, address: string, value: AmazonDealCellValue, role: AmazonDealColumnRole): string {
    const rowNumber = XLSX.utils.decode_cell(address).r + 1
    const rowPattern = new RegExp(`<row\\b(?=[^>]*\\br="${rowNumber}"(?:\\s|>))[^>]*>[\\s\\S]*?<\\/row>`)
    const rowMatch = sheetXml.match(rowPattern)
    if (!rowMatch) throw new Error(`Excel内部で行 ${rowNumber} が見つかりません。`)

    const rowXml = rowMatch[0]
    const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${escapeRegExp(address)}"(?:\\s|>))[^>]*(?:>[\\s\\S]*?<\\/c>|\\s*\\/>)`)
    const cellMatch = rowXml.match(cellPattern)
    const styleAttr = cellMatch?.[0].match(/\s(s="[^"]*")/)?.[1] ?? ""
    const cellXml = buildCellXml(address, styleAttr, value, role)
    const nextRowXml = cellMatch
        ? rowXml.replace(cellPattern, cellXml)
        : insertCellXml(rowXml, address, cellXml)

    return sheetXml.replace(rowXml, nextRowXml)
}

function insertCellXml(rowXml: string, address: string, cellXml: string): string {
    const cells = [...rowXml.matchAll(/<c\b[^>]*\br="([^"]+)"[^>]*(?:>[\s\S]*?<\/c>|\s*\/>)/g)]
    const target = XLSX.utils.decode_cell(address)
    for (const match of cells) {
        const current = XLSX.utils.decode_cell(match[1])
        if (current.c > target.c) return rowXml.replace(match[0], `${cellXml}${match[0]}`)
    }
    return rowXml.replace("</row>", `${cellXml}</row>`)
}

function buildCellXml(address: string, styleAttr: string, value: AmazonDealCellValue, role: AmazonDealColumnRole): string {
    const style = styleAttr ? ` ${styleAttr}` : ""
    if (value === null || value === undefined || value === "") return `<c r="${address}"${style}/>`

    const raw = String(value).trim()
    if (isNumericRole(role) && /^-?\d+(?:\.\d+)?$/.test(raw)) {
        return `<c r="${address}"${style}><v>${raw}</v></c>`
    }
    return `<c r="${address}" t="inlineStr"${style}><is><t>${xmlEscape(String(value))}</t></is></c>`
}

function isNumericRole(role: AmazonDealColumnRole): boolean {
    return role === "dealPrice" || role === "committedUnits"
}

function readXmlAttr(attrs: string, name: string): string | null {
    const match = attrs.match(new RegExp(`${escapeRegExp(name)}="([^"]*)"`))
    return match ? match[1] : null
}

function normalizeText(value: unknown): string {
    return String(value ?? "").trim()
}

function toNumber(value: AmazonDealCellValue | undefined): number | null {
    if (value === null || value === undefined || value === "") return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

function xmlUnescape(value: string): string {
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
}
