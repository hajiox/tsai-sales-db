import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })()
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()

function getSupabase() {
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
    })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const supabase = getSupabase()
        const { data, error } = await supabase
            .from("amazon_deal_histories")
            .select("*")
            .eq("id", id)
            .single()

        if (error) throw error
        return NextResponse.json({ history: mapHistoryDetail(data) })
    } catch (error) {
        console.error("Amazon deal history detail error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Amazonタイムセール履歴の読み込みに失敗しました。" },
            { status: 500 },
        )
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const supabase = getSupabase()
        const { error } = await supabase
            .from("amazon_deal_histories")
            .delete()
            .eq("id", id)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("Amazon deal history delete error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Amazonタイムセール履歴の削除に失敗しました。" },
            { status: 500 },
        )
    }
}

function mapHistoryDetail(row: any) {
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
        payload: row.payload,
    }
}
