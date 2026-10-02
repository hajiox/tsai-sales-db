import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFinanceAdmin } from "@/lib/finance-acquisition/auth";
import { assertApiCredentialPersistence, getApiCredentials, saveRotatedApiCredentials } from "@/lib/finance-acquisition/credential-store";
import { exchangeYahooOAuthCode, validateYahooOAuthCallback, YAHOO_OAUTH_CALLBACK, YAHOO_OAUTH_COOKIE, YAHOO_OAUTH_COOKIE_PATH, YAHOO_OAUTH_ORIGIN } from "@/lib/finance-acquisition/yahoo-oauth";

export const runtime = "nodejs";

function finish(status: "connected" | "error") {
  const destination = new URL("/web-sales/automation/api-connections", YAHOO_OAUTH_ORIGIN);
  destination.searchParams.set("yahoo", status);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(YAHOO_OAUTH_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: YAHOO_OAUTH_COOKIE_PATH, maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  // Never reflect the callback's code, state, provider error, or request URL.
  if (!await isFinanceAdmin()) return finish("error");
  try {
    if (request.nextUrl.origin + request.nextUrl.pathname !== YAHOO_OAUTH_CALLBACK) return finish("error");
    const session = await getServerSession(authOptions);
    const user = session?.user?.email;
    if (!user) return finish("error");
    const values = await getApiCredentials(["YAHOO_SHOPPING_CLIENT_ID", "YAHOO_SHOPPING_CLIENT_SECRET", "YAHOO_SHOPPING_SELLER_ID"]);
    if (!values.YAHOO_SHOPPING_CLIENT_ID || !values.YAHOO_SHOPPING_CLIENT_SECRET || !values.YAHOO_SHOPPING_SELLER_ID) return finish("error");
    const verified = validateYahooOAuthCallback(request.cookies.get(YAHOO_OAUTH_COOKIE)?.value, request.nextUrl.searchParams, user, values.YAHOO_SHOPPING_CLIENT_ID, process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY);
    await assertApiCredentialPersistence();
    const tokens = await exchangeYahooOAuthCode(verified.code, verified.verifier, values.YAHOO_SHOPPING_CLIENT_ID, values.YAHOO_SHOPPING_CLIENT_SECRET);
    await saveRotatedApiCredentials({ YAHOO_SHOPPING_ACCESS_TOKEN: tokens.accessToken, YAHOO_SHOPPING_REFRESH_TOKEN: tokens.refreshToken });
    // Connected describes durable OAuth tokens; Orders approval is checked by
    // the actual read API, rather than claiming it from successful OAuth alone.
    return finish("connected");
  } catch {
    return finish("error");
  }
}
