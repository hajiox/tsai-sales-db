'use client';
// ver.1 (2025-08-19 JST) - singleton supabase client
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_KEY = 'sb-tsai-sales-db';
let _sb: SupabaseClient | undefined;
export default function getSupabase() {
  if (_sb) return _sb;
  _sb = createClient(url, anon, { auth: { persistSession: true, storageKey: STORAGE_KEY } });
  return _sb;
}
