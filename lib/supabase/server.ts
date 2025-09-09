// lib/supabase/server.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zrerpexdsaxqztqqrwwv.supabase.co'
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNjAzOTgsImV4cCI6MjA2NDkzNjM5OH0.nVWvJfsSAC7dnNCuXLxoN5OvQ4ShQI5FOwipkMlKNec'

// 認証情報なしの、基本的なSupabaseクライアント（公開情報へのアクセスなどに使用）
export const supabase = createClient(supabaseUrl, supabaseKey)
