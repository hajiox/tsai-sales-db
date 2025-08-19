// /lib/supabaseClient.ts ver.1
// ブラウザ専用の Supabase クライアントをシングルトンで提供
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  // HMR/複数importでも同一インスタンスを共有
  // eslint-disable-next-line no-var
  var __tsai_supabase__: SupabaseClient | undefined;
}

/** 全画面で共有するブラウザ用 Supabase クライアント */
export const getSupabase = (): SupabaseClient => {
  if (typeof window === "undefined") {
    throw new Error("getSupabase() is browser-only.");
  }
  if (!globalThis.__tsai_supabase__) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    // ※環境変数はVercelに設定済みであること（引き継ぎに明記）。:contentReference[oaicite:3]{index=3}
    globalThis.__tsai_supabase__ = createBrowserClient(url, anon, {
      auth: {
        // このアプリ専用の安定キー。複数プロジェクトや別タブでも衝突しにくくする。
        storageKey: "tsai-auth",
        flowType: "pkce",
      },
    }) as unknown as SupabaseClient;
  }
  return globalThis.__tsai_supabase__!;
};

export default getSupabase;
