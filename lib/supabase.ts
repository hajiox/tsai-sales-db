'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import pkg from '@/package.json' assert { type: 'json' }

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || pkg.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || pkg.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClientComponentClient({
  supabaseUrl,
  supabaseKey,
})

export const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']
export const isAllowed = (email?: string) =>
  ALLOWED_EMAILS.includes((email || '').toLowerCase())

export type SalesData = {
  id?: string
  date: string
  floor_sales: number
  floor_total: number
  cash_income: number
  register_count: number
  remarks: string
  amazon_sales: number
  amazon_total: number
  rakuten_sales: number
  rakuten_total: number
  yahoo_sales: number
  yahoo_total: number
  mercari_sales: number
  mercari_total: number
  base_sales: number
  base_total: number
  qoo10_sales: number
  qoo10_total: number
  created_at?: string
}

export type DailySalesReport = {
  id?: string
  date: string
  floor_sales: number
  floor_total: number
  cash_income: number
  register_count: number
  remarks: string
  amazon_count: number
  amazon_amount: number
  rakuten_count: number
  rakuten_amount: number
  yahoo_count: number
  yahoo_amount: number
  mercari_count: number
  mercari_amount: number
  base_count: number
  base_amount: number
  qoo10_count: number
  qoo10_amount: number
  created_at?: string
}
