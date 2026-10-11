import { NextResponse } from "next/server";
import { getBusinessAdminSession, isBusinessAdminSession, hasBusinessOperationContext } from "@/lib/data-access/business-operation-context";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOriginWrite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expectedOrigin;

  // Some same-origin clients omit Origin; a browser Referer can establish it.
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

/** Browser administration, or an exact handler invocation from the scoped data gateway. */
export async function requireRecipeAdminRequest(request: Request): Promise<NextResponse | null> {
  const session = await getBusinessAdminSession(request);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isBusinessAdminSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasBusinessOperationContext(request) && !READ_METHODS.has(request.method.toUpperCase()) && !isSameOriginWrite(request)) {
    return NextResponse.json({ error: "Same-origin request required" }, { status: 403 });
  }
  return null;
}
