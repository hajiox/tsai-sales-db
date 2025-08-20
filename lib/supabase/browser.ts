// /lib/supabase/browser.ts ver.1 (2025-08-19 JST)
'use client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import { Database } from '@/types/supabase' // 型があれば有効化

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// HMRでも単一インスタンスを維持
const g = globalThis as unknown as { __sb?: SupabaseClient /*<Database>*/ };

export function getSupabaseBrowserClient(): SupabaseClient /*<Database>*/ {
  if (!g.__sb) {
    if (typeof window === 'undefined') throw new Error('This client is browser-only');
    g.__sb = createClient(/*<Database>*/ url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // ここが重要：auth-helpers由来のクライアントとstorageKeyを分離し、警告を防止
        storageKey: 'tsai-auth',
      },
    });
  }
  return g.__sb;
}

export default getSupabaseBrowserClient;
