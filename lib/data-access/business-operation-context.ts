import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type BusinessOperationContext = {
  connectionId: string;
  actor: string;
  operation: string;
  pathname: string;
  method: string;
  origin: string;
  session: Session;
};
const contexts = new AsyncLocalStorage<BusinessOperationContext>();
const trustedSessions = new WeakSet<object>();

/** Only the authenticated operations gateway calls this; no request header grants this context. */
export function runWithBusinessOperationContext<T>(
  input: { connectionId: string; operation: string; request: Request },
  callback: () => T,
): T {
  const url = new URL(input.request.url);
  const actor = `data-access:${input.connectionId}`;
  const session: Session = { user: { email: actor, name: actor }, expires: new Date(Date.now() + 300_000).toISOString() };
  trustedSessions.add(session);
  return contexts.run({ ...input, actor, origin: url.origin, pathname: url.pathname, method: input.request.method.toUpperCase(), session }, callback);
}

export function hasBusinessOperationContext(request?: Request): boolean {
  const context = contexts.getStore();
  if (!context) return false;
  if (!request) return true;
  const url = new URL(request.url);
  return context.origin === url.origin && context.pathname === url.pathname && context.method === request.method.toUpperCase();
}

export async function getBusinessAdminSession(request?: Request): Promise<Session | null> {
  const context = contexts.getStore();
  // A mismatched nested request must not inherit the gateway caller's privileges.
  if (context) return hasBusinessOperationContext(request) ? context.session : null;
  return getServerSession(authOptions);
}

export function isBusinessAdminSession(session: Session | null | undefined): session is Session & { user: NonNullable<Session["user"]> & { email: string } } {
  if (!session) return false;
  const context = contexts.getStore();
  if (context) return session === context.session && trustedSessions.has(session);
  return session.user?.email?.trim().toLowerCase() === "aizubrandhall@gmail.com";
}
