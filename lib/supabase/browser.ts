import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// HMRや複数バンドルでも単一インスタンスに固定
declare global {
  // eslint-disable-next-line no-var
  var __SB_SINGLETON__: SupabaseClient | undefined;
}

function _newClient(): SupabaseClient {
  return createBrowserClient(URL, KEY, {
    auth: {
      storageKey: "sb-auth",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

/** ブラウザで呼ばれた時だけ生成（サーバでは呼ばない） */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // サーバーから呼ばれた場合のみ明示エラー（import だけなら発火しない）
    throw new Error("Use server client on the server side");
  }
  if (!globalThis.__SB_SINGLETON__) {
    globalThis.__SB_SINGLETON__ = _newClient();
  }
  return globalThis.__SB_SINGLETON__;
}

/* 後方互換（named/default どちらの import でも可） */
export const createClient = getSupabaseBrowserClient;
export default getSupabaseBrowserClient;

/* ⚠️ 重要：サーバ落下の原因になるので “即生成したインスタンス” は export しない
   （例：export const supabase = getSupabaseBrowserClient(); は置かない） */
