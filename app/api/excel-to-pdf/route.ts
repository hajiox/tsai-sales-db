// /app/api/excel-to-pdf/route.ts
// Excel→PDF変換API
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import puppeteer from 'puppeteer'

const RECIPE_DIR = 'C:\\作業用\\レシピ'

// GET: Excelファイル一覧とシート情報を取得
export async function GET() {
    try {
        const files = fs.readdirSync(RECIPE_DIR)
            .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))

        const result = files.map(filename => {
            const filePath = path.join(RECIPE_DIR, filename)
            const buffer = fs.readFileSync(filePath)
            const workbook = XLSX.read(buffer, { type: 'buffer' })
            const baseName = filename.replace(/\.(xlsx|xls)$/, '')
            const outputDir = path.join(RECIPE_DIR, baseName)

            // 既存のPDFを確認
            let existingPdfs: string[] = []
            if (fs.existsSync(outputDir)) {
                existingPdfs = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'))
            }

            return {
                filename,
                baseName,
                sheetNames: workbook.SheetNames,
                sheetCount: workbook.SheetNames.length,
                existingPdfCount: existingPdfs.length,
            }
        })

        return NextResponse.json({ files: result })
    } catch (error: unknown) {
        console.error('Excel file list error:', error)
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// シートデータをHTMLテーブルに変換（文字が認識できるクオリティ重視）
function sheetToHtml(sheet: XLSX.WorkSheet, sheetName: string): string {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    const merges = sheet['!merges'] || []

    // マージセル情報をマップ化
    const mergeMap = new Map<string, { rowspan: number; colspan: number; hidden: boolean }>()
    for (const merge of merges) {
        for (let r = merge.s.r; r <= merge.e.r; r++) {
            for (let c = merge.s.c; c <= merge.e.c; c++) {
                const key = `${r}-${c}`
                if (r === merge.s.r && c === merge.s.c) {
                    mergeMap.set(key, {
                        rowspan: merge.e.r - merge.s.r + 1,
                        colspan: merge.e.c - merge.s.c + 1,
                        hidden: false,
                    })
                } else {
                    mergeMap.set(key, { rowspan: 0, colspan: 0, hidden: true })
                }
            }
        }
    }

    // 列幅情報
    const colWidths = sheet['!cols'] || []

    let html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${sheetName}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: "Yu Gothic Medium", "游ゴシック Medium", "Yu Gothic", "游ゴシック", "Hiragino Kaku Gothic ProN", "ヒラギノ角ゴ ProN", "Meiryo", "メイリオ", sans-serif;
    font-size: 9pt;
    line-height: 1.3;
    color: #1a1a1a;
    background: white;
    -webkit-font-smoothing: antialiased;
  }
  .sheet-title {
    font-size: 11pt;
    font-weight: bold;
    margin-bottom: 6px;
    padding: 3px 8px;
    background: #f0f0f0;
    border-left: 4px solid #4a90d9;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    table-layout: auto;
    page-break-inside: auto;
  }
  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
  th, td {
    border: 1px solid #999;
    padding: 2px 5px;
    text-align: left;
    vertical-align: middle;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 9pt;
    min-height: 16px;
  }
  th {
    background-color: #e8e8e8;
    font-weight: bold;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .header-row td, .header-row th {
    background-color: #d4e6f1;
    font-weight: bold;
    font-size: 9pt;
  }
  /* 色付きセル用 */
  .bg-yellow { background-color: #fffde7; }
  .bg-green { background-color: #e8f5e9; }
  .bg-orange { background-color: #fff3e0; }
  .bg-blue { background-color: #e3f2fd; }
  .bg-pink { background-color: #fce4ec; }
  .bg-gray { background-color: #f5f5f5; }
</style>
</head>
<body>
<div class="sheet-title">${escapeHtml(sheetName)}</div>
<table>
`

    // ヘッダー行の推定（最初の数行）
    const headerRows = new Set<number>()
    for (let r = range.s.r; r <= Math.min(range.s.r + 2, range.e.r); r++) {
        let hasData = false
        for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c })
            const cell = sheet[addr]
            if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
                hasData = true
                break
            }
        }
        if (hasData && r <= range.s.r + 1) headerRows.add(r)
    }

    for (let r = range.s.r; r <= range.e.r; r++) {
        const isHeader = headerRows.has(r)
        html += `<tr${isHeader ? ' class="header-row"' : ''}>`

        for (let c = range.s.c; c <= range.e.c; c++) {
            const key = `${r}-${c}`
            const mergeInfo = mergeMap.get(key)

            // マージされたセルの非表示部分はスキップ
            if (mergeInfo?.hidden) continue

            const addr = XLSX.utils.encode_cell({ r, c })
            const cell = sheet[addr]

            let value = ''
            let isNumber = false

            if (cell) {
                if (cell.t === 'n') {
                    // 数値: フォーマット適用
                    isNumber = true
                    if (cell.z) {
                        try {
                            value = XLSX.SSF.format(cell.z, cell.v as number)
                        } catch {
                            value = String(cell.v)
                        }
                    } else {
                        const num = cell.v as number
                        if (Number.isInteger(num)) {
                            value = num.toLocaleString()
                        } else {
                            value = num.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        }
                    }
                } else if (cell.t === 'b') {
                    value = cell.v ? 'TRUE' : 'FALSE'
                } else if (cell.w) {
                    value = cell.w
                } else if (cell.v !== undefined && cell.v !== null) {
                    value = String(cell.v)
                }
            }

            const tag = isHeader ? 'th' : 'td'
            let attrs = ''
            if (mergeInfo && !mergeInfo.hidden) {
                if (mergeInfo.rowspan > 1) attrs += ` rowspan="${mergeInfo.rowspan}"`
                if (mergeInfo.colspan > 1) attrs += ` colspan="${mergeInfo.colspan}"`
            }

            const numClass = isNumber && !isHeader ? ' class="num"' : ''

            // 列幅のヒント
            let style = ''
            if (colWidths[c] && colWidths[c].wch) {
                const w = Math.min(Math.max(colWidths[c].wch! * 7, 30), 400)
                style = ` style="min-width:${w}px"`
            }

            html += `<${tag}${attrs}${numClass}${style}>${escapeHtml(value)}</${tag}>`
        }

        html += '</tr>\n'
    }

    html += `</table>
</body>
</html>`

    return html
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

// POST: 変換実行
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { filename, sheetIndex } = body

        if (!filename) {
            return NextResponse.json({ error: 'filename is required' }, { status: 400 })
        }

        const filePath = path.join(RECIPE_DIR, filename)
        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: `File not found: ${filename}` }, { status: 404 })
        }

        const buffer = fs.readFileSync(filePath)
        const workbook = XLSX.read(buffer, {
            type: 'buffer',
            cellStyles: true,
            cellDates: true,
            cellNF: true,
        })

        const baseName = filename.replace(/\.(xlsx|xls)$/, '')
        const outputDir = path.join(RECIPE_DIR, baseName)

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        // シートインデックスが指定されている場合は1シートのみ
        const sheetsToConvert = sheetIndex !== undefined
            ? [{ name: workbook.SheetNames[sheetIndex], index: sheetIndex }]
            : workbook.SheetNames.map((name, index) => ({ name, index }))

        // Puppeteerブラウザを起動
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--font-render-hinting=none',
            ],
        })

        const results: { sheetName: string; status: string; pdfPath?: string; error?: string }[] = []

        for (const sheetInfo of sheetsToConvert) {
            try {
                const sheet = workbook.Sheets[sheetInfo.name]
                if (!sheet || !sheet['!ref']) {
                    results.push({ sheetName: sheetInfo.name, status: 'skipped', error: 'Empty sheet' })
                    continue
                }

                const html = sheetToHtml(sheet, sheetInfo.name)

                // シート名からファイル名に使えない文字を除去
                const safeSheetName = sheetInfo.name
                    .replace(/[\\/:*?"<>|]/g, '_')
                    .replace(/\s+/g, ' ')
                    .trim()

                const pdfFileName = `${safeSheetName}.pdf`
                const pdfPath = path.join(outputDir, pdfFileName)

                const page = await browser.newPage()
                await page.setContent(html, { waitUntil: 'networkidle0' })

                await page.pdf({
                    path: pdfPath,
                    format: 'A4',
                    landscape: true,
                    printBackground: true,
                    margin: {
                        top: '8mm',
                        right: '8mm',
                        bottom: '8mm',
                        left: '8mm',
                    },
                    preferCSSPageSize: false,
                })

                await page.close()

                results.push({
                    sheetName: sheetInfo.name,
                    status: 'success',
                    pdfPath: pdfFileName,
                })
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                results.push({
                    sheetName: sheetInfo.name,
                    status: 'error',
                    error: message,
                })
            }
        }

        await browser.close()

        return NextResponse.json({
            success: true,
            baseName,
            outputDir,
            results,
            totalSheets: sheetsToConvert.length,
            successCount: results.filter(r => r.status === 'success').length,
            errorCount: results.filter(r => r.status === 'error').length,
            skippedCount: results.filter(r => r.status === 'skipped').length,
        })
    } catch (error: unknown) {
        console.error('Excel to PDF conversion error:', error)
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
