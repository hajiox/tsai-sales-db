'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/* ───── Supabase 接続情報（固定値） ───── */
const SUPABASE_URL = 'https://zrerpexdsaxqztqqrwwv.supabase.co'
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNjAzOTgsImV4cCI6MjA2NDkzNjM5OH0.nVWvJfsSAC7dnNCuXLxoN5OvQ4ShQI5FOwipkMlKNec'

export const supabase = createClientComponentClient({
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
})

/* ───── ログイン許可メール ───── */
export const ALLOWED_EMAILS = ['aizubrandhall@gmail.com']
export const isAllowed = (email?: string) =>
  ALLOWED_EMAILS.includes((email || '').toLowerCase())

/* ---------- 型定義（変更なし） ---------- */
export type SalesData = { /* 省略 */ }
export type DailySalesReport = { /* 省略 */ }
