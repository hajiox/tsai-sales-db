// /types/db.ts
export interface WebSalesData {
  product_id: string
  product_name: string
  price: number
  profit_rate?: number
  amazon_count: number
  rakuten_count: number
  yahoo_count: number
  mercari_count: number
  base_count: number
  qoo10_count: number
  tiktok_count: number
  amazon_amount?: number | null
  rakuten_amount?: number | null
  yahoo_amount?: number | null
  mercari_amount?: number | null
  base_amount?: number | null
  qoo10_amount?: number | null
  tiktok_amount?: number | null
  total_count: number
  series?: string
  series_code?: number
  product_code?: number
  unit_price?: number       // その月のスナップショット単価
  unit_profit_rate?: number // その月のスナップショット利益率
  unit_cost_ex_ec?: number | null
}
