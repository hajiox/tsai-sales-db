import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { AmazonDealHistoryPayload } from "@/lib/amazon-deals-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SaveHistoryRequest = {
    title?: string
    status?: "draft" | "exported"
    payload?: AmazonDealHistoryPayload
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })()
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()

function getSupabase() {
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
    })
}

export async function GET() {
    try {
        const supabase = getSupabase()
        const { data, error } = await supabase
            .from("amazon_deal_histories")
            .select("id,title,status,file_name,sheet_name,row_count,participating_count,not_participating_count,best_deal_count,lightning_deal_count,warning_count,exported_at,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(30)

        if (error) throw error
        return NextResponse.json({ histories: (data ?? []).map(mapHistorySummary) })
    } catch (error) {
        console.error("Amazon deal histories list error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Amazonタイムセール履歴の取得に失敗しました。" },
            { status: 500 },
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as SaveHistoryRequest
        const payload = body.payload
        if (!payload?.parsed || !Array.isArray(payload.rows)) {
            return NextResponse.json({ error: "保存するタイムセール表がありません。" }, { status: 400 })
        }

        const status = body.status === "exported" ? "exported" : "draft"
        const rowSummary = summarizeRows(payload)
        const now = new Date().toISOString()
        const title = (body.title || buildDefaultTitle(status, payload.parsed.fileName, rowSummary.rowCount)).slice(0, 200)

        const supabase = getSupabase()
        const { data, error } = await supabase
            .from("amazon_deal_histories")
            .insert({
                title,
                status,
                file_name: payload.parsed.fileName ?? null,
                sheet_name: payload.parsed.sheetName ?? null,
                row_count: rowSummary.rowCount,
                participating_count: rowSummary.participatingCount,
                not_participating_count: rowSummary.notParticipatingCount,
                best_deal_count: rowSummary.bestDealCount,
                lightning_deal_count: rowSummary.lightningDealCount,
                warning_count: rowSummary.warningCount,
                payload,
                exported_at: status === "exported" ? now : null,
                updated_at: now,
            })
            .select("id,title,status,file_name,sheet_name,row_count,participating_count,not_participating_count,best_deal_count,lightning_deal_count,warning_count,exported_at,created_at,updated_at")
            .single()

        if (error) throw error
        return NextResponse.json({ history: mapHistorySummary(data) })
    } catch (error) {
        console.error("Amazon deal history save error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Amazonタイムセール履歴の保存に失敗しました。" },
            { status: 500 },
        )
    }
}

function summarizeRows(payload: AmazonDealHistoryPayload) {
    const byRole: Record<string, string> = {}
    payload.parsed.columns.forEach((column) => {
        if (column.role !== "other" && !byRole[column.role]) byRole[column.role] = column.key
    })
    let participatingCount = 0
    let notParticipatingCount = 0
    let bestDealCount = 0
    let lightningDealCount = 0
    let warningCount = 0
    payload.rows.forEach((row) => {
        const participating = String(row.values[byRole.participating] ?? "").trim()
        const dealType = String(row.values[byRole.dealType] ?? row.displayValues[byRole.dealType] ?? "")
        if (participating === "はい") participatingCount += 1
        if (participating === "いいえ") notParticipatingCount += 1
        if (dealType.includes("おすすめ") || dealType.toLowerCase().includes("best")) bestDealCount += 1
        if (dealType.includes("数量限定") || dealType.toLowerCase().includes("lightning")) lightningDealCount += 1
        warningCount += row.validationMessages.length
    })
    return {
        rowCount: payload.rows.length,
        participatingCount,
        notParticipatingCount,
        bestDealCount,
        lightningDealCount,
        warningCount,
    }
}

function buildDefaultTitle(status: "draft" | "exported", fileName: string | undefined, rowCount: number) {
    const label = status === "exported" ? "出力保存" : "仮保存"
    const base = (fileName || "Amazonタイムセール").replace(/\.xlsx$/i, "")
    return `${label} ${base} ${rowCount}件`
}

function mapHistorySummary(row: any) {
    return {
        id: row.id,
        title: row.title,
        status: row.status,
        fileName: row.file_name,
        sheetName: row.sheet_name,
        rowCount: row.row_count,
        participatingCount: row.participating_count,
        notParticipatingCount: row.not_participating_count,
        bestDealCount: row.best_deal_count,
        lightningDealCount: row.lightning_deal_count,
        warningCount: row.warning_count,
        exportedAt: row.exported_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}
