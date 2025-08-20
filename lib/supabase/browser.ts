import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient__: SupabaseClient | undefined;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseBrowserClient must be called on the client');
  }
  if (!globalThis.__supabaseClient__) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    globalThis.__supabaseClient__ = createClient(url, key, {
      auth: {
        // プロジェクト固有のstorageKeyにして重複を避ける
        storageKey: 'sb-tsai-sales-db',
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return globalThis.__supabaseClient__!;
}

