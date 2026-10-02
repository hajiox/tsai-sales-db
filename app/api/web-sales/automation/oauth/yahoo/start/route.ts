import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFinanceAdmin } from "@/lib/finance-acquisition/auth";
import { assertApiCredentialPersistence, getApiCredentials } from "@/lib/finance-acquisition/credential-store";
import { createYahooOAuthStart, YAHOO_OAUTH_COOKIE, YAHOO_OAUTH_COOKIE_PATH, YAHOO_OAUTH_ORIGIN, YAHOO_OAUTH_TTL } from "@/lib/finance-acquisition/yahoo-oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!await isFinanceAdmin()) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  if (new URL(request.url).origin !== YAHOO_OAUTH_ORIGIN || request.headers.get("origin") !== YAHOO_OAUTH_ORIGIN) {
    return NextResponse.json({ error: "本番TSAから接続を開始してください" }, { status: 403 });
  }
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user?.email;
    if (!user) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
    const values = await getApiCredentials(["YAHOO_SHOPPING_CLIENT_ID", "YAHOO_SHOPPING_CLIENT_SECRET", "YAHOO_SHOPPING_SELLER_ID"]);
    if (!values.YAHOO_SHOPPING_CLIENT_ID || !values.YAHOO_SHOPPING_CLIENT_SECRET || !values.YAHOO_SHOPPING_SELLER_ID) {
      return NextResponse.json({ error: "Yahooのアプリ接続情報と店舗IDを先に設定してください" }, { status: 409 });
    }
    await assertApiCredentialPersistence();
    const start = createYahooOAuthStart(user, values.YAHOO_SHOPPING_CLIENT_ID, process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY);
    const response = NextResponse.redirect(start.authorizationUrl, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(YAHOO_OAUTH_COOKIE, start.cookie, { httpOnly: true, secure: true, sameSite: "lax", path: YAHOO_OAUTH_COOKIE_PATH, maxAge: YAHOO_OAUTH_TTL });
    return response;
  } catch {
    return NextResponse.json({ error: "Yahoo接続の開始条件を確認できません" }, { status: 500 });
  }
}
