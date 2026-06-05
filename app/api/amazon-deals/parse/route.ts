import { NextResponse } from "next/server"
import { parseAmazonDealWorkbook } from "@/lib/amazon-deals-workbook"

export const runtime = "nodejs"

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get("file")
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Excelファイルを選択してください。" }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const result = await parseAmazonDealWorkbook(buffer, file.name)
        return NextResponse.json(result)
    } catch (error) {
        console.error("Amazon deal workbook parse error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Excelの読み込みに失敗しました。" },
            { status: 500 },
        )
    }
}
