import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Only use after requireRecipeAdminRequest; never export this client to a browser. */
export function createRecipeDataAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server data access is not configured');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
