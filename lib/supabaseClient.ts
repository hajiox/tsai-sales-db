// /lib/supabaseClient.ts ver.2
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  // HMR/重複importでも同一インスタンス共有
  // eslint-disable-next-line no-var
  var __tsai_supabase__: SupabaseClient | undefined;
}

/** ブラウザ専用 Supabase クライアント（シングルトン） */
export const getSupabase = (): SupabaseClient => {
  if (typeof window === "undefined") throw new Error("getSupabase() is browser-only.");
  if (!globalThis.__tsai_supabase__) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    globalThis.__tsai_supabase__ = createBrowserClient(url, anon, {
      auth: {
        storageKey: "tsai-auth",
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // 衝突源を遮断
        multiTab: false,
      },
    }) as unknown as SupabaseClient;
  }
  return globalThis.__tsai_supabase__!;
};

export default getSupabase;
