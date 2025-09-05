// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const KPI_PREFIX = "/kpi";
const KPI_PASS_COOKIE = "kpi_pass_ok";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const isLoggedIn = token && token.email === "aizubrandhall@gmail.com";

  // ① まずは既存のログイン要件
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // ② KPI だけ追加パスワード保護
  const { pathname, search } = req.nextUrl;
  const isKpi = pathname.startsWith(KPI_PREFIX);
  const isKpiPasswordPage = pathname === "/kpi/enter-password";

  if (isKpi && !isKpiPasswordPage) {
    const ok = req.cookies.get(KPI_PASS_COOKIE)?.value === "1";
    if (!ok) {
      const url = new URL("/kpi/enter-password", req.url);
      url.searchParams.set("next", pathname + search); // 戻り先
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // 既存の除外はそのまま。/api は除外されるので API で Cookie を発行できます
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|auth).*)"],
};
