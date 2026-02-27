// /app/api/excel-to-pdf/route.ts
// Excel→PDF変換API（ローカル専用・レイアウト高精度版）
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import puppeteer from 'puppeteer'

const RECIPE_DIR = 'C:\\作業用\\レシピ'

// GET: ファイル一覧
export async function GET() {
    try {
        if (!fs.existsSync(RECIPE_DIR)) {
            return NextResponse.json({ error: `フォルダが見つかりません: ${RECIPE_DIR}` }, { status: 404 })
        }
        const files = fs.readdirSync(RECIPE_DIR).filter(f => /\.(xlsx|xls)$/i.test(f))
        const result = files.map(filename => {
            const buffer = fs.readFileSync(path.join(RECIPE_DIR, filename))
            const wb = XLSX.read(buffer, { type: 'buffer' })
            const baseName = filename.replace(/\.(xlsx|xls)$/i, '')
            const outputDir = path.join(RECIPE_DIR, baseName)
            let existingPdfs: string[] = []
            if (fs.existsSync(outputDir)) existingPdfs = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'))

            const sheets = wb.SheetNames.map((name, index) => {
                const sh = wb.Sheets[name]
                const hasData = !!(sh && sh['!ref'])
                let rowCount = 0, colCount = 0
                if (hasData && sh['!ref']) {
                    const rng = XLSX.utils.decode_range(sh['!ref']!)
                    rowCount = rng.e.r - rng.s.r + 1
                    colCount = rng.e.c - rng.s.c + 1
                }
                return { name, index, hasData, rowCount, colCount, pdfExists: existingPdfs.includes(sanitize(name) + '.pdf') }
            })

            return { filename, baseName, sheetCount: wb.SheetNames.length, convertibleSheets: sheets.filter(s => s.hasData).length, existingPdfCount: existingPdfs.length, outputDir, sheets }
        })
        return NextResponse.json({ files: result, recipeDir: RECIPE_DIR })
    } catch (error: unknown) {
        console.error('GET error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}

// ──────────────────────────────────────────────────
// Excel → HTML 変換（Excelのレイアウトを忠実に再現）
// ──────────────────────────────────────────────────
function sheetToHtml(sheet: XLSX.WorkSheet, sheetName: string): string {
    if (!sheet['!ref']) return '<html><body><p>Empty sheet</p></body></html>'
    const range = XLSX.utils.decode_range(sheet['!ref'])
    const merges = sheet['!merges'] || []
    const colInfos = sheet['!cols'] || []
    const rowInfos = sheet['!rows'] || []

    // マージセルマップ
    const mergeMap = new Map<string, { rs: number; cs: number; skip: boolean }>()
    for (const m of merges) {
        for (let r = m.s.r; r <= m.e.r; r++) {
            for (let c = m.s.c; c <= m.e.c; c++) {
                if (r === m.s.r && c === m.s.c) {
                    mergeMap.set(`${r},${c}`, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1, skip: false })
                } else {
                    mergeMap.set(`${r},${c}`, { rs: 0, cs: 0, skip: true })
                }
            }
        }
    }

    // 列幅をピクセルで計算（Excelの wch × 7px を基準にする）
    const colWidthsPx: number[] = []
    let totalWidth = 0
    for (let c = range.s.c; c <= range.e.c; c++) {
        const ci = colInfos[c]
        // Excelのデフォルト列幅は約8.43文字
        const wch = ci?.wch ?? ci?.width ?? 8.43
        const px = Math.round(wch * 7.5)
        colWidthsPx.push(px)
        totalWidth += px
    }

    // テーブル全体幅が狭すぎる場合はスケール調整
    const minTableWidth = 1100 // A4横 - マージン
    const scale = totalWidth < minTableWidth ? minTableWidth / totalWidth : 1

    let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>${esc(sheetName)}</title>
<style>
@page { size: A4 landscape; margin: 6mm; }
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: "Meiryo", "メイリオ", "Yu Gothic", "游ゴシック", sans-serif;
  font-size: 8.5pt;
  line-height: 1.25;
  color: #1a1a1a;
  background: #fff;
}
.title {
  font-size: 10pt; font-weight: bold; margin-bottom: 4px;
  padding: 2px 6px; background: #f0f0f0; border-left: 3px solid #4a90d9;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
table {
  border-collapse: collapse;
  table-layout: fixed;
  width: ${Math.round(totalWidth * scale)}px;
  page-break-inside: auto;
}
tr { page-break-inside: avoid; }
td {
  border: 0.5px solid #aaa;
  padding: 1px 3px;
  vertical-align: middle;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 8.5pt;
  overflow: hidden;
}
.r { text-align: right; }
.c { text-align: center; }
.b { font-weight: bold; }
.h { background: #dce6f0; font-weight: bold; }
.g1 { background: #f5f5f5; }
.g2 { background: #fefce8; }
</style>
</head><body>
<div class="title">${esc(sheetName)}</div>
<table>
<colgroup>
`
    // 正確な列幅をcolgroupで指定
    for (let c = range.s.c; c <= range.e.c; c++) {
        html += `<col style="width:${Math.round(colWidthsPx[c - range.s.c] * scale)}px">\n`
    }
    html += '</colgroup>\n'

    for (let r = range.s.r; r <= range.e.r; r++) {
        // 行の高さ
        const ri = rowInfos[r]
        const hidden = ri?.hidden
        if (hidden) continue

        let rowH = ''
        if (ri?.hpt) {
            rowH = ` style="height:${Math.round(ri.hpt * 1.1)}px"`
        } else if (ri?.hpx) {
            rowH = ` style="height:${ri.hpx}px"`
        }

        html += `<tr${rowH}>`

        for (let c = range.s.c; c <= range.e.c; c++) {
            const mk = `${r},${c}`
            const mi = mergeMap.get(mk)
            if (mi?.skip) continue

            const cell = sheet[XLSX.utils.encode_cell({ r, c })]
            let val = ''
            let isNum = false

            if (cell) {
                if (cell.t === 'n') {
                    isNum = true
                    if (cell.w) {
                        val = cell.w
                    } else if (cell.z) {
                        try { val = XLSX.SSF.format(cell.z, cell.v as number) }
                        catch { val = String(cell.v) }
                    } else {
                        const n = cell.v as number
                        val = Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    }
                } else if (cell.t === 'd') {
                    val = cell.w || String(cell.v)
                } else if (cell.t === 'b') {
                    val = cell.v ? 'TRUE' : 'FALSE'
                } else {
                    val = cell.w || (cell.v != null ? String(cell.v) : '')
                }
            }

            // セルの属性
            let attrs = ''
            if (mi && !mi.skip) {
                if (mi.rs > 1) attrs += ` rowspan="${mi.rs}"`
                if (mi.cs > 1) attrs += ` colspan="${mi.cs}"`
            }

            // スタイルクラス
            const classes: string[] = []
            if (isNum) classes.push('r')

            // 行の位置に基づくスタイリング（レシピシートの典型構造に合わせる）
            // 先頭数行はヘッダー領域として扱う
            if (r <= range.s.r + 4 && val.trim()) classes.push('h')

            // 交互背景（見やすさ向上）
            if (r > range.s.r + 4 && (r - range.s.r) % 2 === 0) classes.push('g1')

            const cls = classes.length > 0 ? ` class="${classes.join(' ')}"` : ''

            html += `<td${attrs}${cls}>${esc(val)}</td>`
        }
        html += '</tr>\n'
    }

    html += '</table></body></html>'
    return html
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function sanitize(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

// POST: 1ファイルの全シートをPDFに変換
export async function POST(request: NextRequest) {
    let browser = null
    try {
        const { filename } = await request.json()
        if (!filename) return NextResponse.json({ error: 'filename必須' }, { status: 400 })

        const filePath = path.join(RECIPE_DIR, filename)
        if (!fs.existsSync(filePath)) return NextResponse.json({ error: `ファイルなし: ${filename}` }, { status: 404 })

        const buffer = fs.readFileSync(filePath)
        const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellDates: true, cellNF: true })
        const baseName = filename.replace(/\.(xlsx|xls)$/i, '')
        const outputDir = path.join(RECIPE_DIR, baseName)
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

        const sheets = wb.SheetNames
            .map((name, index) => ({ name, index }))
            .filter(s => { const sh = wb.Sheets[s.name]; return sh && sh['!ref'] })

        if (sheets.length === 0) return NextResponse.json({ error: '変換可能なシートなし' }, { status: 400 })

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--font-render-hinting=none'],
        })

        const results: { sheetName: string; status: string; pdfFile?: string; error?: string }[] = []

        for (const s of sheets) {
            try {
                const sheet = wb.Sheets[s.name]
                const html = sheetToHtml(sheet, s.name)
                const safeName = sanitize(s.name)
                const pdfPath = path.join(outputDir, `${safeName}.pdf`)

                const page = await browser.newPage()
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })

                // ページ内容の幅に合わせてPDF出力サイズを調整
                const contentSize = await page.evaluate(() => {
                    const table = document.querySelector('table')
                    return table ? { w: table.scrollWidth, h: table.scrollHeight } : { w: 1100, h: 800 }
                })

                // 横幅が広い場合はスケールダウン
                const pdfWidth = 1123 // A4 landscape width in px at 96dpi (297mm)
                const pdfMargin = 45  // 6mm * 2 sides
                const availableWidth = pdfWidth - pdfMargin
                const needsScale = contentSize.w > availableWidth
                const scale = needsScale ? availableWidth / contentSize.w : 1

                await page.pdf({
                    path: pdfPath,
                    format: 'A4',
                    landscape: true,
                    printBackground: true,
                    scale: Math.max(scale, 0.5), // 最小50%まで
                    margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
                })

                await page.close()
                results.push({ sheetName: s.name, status: 'success', pdfFile: `${safeName}.pdf` })
            } catch (err: unknown) {
                results.push({ sheetName: s.name, status: 'error', error: err instanceof Error ? err.message : String(err) })
            }
        }

        await browser.close()
        browser = null

        return NextResponse.json({
            success: true, baseName, outputDir,
            totalSheets: wb.SheetNames.length, convertedSheets: sheets.length,
            successCount: results.filter(r => r.status === 'success').length,
            errorCount: results.filter(r => r.status === 'error').length,
            results,
        })
    } catch (error: unknown) {
        if (browser) { try { await browser.close() } catch { } }
        console.error('Conversion error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}
