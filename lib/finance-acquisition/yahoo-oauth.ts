import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptApiCredential, encryptApiCredential } from "./credential-crypto";

// Verified against the existing TSA app in Yahoo's application dashboard.
export const YAHOO_OAUTH_ORIGIN = "https://v0-tsa-19.vercel.app";
export const YAHOO_OAUTH_CALLBACK = `${YAHOO_OAUTH_ORIGIN}/api/web-sales/automation/oauth/yahoo/callback`;
export const YAHOO_OAUTH_COOKIE = "__Secure-tsa-yahoo-oauth";
export const YAHOO_OAUTH_COOKIE_PATH = "/api/web-sales/automation/oauth/yahoo";
export const YAHOO_OAUTH_TTL = 600;
const COOKIE_CONTEXT = "yahoo_oauth_browser_state_v1";
const AUTHORIZATION_ENDPOINT = "https://auth.login.yahoo.co.jp/yconnect/v2/authorization";
const TOKEN_ENDPOINT = "https://auth.login.yahoo.co.jp/yconnect/v2/token";

type BrowserState = {
  state: string;
  verifier: string;
  userHash: string;
  clientHash: string;
  issuedAt: number;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function equal(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createYahooOAuthStart(user: string, clientId: string, key: string | undefined, now = Date.now()) {
  if (!user || !clientId) throw new Error("Yahoo接続の開始条件が不足しています");
  const value: BrowserState = {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    userHash: hash(user.toLowerCase()),
    clientHash: hash(clientId),
    issuedAt: now,
  };
  const authorization = new URL(AUTHORIZATION_ENDPOINT);
  authorization.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: YAHOO_OAUTH_CALLBACK,
    // Yahoo Shopping's official sample requests these scopes. Orders eligibility
    // remains a separate application approval; no invented read_orders scope.
    scope: "openid profile",
    state: value.state,
    code_challenge: hash(value.verifier),
    code_challenge_method: "S256",
    bail: "1",
    prompt: "consent",
  }).toString();
  return { authorizationUrl: authorization.toString(), cookie: encryptApiCredential(COOKIE_CONTEXT, JSON.stringify(value), key) };
}

export function validateYahooOAuthCallback(cookie: string | undefined, query: URLSearchParams, user: string, clientId: string, key: string | undefined, now = Date.now()): { code: string; verifier: string } {
  if (!cookie || cookie.length > 2400 || !user || !clientId) throw new Error("Yahoo接続の確認情報がありません");
  const fields = cookie.split(":");
  if (fields.length !== 4 || fields[0] !== "v1" || fields.slice(1).some(field => !/^[A-Za-z0-9+/]+={0,2}$/.test(field) || Buffer.from(field, "base64").toString("base64") !== field)) {
    throw new Error("Yahoo接続の確認情報が正しくありません");
  }
  let value: BrowserState;
  try { value = JSON.parse(decryptApiCredential(COOKIE_CONTEXT, cookie, key)); }
  catch { throw new Error("Yahoo接続の確認情報が正しくありません"); }
  const state = query.get("state");
  if (!value || typeof value.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.state)
    || typeof value.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.verifier)
    || typeof value.userHash !== "string" || typeof value.clientHash !== "string"
    || !Number.isSafeInteger(value.issuedAt) || now < value.issuedAt || now - value.issuedAt > YAHOO_OAUTH_TTL * 1000
    || query.getAll("state").length !== 1 || !state || !equal(value.state, state)
    || !equal(value.userHash, hash(user.toLowerCase())) || !equal(value.clientHash, hash(clientId))) {
    throw new Error("Yahoo接続の確認情報が一致しないか期限切れです");
  }
  const code = query.get("code");
  if (query.has("error") || query.getAll("code").length !== 1 || !code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) {
    throw new Error("Yahoo接続が承認されていないか認可コードが正しくありません");
  }
  return { code, verifier: value.verifier };
}

export async function exchangeYahooOAuthCode(code: string, verifier: string, clientId: string, clientSecret: string, fetcher: typeof fetch = fetch): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetcher(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: YAHOO_OAUTH_CALLBACK, code_verifier: verifier }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Yahooのトークン交換に失敗しました");
  const raw = await response.text();
  if (raw.length > 16000) throw new Error("Yahooの認証応答が正しくありません");
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw); } catch { throw new Error("Yahooの認証応答が正しくありません"); }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.access_token !== "string" || !/^[\x21-\x7e]{1,3072}$/.test(value.access_token)
    || typeof value.refresh_token !== "string" || !/^[\x21-\x7e]{1,512}$/.test(value.refresh_token)
    || typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer"
    || typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
    throw new Error("Yahooの認証応答に必要な情報がありません");
  }
  return { accessToken: value.access_token, refreshToken: value.refresh_token };
}
