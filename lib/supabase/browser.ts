// /lib/supabase/browser.ts
// 後方互換あり：named(default) / 関数 / 既成インスタンス すべて吸収
import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// HMR/複数バンドルでも単一化（同一タブ内で1個だけ）
declare global {
  // eslint-disable-next-line no-var
  var __SB_SINGLETON__: SupabaseClient | undefined;
}

function _newClient() {
  return createBrowserClient(URL, KEY, {
    auth: {
      // 複数クライアントを避けるため storageKey を固定
      storageKey: "sb-auth",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

// 常に同じインスタンスを返す
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // ブラウザ専用。SSR は /lib/supabase/server.ts を使う
    throw new Error("Use server client on the server side");
  }
  if (!globalThis.__SB_SINGLETON__) {
    globalThis.__SB_SINGLETON__ = _newClient();
  }
  return globalThis.__SB_SINGLETON__;
}

// 互換用エクスポート（既存コードを壊さない）
export const createClient = getSupabaseBrowserClient; // named import 互換
const defaultExport = getSupabaseBrowserClient;       // default import 互換
export default defaultExport;

// “そのまま使いたい派”向けのインスタンス（読むだけ）
export const supabase = getSupabaseBrowserClient();
