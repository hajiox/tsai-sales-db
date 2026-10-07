import { createClient } from '@supabase/supabase-js';
import { getNextAuthSupabaseAccessToken } from './supabase/nextauth-access-token';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!supabaseKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');

// Existing browser callers keep one client; each request uses the current NextAuth JWT.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: getNextAuthSupabaseAccessToken,
});

export const createAuthenticatedSupabaseClient = (supabaseAccessToken: string) => {
  if (!supabaseAccessToken) throw new Error('Supabase access token is missing.');
  return createClient(supabaseUrl, supabaseKey, {
    accessToken: async () => supabaseAccessToken,
  });
};
