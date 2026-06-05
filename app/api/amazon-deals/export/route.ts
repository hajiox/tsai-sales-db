import { NextResponse } from "next/server"
import { exportAmazonDealWorkbook } from "@/lib/amazon-deals-workbook"
import type { AmazonDealExportRequest } from "@/lib/amazon-deals-types"

export const runtime = "nodejs"

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as AmazonDealExportRequest
        const buffer = await exportAmazonDealWorkbook(body)
        const safeName = buildDownloadName(body.fileName)
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
                "Cache-Control": "no-store",
            },
        })
    } catch (error) {
        console.error("Amazon deal workbook export error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Excelの書き出しに失敗しました。" },
            { status: 500 },
        )
    }
}

function buildDownloadName(fileName?: string): string {
    const base = (fileName || "amazon_deal_recommendations.xlsx")
        .replace(/\.xlsx$/i, "")
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 120)
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    return `${base}_edited_${stamp}.xlsx`
}
