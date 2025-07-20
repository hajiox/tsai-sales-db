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
  total_count: number
  series?: string
  series_code?: number
  product_code?: number
}
