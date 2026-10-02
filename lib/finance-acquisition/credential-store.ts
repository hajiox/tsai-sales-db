import { createClient } from "@supabase/supabase-js";
import { encryptApiCredential, decryptApiCredential } from "./credential-crypto";

// Only server-owned API settings may be saved here. Never expose values in a status response.
export const API_CREDENTIAL_NAMES = [
  "AMAZON_SP_API_CLIENT_ID", "AMAZON_SP_API_CLIENT_SECRET", "AMAZON_SP_API_REFRESH_TOKEN", "AMAZON_SP_API_ACCESS_TOKEN",
  "AMAZON_SP_API_MARKETPLACE_ID", "AMAZON_SP_API_SELLER_ID",
  "AMAZON_ADS_CLIENT_ID", "AMAZON_ADS_CLIENT_SECRET", "AMAZON_ADS_REFRESH_TOKEN", "AMAZON_ADS_PROFILE_ID",
  "RAKUTEN_RMS_SERVICE_SECRET", "RAKUTEN_RMS_LICENSE_KEY",
  "YAHOO_SHOPPING_CLIENT_ID", "YAHOO_SHOPPING_CLIENT_SECRET", "YAHOO_SHOPPING_REFRESH_TOKEN", "YAHOO_SHOPPING_ACCESS_TOKEN", "YAHOO_SHOPPING_SELLER_ID",
  "BASE_CLIENT_ID", "BASE_CLIENT_SECRET", "BASE_REFRESH_TOKEN", "BASE_ACCESS_TOKEN", "BASE_SHOP_ID", "BASE_REDIRECT_URI",
  "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID",
] as const;
const allowed = new Set<string>(API_CREDENTIAL_NAMES);

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("API接続情報の保存先が未設定です");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getApiCredentials(names: readonly string[]): Promise<Record<string, string>> {
  if (names.some(name => !allowed.has(name))) throw new Error("許可されていないAPI設定です");
  const values: Record<string, string> = {};
  for (const name of names) if (process.env[name]?.trim()) values[name] = process.env[name]!.trim();
  const { data, error } = await client().from("web_sales_api_credentials").select("name,ciphertext").in("name", [...names]);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return values;
    throw new Error("API接続情報を読み出せません");
  }
  for (const row of data || []) values[row.name] = decryptApiCredential(row.name, row.ciphertext, process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY);
  return values;
}

export async function getApiCredential(name: string): Promise<string | undefined> {
  return (await getApiCredentials([name]))[name];
}

export async function requireApiCredential(name: string): Promise<string> {
  const value = await getApiCredential(name);
  if (!value) throw new Error(`未設定: ${name}`);
  return value;
}

export async function getConfiguredApiCredentialNames(): Promise<Set<string>> {
  const names = new Set(API_CREDENTIAL_NAMES.filter(name => Boolean(process.env[name]?.trim())) as string[]);
  const { data, error } = await client().from("web_sales_api_credentials").select("name");
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error("API接続状態を取得できません");
  for (const row of data || []) if (allowed.has(row.name)) names.add(row.name);
  return names;
}

export async function assertApiCredentialPersistence(): Promise<void> {
  const value = process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || Buffer.from(value, "base64").length !== 32) throw new Error("API認証更新の安全な保存先が未設定です");
  const { error } = await client().from("web_sales_api_credentials").select("name").limit(1);
  if (error) throw new Error("API認証更新の安全な保存先を確認できません");
}

export async function saveRotatedApiCredentials(values: Record<string, string>): Promise<void> {
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([name, value]) => !allowed.has(name) || typeof value !== "string" || !value.trim() || value.length > 16000)) {
    throw new Error("API接続情報が正しくありません");
  }
  const key = process.env.FINANCE_API_CREDENTIAL_ENCRYPTION_KEY;
  const rows = entries.map(([name, value]) => ({ name, ciphertext: encryptApiCredential(name, value.trim(), key), updated_at: new Date().toISOString() }));
  const { error } = await client().from("web_sales_api_credentials").upsert(rows, { onConflict: "name" });
  if (error) throw new Error("API接続情報を保存できません");
}
