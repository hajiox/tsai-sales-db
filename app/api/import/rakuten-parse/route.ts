
// /app/api/import/rakuten-parse/route.ts - 最終修正版

import { parseCSVLine, extractImportantKeywords } from '@/lib/csvHelpers'

export async function POST(req: Request) {
  try {
    const text = await req.text()
    const lines = text.split('\n')

    // 「商品名」を含む行を探してそこから解析を開始
    const headerIndex = lines.findIndex(line => line.includes('商品名'))
    if (headerIndex === -1) {
      return new Response(JSON.stringify({
        error: 'CSVフォーマット不正（商品名列が見つかりませんでした）'
      }), { status: 400 })
    }

    const dataLines = lines.slice(headerIndex)
    const parsed = dataLines.map(line => parseCSVLine(line))

    // 商品名（A列）と個数（E列）を抽出
    const result = parsed.map((cols, index) => {
      const productName = cols[0]
      const quantity = cols[4]

      const keywords = extractImportantKeywords(productName)

      return {
        row: index + 1,
        name: productName,
        quantity,
        keywords
      }
    })

    return new Response(JSON.stringify({ result }), { status: 200 })

  } catch (err: any) {
    console.error("楽天CSV解析中にエラー:", err)
    return new Response(JSON.stringify({
      error: String(err?.message || err)
    }), { status: 500 })
  }
}
