// /app/api/rakuten-ads/product-names/route.ts
// 楽天商品コード → 商品名マッピングの取得・登録・一括投入
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export const dynamic = 'force-dynamic'

// GET: 全マッピングを取得
export async function GET() {
    const { data, error } = await supabase
        .from('rakuten_product_names')
        .select('product_code, product_name')
        .order('product_code')

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data: data || [] })
}

// POST: 1件 or 一括登録 (upsert)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        // 一括: { items: [{ product_code, product_name }] }
        // 単体: { product_code, product_name }
        const items = body.items || [{ product_code: body.product_code, product_name: body.product_name }]

        if (!items.length || !items[0].product_code) {
            return NextResponse.json({ success: false, error: 'product_code は必須です' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('rakuten_product_names')
            .upsert(
                items.map((item: any) => ({
                    product_code: String(item.product_code).trim(),
                    product_name: String(item.product_name || '').trim().substring(0, 30),
                    updated_at: new Date().toISOString(),
                })),
                { onConflict: 'product_code' }
            )
            .select()

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, upserted: items.length })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
