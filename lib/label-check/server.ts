import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";


export function getLabelCheckAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabaseのサーバー設定がありません");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getLabelCheckUserEmail(): Promise<string | null> {
  const session = await getBusinessAdminSession();
  return isBusinessAdminSession(session) ? session.user.email : null;
}

export function asOptionalText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}
