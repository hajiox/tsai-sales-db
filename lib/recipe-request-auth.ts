import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const RECIPE_ADMIN_EMAIL = "aizubrandhall@gmail.com";
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

/** Browser administration only. Machine clients use the scoped data API. */
export async function requireRecipeAdminRequest(request: Request): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (email !== RECIPE_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!READ_METHODS.has(request.method.toUpperCase()) && !isSameOriginWrite(request)) {
    return NextResponse.json({ error: "Same-origin request required" }, { status: 403 });
  }
  return null;
}
