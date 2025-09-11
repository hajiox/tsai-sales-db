// /lib/supabase/browser.ts
import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"); })();

// HMRや複数バンドルでも単一化
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

/** ブラウザで呼ばれた時だけ生成（SSRでは呼ばない） */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("Use server client on the server side");
  }
  if (!globalThis.__SB_SINGLETON__) {
    globalThis.__SB_SINGLETON__ = _newClient();
  }
  return globalThis.__SB_SINGLETON__;
}

// 互換（named / default どちらでも呼べる）
export const createClient = getSupabaseBrowserClient;
export default getSupabaseBrowserClient;

// ⚠ インスタンスの即時export（supabase = ...）は置かない
