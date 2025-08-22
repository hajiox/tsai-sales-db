// 互換レイヤー：古い `import { supabase } from '@/lib/supabase'` を吸収
// 以降は getSupabaseBrowserClient() を経由する同一インスタンスのみを返す
'use client'
import { getSupabaseBrowserClient } from './browser'

export { getSupabaseBrowserClient }

// 既存コード互換のための名前付きエクスポート
// ※ 実体はシングルトン（browser.ts の globalThis.__supabaseClient__）
export const supabase = getSupabaseBrowserClient()
