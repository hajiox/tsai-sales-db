
// /app/api/import/rakuten-parse/route.ts - 修正済み

import { parseCSVLine, extractImportantKeywords } from '@/lib/csvHelpers'

export async function POST(req: Request) {
  try {
    const text = await req.text()
    const lines = text.split('\n')

    // 「商品名」を含む行を探してそこから解析を開始
    const headerIndex = lines.findIndex(line => line.includes('商品名'))
    if (headerIndex === -1) {
      return new Response(JSON.stringify({ error: 'CSVフォーマット不正（商品名列が見つからない）' }), { status: 400 })
    }

    const dataLines = lines.slice(headerIndex)
    const parsed = dataLines.map(line => parseCSVLine(line))

    // 商品名（A列）と個数（E列）を抽出
    const result = parsed.map((cols) => {
      const productName = cols[0]
      const quantity = cols[4]
      const keywords = extractImportantKeywords(productName)

      return {
        name: productName,
        quantity,
        keywords
      }
    })

    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err) {
    console.error("楽天CSV解析中にエラー:", err)
    return new Response(JSON.stringify({ error: '楽天CSV解析中にエラーが発生しました' }), { status: 500 })
  }
}
