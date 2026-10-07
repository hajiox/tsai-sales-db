import { getSession } from "next-auth/react";

let pendingSession: Promise<string | null> | undefined;

/** Use the current NextAuth session; never persist or log this bearer token. */
export function getNextAuthSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!pendingSession) {
    pendingSession = getSession({ broadcast: false }).then((session) => {
      const token = (session as { supabaseAccessToken?: unknown } | null)?.supabaseAccessToken;
      return typeof token === "string" && token.length > 0 ? token : null;
    }).finally(() => { pendingSession = undefined; });
  }
  return pendingSession;
}
