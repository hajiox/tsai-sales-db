// lib/supabase.ts (修正後)

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
}
if (!supabaseKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
}

// 認証情報なしの、基本的なSupabaseクライアント（公開情報へのアクセスなどに使用）
export const supabase = createClient(supabaseUrl, supabaseKey);

// NextAuthのセッショントークンを使って認証済みのクライアントを生成する新しいヘルパー関数
export const createAuthenticatedSupabaseClient = (supabaseAccessToken: string) => {
  if (!supabaseAccessToken) {
    throw new Error("Supabase access token is missing.");
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        // 全てのリクエストに、NextAuthから受け取った身分証明書（トークン）を添付する
        Authorization: `Bearer ${supabaseAccessToken}`
      }
    }
  });
};
