// /lib/unitPriceHelper.ts
// CSVインポート時にunit_price（単価スナップショット）を保存するためのヘルパー
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 商品の現在価格と利益率を取得してunit_price/unit_profit_rateとして返す
 * 各CSVインポートAPIのinsert時に使用する
 */
export async function getProductUnitPrice(
    supabase: SupabaseClient,
    productId: string
): Promise<{ unit_price: number; unit_profit_rate: number }> {
    const { data } = await supabase
        .from('products')
        .select('price, profit_rate')
        .eq('id', productId)
        .single()

    return {
        unit_price: data?.price || 0,
        unit_profit_rate: data?.profit_rate || 0,
    }
}

/**
 * 複数商品IDのunit_priceを一括取得
 */
export async function getBulkProductUnitPrices(
    supabase: SupabaseClient,
    productIds: string[]
): Promise<Map<string, { unit_price: number; unit_profit_rate: number }>> {
    const map = new Map<string, { unit_price: number; unit_profit_rate: number }>()

    if (productIds.length === 0) return map

    const { data } = await supabase
        .from('products')
        .select('id, price, profit_rate')
        .in('id', productIds)

    data?.forEach((p: { id: string; price: number; profit_rate: number | null }) => {
        map.set(p.id, {
            unit_price: p.price || 0,
            unit_profit_rate: p.profit_rate || 0,
        })
    })

    return map
}
